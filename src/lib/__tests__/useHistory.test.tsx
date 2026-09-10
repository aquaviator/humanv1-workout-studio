import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHistory } from '../useHistory';

describe('useHistory', () => {
  it('keeps state defined across multiple updates in one render turn', () => {
    const { result } = renderHook(() => useHistory({ value: 0 }));
    act(() => {
      result.current.set({ value: 1 });
      result.current.set({ value: 2 });
    });
    expect(result.current.state).toEqual({ value: 2 });
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.state).toEqual({ value: 1 });
  });

  it('applies functional updates to the latest entry without losing concurrent fields', () => {
    const { result } = renderHook(() => useHistory({ title: 'one', release: 'pending' }));
    act(() => {
      result.current.set(current => ({ ...current, title: 'two' }));
      result.current.set(current => ({ ...current, release: 'verified' }));
    });
    expect(result.current.state).toEqual({ title: 'two', release: 'verified' });
  });
});
