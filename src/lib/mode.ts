/**
 * Data source selection.
 *  - mock: the original prototype simulation, entirely in the browser.
 *  - live: the FastAPI backend on the server (REST + WebSocket).
 *
 * Production builds default to live and never fall back to fake data; when the
 * backend is unreachable the UI shows an explicit connection state instead.
 * `npm run dev` defaults to mock; use `npm run dev:live` to develop against a backend.
 */
const env = import.meta.env.VITE_WYZI_MODE as string | undefined;
export const DATA_MODE: 'mock' | 'live' = env === 'mock' || env === 'live' ? env : import.meta.env.DEV ? 'mock' : 'live';
export const IS_LIVE = DATA_MODE === 'live';
