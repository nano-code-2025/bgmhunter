import { useState, useCallback } from 'react';

export function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;
    try {
      return JSON.parse(saved) as T;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback(
    (value: T) => {
      setState(value);
      localStorage.setItem(key, JSON.stringify(value));
    },
    [key]
  );

  return [state, setPersistedState];
}

