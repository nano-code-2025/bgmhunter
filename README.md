<div align="center">

<img src="docs/assets/logo.png" alt="BGM Hunter Logo" width="120" />

# BGM Hunter

**AI-Powered Background Music Search Engine with Real-Time 3D Visualization**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Three.js](https://img.shields.io/badge/Three.js-r182-000000?logo=three.js&logoColor=white)](https://threejs.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://bgmhunter.com) · [Architecture](#architecture) · [Quick Start](#quick-start)

</div>

---

## Preview

### Homepage

<div align="center">

https://github.com/user-attachments/assets/df761a48-352b-4af3-8830-b2cb60bcbd98

<p><em>Homepage walkthrough — Search input, AI tag extraction, and results loading</em></p>
</div>

---

### Player — Three Visualizer Themes

<div align="center">
<img src="docs/assets/screenshot-player-milkyway.png" alt="Milky Way visualizer" width="800" />
<p><em>🌌 Milky Way — Galaxy shader with fbm star field</em></p>
</div>

<div align="center">
<img src="docs/assets/screenshot-player-aura.png" alt="Aurora visualizer" width="800" />
<p><em>🌅 Aurora — Gradient aurora with meteor shower</em></p>
</div>

<div align="center">
<img src="docs/assets/screenshot-player-rainglass.png" alt="Rain Glass visualizer" width="800" />
<p><em>🌧️ Rain Glass — Bokeh raindrops with lightning</em></p>
</div>

<div align="center">

https://github.com/user-attachments/assets/eb98fb62-fbe4-4799-8e34-91eb3ffdae5f

<p><em>Player in action — Theme switching, track browsing, and visualizer reacting to audio frequency</em></p>
</div>

---

## What is BGM Hunter?

BGM Hunter is an AI-driven background music discovery tool for video creators. Paste your script or describe a mood, and the AI analyzes your intent — extracting emotions, energy levels, and content categories — then searches multiple music sources in parallel to find the perfect BGM.

**Key differentiators:**
- **LLM-powered semantic understanding** — not just keyword matching, but contextual analysis of scripts and moods via DeepSeek
- **Multi-query × Multi-provider orchestration** — generates precision, recall, and exploration query variants, runs them across providers simultaneously
- **Multi-factor ranking with diversity constraints** — scores tracks on relevance, popularity, preference fit, novelty, and quality; enforces artist/genre/provider diversity
- **Real-time WebGL visualizers** — custom GLSL shaders (Milky Way galaxy, Aurora, Rain Glass) that react to audio frequency data

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                  │
│                                                             │
│  SearchPanel ──► useSearch hook ──► SearchOrchestrator V2   │
│                                     │                       │
│                          ┌──────────┼──────────┐            │
│                          ▼          ▼          ▼            │
│                     Precision    Recall    Exploration       │
│                      Query       Query      Query           │
│                          │          │          │            │
│                          ▼          ▼          ▼            │
│                   ┌──────────┐ ┌──────────┐                │
│                   │ Jamendo  │ │  Deezer  │  ...providers  │
│                   └──────────┘ └──────────┘                │
│                          │          │          │            │
│                          └──────────┼──────────┘            │
│                                     ▼                       │
│                          Merge → Dedup → Score → Diversify  │
│                                     │                       │
│                                     ▼                       │
│                             CentralPlayer                   │
│                          (Card Carousel + Audio)            │
│                                     │                       │
│                                     ▼                       │
│                         3D Visualizer (R3F + GLSL)          │
│                    MilkyWay │ Aurora │ RainGlass             │
└─────────────────────────────────────────────────────────────┘
                              │
                    Vercel Serverless API
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        DeepSeek Proxy   Deezer Proxy   Rate Limiter
       (AI Analysis)    (CORS bypass)   (IP-based)
```

### Core Modules

| Module | Description |
|--------|-------------|
| `services/searchOrchestrator.ts` | V2 orchestrator — M queries × N providers in parallel, merge, dedup, score, diversify |
| `services/rankingEngine.ts` | Multi-factor scoring (relevance, popularity, preference, novelty, quality) with configurable weight profiles and greedy diversity selection |
| `services/queryGenerator.ts` | Generates 3 query variants (Precision / Recall / Exploration) via DeepSeek with static synonym fallback |
| `services/deepseekService.ts` | LLM integration — analyzes scripts/keywords to extract structured BGM tags with trend-aware prompts |
| `services/sessionMemory.ts` | Ring-buffer session memory (200 IDs) for novelty enforcement across refreshes |
| `services/implicitPreferences.ts` | Extracts user taste profiles from favorites history |
| `services/providers/` | Pluggable provider adapters (Jamendo, Deezer) with unified `MusicProvider` interface |
| `components/visualizer/` | Custom GLSL shaders — MilkyWay (fbm star field), Aurora (gradient + meteor), RainGlass (bokeh + lightning) |
| `api/deepseek.ts` | Serverless proxy — keeps API keys server-side, validates input, rate-limits per IP |
| `api/deezer.ts` | CORS proxy for Deezer API (no browser CORS headers) |

### AI Pipeline

```
User Input (script / keywords)
        │
        ▼
  DeepSeek LLM Analysis
  ├── Content classification (vlog, travel, gaming, ...)
  ├── Emotion / mood extraction
  ├── Energy level detection
  └── Structured tag generation {genres, instruments, vartags}
        │
        ▼
  Query Variant Generator
  ├── Variant A (Precision): Core tags as-is
  ├── Variant B (Recall): AI-expanded synonyms + neighbors
  └── Variant C (Exploration): Mood-driven + implicit preferences
        │
        ▼
  M × N Parallel Search (3 variants × 2 providers = 6 concurrent fetches)
        │
        ▼
  Ranking Engine
  ├── Sørensen–Dice deduplication
  ├── Weighted composite scoring
  │   ├── Relevance  (Jaccard tag similarity)
  │   ├── Popularity (normalized 0-100)
  │   ├── Explicit preference fit
  │   ├── Implicit preference fit
  │   ├── Novelty    (session memory penalty)
  │   └── Quality    (playback type + downloadable)
  └── Diversity constraints
      ├── Artist cap (max 2 per artist)
      ├── Genre ratio cap (max 50% one genre)
      └── Provider mix enforcement (min 30% from secondary)
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript (strict), Vite 6 |
| **3D / Shaders** | Three.js r182, React Three Fiber, Drei, custom GLSL |
| **Animation** | Framer Motion |
| **AI** | DeepSeek Chat API (trend-aware prompt engineering) |
| **Music APIs** | Jamendo (full tracks, CC licensed), Deezer (30s previews) |
| **Backend** | Vercel Serverless Functions (Node.js) |
| **Architecture** | Provider pattern, ring-buffer session memory, multi-factor ranking engine |

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **DeepSeek API key** — get one at [platform.deepseek.com](https://platform.deepseek.com/)

### Install & Run

```bash
git clone https://github.com/nano-code-2025/bgmhunter.git
cd bgmhunter
npm install

# Copy and fill in your API key
cp .env.example .env.local
# Edit .env.local → set DEEPSEEK_API_KEY=your_key_here
```

There are **two ways** to run the project locally:

#### Option A: `vercel dev` (recommended — full features)

```bash
npm i -g vercel    # install Vercel CLI if not already
vercel dev         # starts Vite + serverless functions together
```

This runs **everything** including DeepSeek AI proxy and Deezer CORS proxy. All features work.

#### Option B: `npm run dev` (frontend only)

```bash
npm run dev
```

This starts only the Vite dev server. The serverless functions in `api/` (DeepSeek proxy, Deezer proxy) will not be available. The app gracefully falls back:

| Feature | `vercel dev` | `npm run dev` |
|---------|:---:|:---:|
| Search UI + tag selection | Yes | Yes |
| Jamendo music search | Yes | Yes |
| 3D visualizers (shaders) | Yes | Yes |
| Audio playback + controls | Yes | Yes |
| **AI script analysis** (DeepSeek) | Yes | Fallback to defaults |
| **AI query expansion** (3 variants) | Yes | Fallback to static synonyms |
| **Deezer** search results | Yes | Not available |

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Set `DEEPSEEK_API_KEY` in Vercel Environment Variables. All features work automatically in production.

## Project Structure

```
bgm-hunter/
├── api/                          # Vercel serverless functions
│   ├── deepseek.ts               # AI proxy (input validation + rate limiting)
│   ├── deezer.ts                 # CORS proxy for Deezer API
│   └── lib/
│       ├── rateLimit.ts          # Sliding-window rate limiter
│       └── validate.ts           # Request validation helpers
├── src/
│   ├── components/
│   │   ├── input/SearchPanel.tsx  # Search UI (script paste / keyword input)
│   │   ├── player/CentralPlayer.tsx  # Card carousel + audio playback
│   │   ├── visualizer/           # 3D scenes (GLSL shaders)
│   │   │   ├── Scene3D.tsx       # Scene dispatcher
│   │   │   ├── MilkyWayBackdrop.tsx  # Galaxy shader (fbm + star field)
│   │   │   ├── AuroraScene.tsx   # Aurora shader
│   │   │   └── RainGlassScene.tsx    # Rain + bokeh shader
│   │   ├── collection/           # Favorites management
│   │   └── settings/             # User preferences
│   ├── services/
│   │   ├── searchOrchestrator.ts # Core: M×N parallel search + merge + rank
│   │   ├── rankingEngine.ts      # Multi-factor scoring + diversity
│   │   ├── queryGenerator.ts     # AI query variant generation
│   │   ├── deepseekService.ts    # LLM analysis (trend-aware prompts)
│   │   ├── sessionMemory.ts      # Ring-buffer novelty tracking
│   │   ├── implicitPreferences.ts # Taste extraction from history
│   │   └── providers/            # Pluggable music source adapters
│   │       ├── index.ts          # Provider registry
│   │       ├── jamendoProvider.ts
│   │       └── deezerProvider.ts
│   ├── hooks/                    # React hooks (useSearch, usePlayer, ...)
│   ├── data/                     # Static tag mappings
│   └── types.ts                  # TypeScript type definitions
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json
```

## Adding a Music Provider

The provider system is designed to be extensible:

```typescript
// src/services/providers/spotifyProvider.ts
import { MusicProvider, MusicTrack, SearchQuery, SearchOptions } from '../../types';

export const spotifyProvider: MusicProvider = {
  name: 'spotify',
  async search(query: SearchQuery, options?: SearchOptions): Promise<MusicTrack[]> {
    // Map SearchQuery to Spotify API format
    // Normalize results to MusicTrack interface
    // Return tracks
  },
};
```

Then register it:

```typescript
// src/services/providers/index.ts
import { spotifyProvider } from './spotifyProvider';
export const defaultProviders: MusicProvider[] = [
  jamendoProvider,
  deezerProvider,
  spotifyProvider, // ← just add here
];
```

The orchestrator picks it up automatically — no other changes needed.

## License

[MIT](LICENSE)

---

> **Note:** This is the open-source core of BGM Hunter, showcasing the AI recommendation engine, 3D visualization, and provider architecture. The full production version includes additional features (user accounts, cloud sync, admin panel) that are not included in this repository.
