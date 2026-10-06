# WYZI Server — frontend prototype

Clickable, high-fidelity prototype of a local-only home server portal (Minecraft hosting).
All data is simulated in the browser; nothing is executed on any machine.

## Run

    npm install
    npm run dev        # http://localhost:5173

## Things to try

- Dashboard → **Wake** Cobblemon while Prominence II runs → memory-safety dialog → swap servers
- Start **Vanilla** (2 GB fits) → animated startup sequence → Running
- Server detail → **Console** tab → `say test`, `list`, `tps`, `help`, `stop` (↑ for history, Tab to complete)
- Right-click any server row, backup row, player or file for context menus
- **Backups** → Create backup → live progress
- **Network** → Copy Address (real clipboard) / Restart Tunnel
- **Settings** → Compact mode and Animations actually apply; memory headroom changes what's "safe"
- Search button / Ctrl K → command palette · Ctrl B → collapse sidebar

## Structure

- `src/index.css` — design tokens (colors, type scale, radii, shadows, surfaces)
- `src/ui/` — custom primitives: Button, Status, Tooltip, Menu, Controls, Charts, Overlay, Layout
- `src/shell/` — sidebar, top bar, command palette, RAM-conflict modal
- `src/pages/` — Dashboard, Servers, server detail tabs, Storage, Backups, Network, System, Logs, Settings
- `src/lib/store.ts` — mock data, fake actions and the live simulation loop
