import { useCallback } from 'react';
import { Collection } from '../types';
import { usePersistedState } from './usePersistedState';

export function useCollections() {
  const [collections, setCollections] = usePersistedState<Collection[]>('bgm-hunter-collections', []);

  const save = useCallback(
    (updatedCollections: Collection[]) => {
      setCollections(updatedCollections);
    },
    [setCollections]
  );

  const isTrackInCollection = useCallback(
    (trackId: string): boolean => {
      return collections.some((collection) => collection.tracks.some((t) => t.id === trackId));
    },
    [collections]
  );

  return { collections, save, isTrackInCollection };
}

