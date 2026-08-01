import type { ReactNode } from 'react';

export interface ConfirmationDialogProps {
  readonly busy: boolean;
  readonly children?: ReactNode;
  readonly confirmLabel: string;
  readonly description: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
}

export const ConfirmationDialog = ({
  busy,
  confirmLabel,
  description,
  children,
  onCancel,
  onConfirm,
  title,
}: ConfirmationDialogProps): React.JSX.Element => (
  <div
    aria-labelledby="confirmation-title"
    aria-modal="true"
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6"
    role="dialog"
  >
    <div className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
      <h2 className="text-xl font-semibold text-slate-950" id="confirmation-title">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
      <div className="mt-6 flex justify-end gap-3">
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? 'Saving…' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
