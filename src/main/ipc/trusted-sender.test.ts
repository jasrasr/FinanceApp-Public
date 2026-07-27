// @vitest-environment node

import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { createTrustedSenderValidator } from './trusted-sender';

const createEvent = (frameUrl: string, isMainFrame = true): IpcMainInvokeEvent => {
  const mainFrame = { url: frameUrl };

  return {
    sender: { mainFrame },
    senderFrame: isMainFrame ? mainFrame : { url: frameUrl },
  } as unknown as IpcMainInvokeEvent;
};

describe('trusted IPC sender validation', () => {
  const validate = createTrustedSenderValidator('http://localhost:5173/');

  it('accepts only the configured application main frame', () => {
    expect(validate(createEvent('http://localhost:5173/'))).toBe(true);
    expect(validate(createEvent('http://localhost:5173/', false))).toBe(false);
    expect(validate(createEvent('https://example.invalid/'))).toBe(false);
  });
});
