import { useState, useCallback } from 'react';

export function useHistory<T>(initialState: T) {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [pointer, setPointer] = useState<number>(0);

  const set = useCallback((newState: T) => {
    setHistory((prev) => {
      const copy = prev.slice(0, pointer + 1);
      copy.push(newState);
      return copy;
    });
    setPointer((prev) => prev + 1);
  }, [pointer]);

  const undo = useCallback(() => {
    setPointer((prev) => Math.max(0, prev - 1));
  }, []);

  const redo = useCallback(() => {
    setPointer((prev) => Math.min(history.length - 1, prev + 1));
  }, [history.length]);

  return {
    state: history[pointer],
    set,
    undo,
    redo,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
  };
}
