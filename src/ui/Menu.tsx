import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { cx } from '../lib/format';

export interface MenuItem {
  label?: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  checked?: boolean;
  separator?: boolean;
  heading?: string;
  hint?: string;
}

/* ─── global context-menu host ─── */
interface CtxState {
  x: number;
  y: number;
  items: MenuItem[];
}
const MenuCtx = createContext<(s: CtxState | null) => void>(() => {});

export function MenuHost({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<CtxState | null>(null);
  return (
    <MenuCtx.Provider value={setCtx}>
      {children}
      <FloatingMenu open={!!ctx} x={ctx?.x ?? 0} y={ctx?.y ?? 0} items={ctx?.items ?? []} onClose={() => setCtx(null)} />
    </MenuCtx.Provider>
  );
}

export function useContextMenu(items: MenuItem[] | (() => MenuItem[])) {
  const open = useContext(MenuCtx);
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    open({ x: e.clientX, y: e.clientY, items: typeof items === 'function' ? items() : items });
  };
}

/* ─── dropdown anchored to a trigger ─── */
export function Dropdown({
  trigger,
  items,
  align = 'end',
  width = 208,
}: {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; 'data-open': boolean }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  width?: number;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = anchor.current!.getBoundingClientRect();
    setPos({ x: align === 'end' ? r.right - width : r.left, y: r.bottom + 6 });
  };
  return (
    <span ref={anchor} className="inline-flex">
      {trigger({ onClick, 'data-open': !!pos })}
      <FloatingMenu open={!!pos} x={pos?.x ?? 0} y={pos?.y ?? 0} items={items} onClose={() => setPos(null)} width={width} />
    </span>
  );
}

function FloatingMenu({
  open,
  x,
  y,
  items,
  onClose,
  width = 208,
}: {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [adj, setAdj] = useState({ x, y });
  const [active, setActive] = useState(-1);
  const activeRef = useRef(-1);
  activeRef.current = active;

  useLayoutEffect(() => {
    if (!open) return;
    const h = ref.current?.offsetHeight ?? 0;
    setAdj({
      x: Math.min(Math.max(8, x), window.innerWidth - width - 8),
      y: y + h > window.innerHeight - 8 ? Math.max(8, y - h - 12) : y,
    });
    setActive(-1);
  }, [open, x, y, width]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      const selectable = items.map((it, i) => (!it.separator && !it.heading && !it.disabled ? i : -1)).filter((i) => i >= 0);
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => {
          const idx = selectable.indexOf(a);
          const n = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
          return selectable[(n + selectable.length) % selectable.length];
        });
      }
      if (e.key === 'Enter' && activeRef.current >= 0) {
        e.preventDefault();
        items[activeRef.current].onSelect?.();
        onClose();
      }
    };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [open, items, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.09 } }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          style={{ left: adj.x, top: adj.y, width, transformOrigin: 'top' }}
          className="glass fixed z-[90] rounded-lg p-1"
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((it, i) => {
            if (it.separator) return <div key={i} className="mx-1 my-1 h-px bg-line-3/70" />;
            if (it.heading)
              return (
                <div key={i} className="px-2 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-fg-4 uppercase">
                  {it.heading}
                </div>
              );
            const Icon = it.icon;
            return (
              <button
                key={i}
                disabled={it.disabled}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(-1)}
                onClick={() => {
                  it.onSelect?.();
                  onClose();
                }}
                className={cx(
                  'flex h-7 w-full items-center gap-2 rounded-[5px] px-2 text-left text-sm transition-colors duration-75 outline-none',
                  it.disabled ? 'text-fg-4' : it.danger ? 'text-[#ff8784]' : 'text-fg',
                  active === i && !it.disabled && (it.danger ? 'bg-red/12' : 'bg-white/[0.07]'),
                )}
              >
                {Icon ? <Icon size={14} strokeWidth={1.9} className={cx('shrink-0', it.danger ? '' : 'text-fg-3', active === i && !it.danger && 'text-fg-2')} /> : it.checked !== undefined ? <span className="w-3.5" /> : null}
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-xs text-fg-4">{it.hint}</span>}
                {it.checked && <Check size={13} className="text-accent" />}
                {it.shortcut && <span className="font-mono text-2xs text-fg-4">{it.shortcut}</span>}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
