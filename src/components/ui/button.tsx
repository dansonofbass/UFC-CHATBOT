import { Slot } from '@radix-ui/react-slot';
import { clsx } from 'clsx';
import type { ComponentProps } from 'react';
export function Button({
  asChild = false,
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { asChild?: boolean; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={clsx('button', `button-${variant}`, className)} {...props} />;
}
