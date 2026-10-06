import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../lib/format';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'xs' | 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-strong text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(122,162,217,0.38),0_1px_2px_rgba(0,0,0,0.5)] hover:bg-accent-hover disabled:bg-s-4 disabled:text-fg-4 disabled:shadow-[inset_0_0_0_1px_var(--color-line-3)]',
  secondary:
    'bg-s-3 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_var(--color-line-3),0_1px_2px_rgba(0,0,0,0.4)] hover:bg-s-4 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_var(--color-line-4),0_1px_2px_rgba(0,0,0,0.4)] disabled:text-fg-4 disabled:bg-s-2',
  outline:
    'bg-transparent text-fg-2 shadow-[inset_0_0_0_1px_var(--color-line-3)] hover:text-fg hover:bg-white/[0.03] hover:shadow-[inset_0_0_0_1px_var(--color-line-4)] disabled:text-fg-4',
  ghost: 'bg-transparent text-fg-2 hover:text-fg hover:bg-white/[0.045] disabled:text-fg-4 disabled:hover:bg-transparent',
  danger:
    'bg-red/[0.09] text-[#ff8a85] shadow-[inset_0_0_0_1px_rgba(239,100,97,0.28)] hover:bg-red/[0.15] hover:shadow-[inset_0_0_0_1px_rgba(239,100,97,0.45)] disabled:text-fg-4 disabled:bg-s-2 disabled:shadow-[inset_0_0_0_1px_var(--color-line-2)]',
};

const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-xs gap-1 rounded-[5px]',
  sm: 'h-7 px-2.5 text-sm gap-1.5 rounded-sm',
  md: 'h-8 px-3 text-sm gap-2 rounded-md',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
  kbd?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon: Icon, iconRight: IconR, loading, children, className, disabled, kbd, ...rest },
  ref,
) {
  const iconSize = size === 'xs' ? 12 : 14;
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.975 }}
      transition={{ duration: 0.12 }}
      disabled={disabled || loading}
      className={cx(
        'focus-ring relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,box-shadow,color] duration-150 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        loading && 'cursor-progress',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : Icon && <Icon size={iconSize} strokeWidth={2} className="-ml-0.5 shrink-0" />}
      {children}
      {IconR && <IconR size={iconSize} strokeWidth={2} className="-mr-0.5 shrink-0 opacity-70" />}
      {kbd && <span className="ml-1 rounded-[3px] bg-black/20 px-1 font-mono text-2xs opacity-70">{kbd}</span>}
    </motion.button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'children'> & { label: string }>(
  function IconButton({ icon: Icon, size = 'sm', variant = 'ghost', className, label, ...rest }, ref) {
    const dim = size === 'xs' ? 'h-6 w-6 rounded-[5px]' : size === 'sm' ? 'h-7 w-7 rounded-sm' : 'h-8 w-8 rounded-md';
    return (
      <motion.button
        ref={ref}
        aria-label={label}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.12 }}
        className={cx(
          'focus-ring inline-flex shrink-0 items-center justify-center transition-[background,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-40',
          variants[variant],
          dim,
          className,
        )}
        {...rest}
      >
        {Icon && <Icon size={size === 'xs' ? 13 : 15} strokeWidth={1.9} />}
      </motion.button>
    );
  },
);
