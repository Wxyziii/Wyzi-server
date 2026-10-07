import { Component, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './Button';

/** Keeps a crash in one page from blanking the whole portal. Reset when the route changes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    console.error('page crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="surface mx-auto mt-10 max-w-[520px] rounded-xl p-6">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <TriangleAlert size={15} className="text-amber" /> This page hit an error
        </div>
        <p className="mt-1.5 text-xs text-fg-3">The rest of the portal still works. Other pages are available from the sidebar.</p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-line-2 bg-bg-1 p-3 font-mono text-[11px] text-fg-2">{String(this.state.error.message || this.state.error)}</pre>
        <Button className="mt-4" variant="secondary" icon={RefreshCw} onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}
