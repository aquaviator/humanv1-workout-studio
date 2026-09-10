import { useState, useCallback } from 'react';

export function useHistory<T>(initialState: T) {
  const [history, setHistory] = useState<{ entries: T[]; pointer: number }>(() => ({ entries: [initialState], pointer: 0 }));

  const set = useCallback((nextState: T | ((current: T) => T)) => {
    setHistory(previous => {
      const entries = previous.entries.slice(0, previous.pointer + 1);
      const current = entries[entries.length - 1];
      entries.push(typeof nextState === 'function' ? (nextState as (value: T) => T)(current) : nextState);
      return { entries, pointer: entries.length - 1 };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(previous => ({ ...previous, pointer: Math.max(0, previous.pointer - 1) }));
  }, []);

  const redo = useCallback(() => {
    setHistory(previous => ({ ...previous, pointer: Math.min(previous.entries.length - 1, previous.pointer + 1) }));
  }, []);

  const reset = useCallback((newState: T) => {
    setHistory({ entries: [newState], pointer: 0 });
  }, []);

  return {
    state: history.entries[history.pointer],
    set,
    reset,
    undo,
    redo,
    canUndo: history.pointer > 0,
    canRedo: history.pointer < history.entries.length - 1,
  };
}
