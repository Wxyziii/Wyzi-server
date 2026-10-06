import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cx } from '../lib/format';

interface Props {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  delay?: number;
  className?: string;
  kbd?: string;
  style?: React.CSSProperties;
}

export function Tooltip({ content, children, side = 'top', delay = 350, className, kbd, style }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: string } | null>(null);
  const timer = useRef<number>(0);

  const show = () => {
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      let s = side;
      if (s === 'top' && r.top < 40) s = 'bottom';
      if (s === 'right') setPos({ x: r.right + 8, y: r.top + r.height / 2, side: s });
      else setPos({ x: r.left + r.width / 2, y: s === 'top' ? r.top - 6 : r.bottom + 6, side: s });
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} className={cx('inline-flex', className)} style={style}>
      {children}
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.08 } }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none fixed z-[100]"
              style={{
                left: pos.x,
                top: pos.y,
                translate: pos.side === 'right' ? '0 -50%' : pos.side === 'top' ? '-50% -100%' : '-50% 0',
              }}
            >
              <div className="flex max-w-64 items-center gap-2 rounded-md border border-line-3 bg-s-4 px-2 py-1 text-xs text-fg shadow-[var(--shadow-pop)]">
                <span>{content}</span>
                {kbd && <span className="rounded-[3px] border border-line-3 bg-s-2 px-1 font-mono text-2xs text-fg-3">{kbd}</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
