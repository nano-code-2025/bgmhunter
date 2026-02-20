/**
 * Provider registry — the single place to add / remove music sources.
 *
 * To add a new provider:
 *   1. Create `services/providers/fooProvider.ts` implementing MusicProvider.
 *   2. Import and push into `defaultProviders` below.
 *   3. Done — the SearchOrchestrator picks it up automatically.
 */
import { MusicProvider } from '../../types';
import { jamendoProvider } from './jamendoProvider';
import { deezerProvider } from './deezerProvider';

/** Default provider set used by the search orchestrator. */
export const defaultProviders: MusicProvider[] = [
  jamendoProvider,
  deezerProvider,
];

export { jamendoProvider, deezerProvider };

