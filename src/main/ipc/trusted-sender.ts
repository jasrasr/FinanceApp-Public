import type { IpcMainInvokeEvent } from 'electron';

export type TrustedSenderValidator = (event: IpcMainInvokeEvent) => boolean;

const normalizedContentLocation = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  return url.toString();
};

export const createTrustedSenderValidator = (
  trustedRendererLocation: string,
): TrustedSenderValidator => {
  const trustedLocation = normalizedContentLocation(trustedRendererLocation);

  return (event) => {
    const senderFrame = event.senderFrame;

    if (!senderFrame || senderFrame !== event.sender.mainFrame) {
      return false;
    }

    try {
      return normalizedContentLocation(senderFrame.url) === trustedLocation;
    } catch {
      return false;
    }
  };
};
