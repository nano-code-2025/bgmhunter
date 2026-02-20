/**
 * Session Memory — tracks recently shown track IDs within a browser session.
 *
 * Stored in memory (cleared on page reload). Used by:
 * - RankingEngine: novelty penalty for recently shown tracks.
 * - Refresh/Shuffle: enforce novelty ratio (>= 60% new tracks per batch).
 *
 * Capacity: last 200 track IDs (ring buffer).
 */
import { MusicTrack } from '../types';

const MAX_CAPACITY = 200;

class SessionMemory {
  private recentIds: string[] = [];
  private idSet: Set<string> = new Set();
  private refreshCounter = 0;

  /** Add a batch of track IDs to the memory. */
  addBatch(ids: string[]): void {
    for (const id of ids) {
      if (this.idSet.has(id)) continue;
      this.recentIds.push(id);
      this.idSet.add(id);

      // Evict oldest when over capacity
      if (this.recentIds.length > MAX_CAPACITY) {
        const evicted = this.recentIds.shift()!;
        this.idSet.delete(evicted);
      }
    }
  }

  /** Get the set of recently shown IDs (for ranking novelty check). */
  getRecentIds(): Set<string> {
    return new Set(this.idSet);
  }

  /** Check if a specific track was recently shown. */
  has(id: string): boolean {
    return this.idSet.has(id);
  }

  /** Number of tracked IDs. */
  get size(): number {
    return this.idSet.size;
  }

  /** Clear all memory (e.g., on user reset). */
  clear(): void {
    this.recentIds = [];
    this.idSet.clear();
    this.refreshCounter = 0;
  }

  /** Increment and return the refresh counter (used as exploration seed). */
  nextRefreshSeed(): number {
    return ++this.refreshCounter;
  }

  /** Filter a track list to only novel tracks (not in memory). */
  filterNovel(tracks: MusicTrack[]): MusicTrack[] {
    return tracks.filter((t) => !this.idSet.has(t.id));
  }

  /**
   * Check if a track list meets the novelty target.
   * @param tracks Candidate tracks
   * @param minNovelRatio Minimum fraction of novel tracks (default 0.6)
   */
  meetsNoveltyTarget(tracks: MusicTrack[], minNovelRatio: number = 0.6): boolean {
    if (tracks.length === 0) return true;
    const novelCount = tracks.filter((t) => !this.idSet.has(t.id)).length;
    return novelCount / tracks.length >= minNovelRatio;
  }
}

/** Singleton session memory instance. */
export const sessionMemory = new SessionMemory();
