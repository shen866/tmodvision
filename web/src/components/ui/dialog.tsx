import React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode }) => {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = ref.current;
    if (open) dialog?.showModal();
    return () => dialog?.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} aria-label="操作确认"
      onCancel={event => { event.preventDefault(); onOpenChange(false); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onOpenChange(false);
      }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-lg bg-background p-6 text-foreground shadow-lg backdrop:bg-black/50">
      {children}
    </dialog>
  );
};

export const DialogHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mb-4', className)}>{children}</div>
);

export const DialogTitle = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h2 className={cn('text-lg font-semibold', className)}>{children}</h2>
);

export const DialogDescription = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
);

export const DialogFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mt-4 flex justify-end gap-2', className)}>{children}</div>
);
