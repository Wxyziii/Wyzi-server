import { useSyncExternalStore } from 'react';

type SetState<T> = (partial: Partial<T> | ((s: T) => Partial<T>)) => void;

/** Tiny zustand-style store. Selectors must return stable references or primitives. */
export function createStore<T extends object>(init: (set: SetState<T>, get: () => T) => T) {
  let state: T;
  const listeners = new Set<() => void>();
  const set: SetState<T> = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };
  const get = () => state;
  state = init(set, get);
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  function useStore<S>(selector: (s: T) => S): S {
    return useSyncExternalStore(subscribe, () => selector(state));
  }
  useStore.getState = get;
  useStore.setState = set;
  useStore.subscribe = subscribe;
  return useStore;
}
