import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useApp, dismissToast } from '../lib/store';
import { cx } from '../lib/format';

export function Modal({ open, onClose, children, width = 480 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[14vh]">
          <motion.div
            className="absolute inset-0 bg-[#020203]/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.985, transition: { duration: 0.14 } }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full overflow-hidden rounded-xl border border-line-3 bg-s-2 shadow-[var(--shadow-modal)]"
            style={{ maxWidth: width }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const toastIcon = {
  success: [CheckCircle2, 'text-mint'],
  info: [Info, 'text-blue'],
  warn: [AlertTriangle, 'text-amber'],
  error: [XCircle, 'text-red'],
} as const;

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[95] flex w-80 flex-col-reverse gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const [Icon, color] = toastIcon[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="glass pointer-events-auto flex items-start gap-2.5 rounded-lg px-3 py-2.5"
            >
              <Icon size={15} className={cx('mt-0.5 shrink-0', color)} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{t.title}</div>
                {t.desc && <div className="mt-0.5 truncate text-xs text-fg-3">{t.desc}</div>}
              </div>
              <button onClick={() => dismissToast(t.id)} className="-mr-1 rounded p-0.5 text-fg-4 hover:text-fg-2">
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
