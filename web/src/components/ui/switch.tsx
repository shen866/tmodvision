import React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <label className={cn('relative inline-flex cursor-pointer items-center', className)}>
      <input
        type="checkbox"
        ref={ref}
        className="peer sr-only"
        onChange={(e) => {
          onChange?.(e);
          onCheckedChange?.(e.target.checked);
        }}
        {...props}
      />
      <div className="h-6 w-11 rounded-full bg-muted-foreground/30 transition peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2" />
      <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition peer-checked:translate-x-5" />
    </label>
  )
);
Switch.displayName = 'Switch';
