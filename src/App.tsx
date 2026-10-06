import { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { useRoute } from './lib/router';
import { startSimulation, useApp } from './lib/store';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';
import { RamConflictModal } from './shell/RamConflict';
import { CommandPalette } from './shell/CommandPalette';
import { MenuHost } from './ui/Menu';
import { Toaster } from './ui/Overlay';
import { Dashboard } from './pages/Dashboard';
import { Servers } from './pages/Servers';
import { ServerDetail } from './pages/detail/ServerDetail';
import { Storage } from './pages/Storage';
import { Backups } from './pages/Backups';
import { NetworkPage } from './pages/Network';
import { SystemPage } from './pages/System';
import { Logs } from './pages/Logs';
import { SettingsPage } from './pages/Settings';

export default function App() {
  const route = useRoute();
  const compact = useApp((s) => s.settings.compact);
  const animations = useApp((s) => s.settings.animations);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100);
  const [manual, setManual] = useState<boolean | null>(null);
  const collapsed = manual ?? narrow;

  useEffect(() => startSimulation(), []);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener('resize', on);
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setManual((m) => !(m ?? window.innerWidth < 1100));
      }
    };
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('keydown', k);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('compact', compact);
    document.documentElement.classList.toggle('no-motion', !animations);
  }, [compact, animations]);

  const key = route.page + (route.serverId ?? '');
  useEffect(() => {
    document.getElementById('scroll')?.scrollTo({ top: 0 });
  }, [key]);
  let page: React.ReactNode;
  if (route.page === 'servers' && route.serverId) page = <ServerDetail id={route.serverId} tab={route.tab ?? 'overview'} />;
  else
    page = {
      dashboard: <Dashboard />,
      servers: <Servers />,
      storage: <Storage />,
      backups: <Backups />,
      network: <NetworkPage />,
      system: <SystemPage />,
      logs: <Logs />,
      settings: <SettingsPage />,
    }[route.page] ?? <Dashboard />;

  return (
    <MotionConfig reducedMotion={animations ? 'never' : 'always'}>
      <MenuHost>
        <div className="flex h-full w-full bg-bg-0">
          <Sidebar route={route} collapsed={collapsed} />
          <main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line-2 bg-bg-1 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_8px_40px_-12px_rgba(0,0,0,0.8)]">
            {/* faint top sheen on the workspace */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-48 bg-[radial-gradient(ellipse_80%_100%_at_50%_0%,rgba(140,160,200,0.03),transparent)]" />
            <Topbar route={route} onToggle={() => setManual(!collapsed)} />
            <div id="scroll" className="relative z-[1] min-h-0 flex-1 overflow-y-auto">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="mx-auto w-full max-w-[1480px] px-6 pt-6 pb-10 max-md:px-4"
                >
                  {page}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
        <RamConflictModal />
        <CommandPalette />
        <Toaster />
      </MenuHost>
    </MotionConfig>
  );
}
