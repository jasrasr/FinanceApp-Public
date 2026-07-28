import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname, posix } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export type ImportRecordType =
  'debt' | 'transaction' | 'term' | 'balance_snapshot' | 'unknown';
export type ImportActivityClassification = 'actual' | 'projected' | 'ambiguous';

export interface ParsedWorkbook {
  readonly workbookName: string;
  readonly fingerprint: string;
  readonly modifiedAtUtc: string | null;
  readonly sheets: readonly ParsedWorkbookSheet[];
}

export interface ParsedWorkbookSheet {
  readonly name: string;
  readonly proposedRecordType: ImportRecordType;
  readonly fieldMapping: Readonly<Record<string, string>>;
  readonly rows: readonly ParsedWorkbookRow[];
}

export interface ParsedWorkbookRow {
  readonly sheetName: string;
  readonly rowNumber: number;
  readonly cellReferences: Readonly<Record<string, string>>;
  readonly displayedValues: Readonly<Record<string, string>>;
  readonly formulas: Readonly<Record<string, string>>;
  readonly proposedRecordType: ImportRecordType;
  readonly activityClassification: ImportActivityClassification;
  readonly normalizedValues: Readonly<Record<string, string | null>>;
  readonly validationMessages: readonly string[];
  readonly duplicateCandidate: string | null;
  readonly reconciliationException: string | null;
}

interface ZipEntry {
  readonly filename: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly localHeaderOffset: number;
}

interface WorkbookSheetRef {
  readonly name: string;
  readonly path: string;
}

interface ParsedCell {
  readonly address: string;
  readonly rowNumber: number;
  readonly columnNumber: number;
  readonly displayedValue: string;
  readonly formula: string | null;
}

const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 2_000;
const MAX_COLUMNS = 80;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

const decodeXml = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const getAttribute = (text: string, attribute: string): string | null => {
  const match = new RegExp(`${attribute}="([^"]*)"`).exec(text);
  return match ? decodeXml(match[1] ?? '') : null;
};

const normalizeHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const columnNumberFromAddress = (address: string): number => {
  const letters = /^[A-Z]+/.exec(address.toUpperCase())?.[0] ?? 'A';
  return [...letters].reduce(
    (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
    0,
  );
};

const rowNumberFromAddress = (address: string): number =>
  Number(/\d+/.exec(address)?.[0] ?? '1');

const findEndOfCentralDirectory = (buffer: Buffer): number => {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new Error('Workbook is not a supported .xlsx ZIP file.');
};

const readZipEntries = (buffer: Buffer): readonly ZipEntry[] => {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('Workbook ZIP central directory is invalid.');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const filename = buffer
      .subarray(offset + 46, offset + 46 + filenameLength)
      .toString('utf8');

    entries.push({
      filename,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });
    offset += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
};

const readZipText = (
  buffer: Buffer,
  entries: readonly ZipEntry[],
  filename: string,
): string | null => {
  const entry = entries.find((candidate) => candidate.filename === filename);

  if (!entry) return null;

  const offset = entry.localHeaderOffset;

  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('Workbook ZIP local file header is invalid.');
  }

  const filenameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + filenameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  const data =
    entry.compressionMethod === 0
      ? compressed
      : entry.compressionMethod === 8
        ? inflateRawSync(compressed)
        : null;

  if (!data) {
    throw new Error('Workbook uses an unsupported ZIP compression method.');
  }

  return data.toString('utf8');
};

const parseSharedStrings = (xml: string | null): readonly string[] => {
  if (!xml) return [];

  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...(match[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((textMatch) => decodeXml(textMatch[1] ?? ''))
      .join(''),
  );
};

const parseRelationships = (xml: string | null): Readonly<Record<string, string>> => {
  if (!xml) return {};

  return Object.fromEntries(
    [...xml.matchAll(/<Relationship\b([^>]*)\/?>/g)].flatMap((match) => {
      const attributes = match[1] ?? '';
      const id = getAttribute(attributes, 'Id');
      const target = getAttribute(attributes, 'Target');
      return id && target ? [[id, target]] : [];
    }),
  );
};

const parseWorkbookSheetRefs = (
  workbookXml: string,
  relationships: Readonly<Record<string, string>>,
): readonly WorkbookSheetRef[] =>
  [...workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)]
    .slice(0, MAX_SHEETS)
    .flatMap((match) => {
      const attributes = match[1] ?? '';
      const name = getAttribute(attributes, 'name');
      const relationshipId = getAttribute(attributes, 'r:id');
      const target = relationshipId ? relationships[relationshipId] : null;

      if (!name || !target) return [];

      return [
        {
          name,
          path: posix.normalize(posix.join('xl', target)),
        },
      ];
    });

const parseWorksheetCells = (
  worksheetXml: string,
  sharedStrings: readonly string[],
): readonly ParsedCell[] =>
  [...worksheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].flatMap((match) => {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const address = getAttribute(attributes, 'r');

    if (!address) return [];

    const cellType = getAttribute(attributes, 't');
    const valueText = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
    const inlineText = /<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(
      body,
    )?.[1];
    const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1] ?? null;
    const displayedValue =
      cellType === 's'
        ? (sharedStrings[Number(valueText)] ?? '')
        : inlineText
          ? decodeXml(inlineText)
          : decodeXml(valueText);

    return [
      {
        address,
        rowNumber: rowNumberFromAddress(address),
        columnNumber: columnNumberFromAddress(address),
        displayedValue,
        formula: formula ? decodeXml(formula) : null,
      },
    ];
  });

const classifySheet = (headers: readonly string[]): ImportRecordType => {
  const joined = headers.join(' ');

  if (
    /(payment|transaction|draw|borrow|interest|fee|penalty)/.test(joined) ||
    (headers.includes('date') &&
      headers.includes('amount') &&
      headers.includes('description'))
  ) {
    return 'transaction';
  }

  if (/(rate|term|maturity|required_payment|payment_frequency)/.test(joined)) {
    return 'term';
  }

  if (/(statement|ending_balance|confirmed_balance|snapshot|balance)/.test(joined)) {
    return 'balance_snapshot';
  }

  if (/(creditor|principal|origination|debt|loan|account)/.test(joined)) {
    return 'debt';
  }

  return 'unknown';
};

const classifyActivity = (
  recordType: ImportRecordType,
  values: Readonly<Record<string, string>>,
): ImportActivityClassification => {
  if (recordType !== 'transaction') {
    return 'actual';
  }

  const joined = Object.values(values).join(' ').toLowerCase();
  const hasProjected = /(projected|forecast|scenario|budget|planned|future)/.test(
    joined,
  );
  const hasActual = /(actual|posted|cleared|statement|paid)/.test(joined);

  if (hasActual && !hasProjected) return 'actual';
  if (hasProjected && !hasActual) return 'projected';
  return 'ambiguous';
};

const likelyDuplicateKey = (
  recordType: ImportRecordType,
  values: Readonly<Record<string, string>>,
): string | null => {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [normalizeHeader(key), value]),
  );
  const date =
    normalized.date ??
    normalized.effective_date ??
    normalized.posting_date ??
    normalized.statement_date;
  const amount =
    normalized.amount ??
    normalized.payment ??
    normalized.balance ??
    normalized.ending_balance ??
    normalized.principal;
  const name = normalized.name ?? normalized.creditor ?? normalized.account;

  if (!date && !amount && !name) return null;
  return `${recordType}:${name ?? 'unknown'}:${date ?? 'no-date'}:${amount ?? 'no-amount'}`;
};

const validationMessagesForRow = (
  recordType: ImportRecordType,
  activityClassification: ImportActivityClassification,
  normalizedValues: Readonly<Record<string, string | null>>,
): readonly string[] => {
  const messages: string[] = [];

  if (recordType === 'unknown') {
    messages.push('Record type could not be determined from the source row.');
  }

  if (activityClassification === 'ambiguous') {
    messages.push('Actual versus projected classification requires review.');
  }

  if (
    recordType === 'transaction' &&
    !('amount' in normalizedValues) &&
    !('payment' in normalizedValues)
  ) {
    messages.push('No obvious transaction amount field was detected.');
  }

  if (
    recordType === 'balance_snapshot' &&
    !('balance' in normalizedValues) &&
    !('ending_balance' in normalizedValues) &&
    !('confirmed_balance' in normalizedValues)
  ) {
    messages.push('No obvious balance amount field was detected.');
  }

  return messages;
};

const reconciliationExceptionForRow = (
  recordType: ImportRecordType,
  normalizedValues: Readonly<Record<string, string | null>>,
): string | null => {
  if (recordType !== 'balance_snapshot') return null;

  const text = Object.entries(normalizedValues)
    .map(([key, value]) => `${key}:${value ?? ''}`)
    .join(' ')
    .toLowerCase();

  return /(difference|variance|out_of_balance|exception)/.test(text)
    ? 'Source row appears to reference a balance difference or exception.'
    : null;
};

const buildParsedSheet = (
  sheetName: string,
  worksheetXml: string,
  sharedStrings: readonly string[],
): ParsedWorkbookSheet => {
  const cells = parseWorksheetCells(worksheetXml, sharedStrings);
  if (cells.length === 0) {
    return {
      name: sheetName,
      proposedRecordType: 'unknown',
      fieldMapping: {},
      rows: [],
    };
  }

  const headerRowNumber = Math.min(...cells.map((cell) => cell.rowNumber));
  const headerCells = cells
    .filter((cell) => cell.rowNumber === headerRowNumber)
    .sort((first, second) => first.columnNumber - second.columnNumber)
    .slice(0, MAX_COLUMNS);
  const headersByColumn = new Map<number, string>();

  for (const cell of headerCells) {
    headersByColumn.set(
      cell.columnNumber,
      normalizeHeader(cell.displayedValue || `column_${cell.columnNumber}`),
    );
  }

  const headers = [...headersByColumn.values()];
  const proposedRecordType = classifySheet(headers);
  const fieldMapping = Object.fromEntries(headers.map((header) => [header, header]));
  const rowsByNumber = new Map<number, ParsedCell[]>();

  for (const cell of cells.filter(
    (candidate) =>
      candidate.rowNumber > headerRowNumber &&
      candidate.rowNumber <= headerRowNumber + MAX_ROWS_PER_SHEET,
  )) {
    const row = rowsByNumber.get(cell.rowNumber) ?? [];
    row.push(cell);
    rowsByNumber.set(cell.rowNumber, row);
  }
  const rows: ParsedWorkbookRow[] = [];

  for (const [rowNumber, rowCells] of rowsByNumber) {
    const displayedValues: Record<string, string> = {};
    const formulas: Record<string, string> = {};
    const cellReferences: Record<string, string> = {};
    const normalizedValues: Record<string, string | null> = {};

    for (const cell of rowCells) {
      const header = headersByColumn.get(cell.columnNumber);

      if (!header) continue;

      cellReferences[header] = cell.address;
      displayedValues[header] = cell.displayedValue;
      normalizedValues[header] =
        cell.displayedValue.trim() === '' ? null : cell.displayedValue.trim();

      if (cell.formula) {
        formulas[header] = cell.formula;
      }
    }

    if (Object.keys(displayedValues).length === 0) continue;

    const activityClassification = classifyActivity(
      proposedRecordType,
      displayedValues,
    );
    const validationMessages = validationMessagesForRow(
      proposedRecordType,
      activityClassification,
      normalizedValues,
    );

    rows.push({
      sheetName,
      rowNumber,
      cellReferences,
      displayedValues,
      formulas,
      proposedRecordType,
      activityClassification,
      normalizedValues,
      validationMessages,
      duplicateCandidate: likelyDuplicateKey(proposedRecordType, displayedValues),
      reconciliationException: reconciliationExceptionForRow(
        proposedRecordType,
        normalizedValues,
      ),
    });
  }

  return {
    name: sheetName,
    proposedRecordType,
    fieldMapping,
    rows,
  };
};

export const parseWorkbookForImport = (workbookPath: string): ParsedWorkbook => {
  if (extname(workbookPath).toLowerCase() !== '.xlsx') {
    throw new Error('Only .xlsx workbooks are supported for staged import.');
  }

  const buffer = readFileSync(workbookPath);
  const entries = readZipEntries(buffer);
  const workbookXml = readZipText(buffer, entries, 'xl/workbook.xml');

  if (!workbookXml) {
    throw new Error('Workbook is missing xl/workbook.xml.');
  }

  const sharedStrings = parseSharedStrings(
    readZipText(buffer, entries, 'xl/sharedStrings.xml'),
  );
  const relationships = parseRelationships(
    readZipText(buffer, entries, 'xl/_rels/workbook.xml.rels'),
  );
  const sheetRefs = parseWorkbookSheetRefs(workbookXml, relationships);
  const sheets = sheetRefs.flatMap((sheetRef) => {
    const worksheetXml = readZipText(buffer, entries, sheetRef.path);
    return worksheetXml
      ? [buildParsedSheet(sheetRef.name, worksheetXml, sharedStrings)]
      : [];
  });
  const fileStat = statSync(workbookPath);

  return {
    workbookName: basename(workbookPath),
    fingerprint: createHash('sha256').update(buffer).digest('hex'),
    modifiedAtUtc: fileStat.mtime.toISOString(),
    sheets,
  };
};
