import type { ReactNode } from 'react';

export interface FieldProps {
  readonly children: ReactNode;
  readonly error?: readonly string[];
  readonly hint?: string;
  readonly label: string;
  readonly name: string;
  readonly optional?: boolean;
}

export const Field = ({
  children,
  error,
  hint,
  label,
  name,
  optional = false,
}: FieldProps): React.JSX.Element => {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800" htmlFor={name}>
        {label}
        {optional ? (
          <span className="ml-1 font-normal text-slate-500">(optional)</span>
        ) : (
          <span className="ml-1 text-slate-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="mt-1">{children}</div>
      {hint ? (
        <p className="mt-1 text-xs leading-5 text-slate-500" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error?.map((message) => (
        <p
          className="mt-1 text-sm font-medium text-red-700"
          id={errorId}
          key={message}
          role="alert"
        >
          {message}
        </p>
      ))}
    </div>
  );
};

export const FormActions = ({
  busy,
  cancelLabel = 'Cancel',
  onCancel,
  submitLabel,
}: {
  readonly busy: boolean;
  readonly cancelLabel?: string;
  readonly onCancel: () => void;
  readonly submitLabel: string;
}): React.JSX.Element => (
  <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
    <button
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-blue-200 focus:outline-none"
      onClick={onCancel}
      type="button"
    >
      {cancelLabel}
    </button>
    <button
      className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      disabled={busy}
      type="submit"
    >
      {busy ? 'Saving…' : submitLabel}
    </button>
  </div>
);
