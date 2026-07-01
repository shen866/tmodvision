import React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
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
