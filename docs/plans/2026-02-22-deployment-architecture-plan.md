# Deployment Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure project into `src/` + `api/`, secure API keys via Vercel Serverless Functions, and prepare for Vercel deployment.

**Architecture:** Vite + React SPA in `src/`, Vercel Serverless Functions in `api/` for DeepSeek proxy and Deezer CORS proxy, with in-memory rate limiting. All source moves into `src/` preserving internal relative imports.

**Tech Stack:** Vite 6, React 19, TypeScript strict, Vercel Serverless Functions, @vercel/node

---

## Phase 1: Directory Restructure

### Task 1: Move source files into `src/`

**Files:**
- Move: `App.tsx` → `src/App.tsx`
- Move: `index.tsx` → `src/main.tsx` (rename)
- Move: `types.ts` → `src/types.ts`
- Move: `constants.ts` → `src/constants.ts`
- Move: `components/` → `src/components/`
- Move: `hooks/` → `src/hooks/`
- Move: `services/` → `src/services/`
- Move: `data/` → `src/data/`
- Delete: `constants.tsx` (1-line duplicate)
- Delete: `services/jamendoService.ts` (legacy, replaced by providers/jamendoProvider.ts)

**Step 1: Create src/ and move all source directories**

```bash
mkdir -p src
mv App.tsx src/App.tsx
mv index.tsx src/main.tsx
mv types.ts src/types.ts
mv constants.ts src/constants.ts
mv components src/components
mv hooks src/hooks
mv services src/services
mv data src/data
```

**Step 2: Delete unused files**

```bash
rm constants.tsx
rm src/services/jamendoService.ts
```

**Step 3: Verify structure**

```bash
ls src/
```

Expected: `App.tsx  main.tsx  types.ts  constants.ts  components/  hooks/  services/  data/`

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move source files into src/ directory"
```

---

### Task 2: Update root config files for new structure

**Files:**
- Modify: `index.html:54` — update script src
- Modify: `vite.config.ts:26-29` — update @ alias
- Modify: `tsconfig.json:22-25` — update paths

**Step 1: Update `index.html`**

Change line 54:
```html
<!-- OLD -->
<script type="module" src="/index.tsx"></script>
<!-- NEW -->
<script type="module" src="/src/main.tsx"></script>
```

**Step 2: Update `vite.config.ts`**

Change the resolve.alias block:
```typescript
// OLD
alias: {
  '@': path.resolve(__dirname, '.'),
}
// NEW
alias: {
  '@': path.resolve(__dirname, 'src'),
}
```

**Step 3: Update `tsconfig.json`**

Change the paths block and add include:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "api"]
}
```

**Step 4: Verify build works**

```bash
npx vite build
```

Expected: Build succeeds with output in `dist/`.

**Step 5: Commit**

```bash
git add index.html vite.config.ts tsconfig.json
git commit -m "refactor: update config paths for src/ directory structure"
```

---

## Phase 2: API Security Layer

### Task 3: Create rate limiter utility

**Files:**
- Create: `api/lib/rateLimit.ts`

**Step 1: Create directory and file**

```bash
mkdir -p api/lib
```

**Step 2: Write `api/lib/rateLimit.ts`**

```typescript
/**
 * Simple in-memory rate limiter for Vercel Serverless Functions.
 * Each function instance has its own Map — good enough for 200 users.
 * Replace with Upstash Redis when scaling beyond that.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically to prevent memory leaks
const CLEANUP_INTERVAL = 60_000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetTime) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetInSeconds: Math.ceil(windowMs / 1000) };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetInSeconds = Math.ceil((entry.resetTime - now) / 1000);

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  return { allowed: true, remaining, resetInSeconds };
}
```

**Step 3: Commit**

```bash
git add api/lib/rateLimit.ts
git commit -m "feat: add in-memory rate limiter for serverless functions"
```

---

### Task 4: Create request validation utility

**Files:**
- Create: `api/lib/validate.ts`

**Step 1: Write `api/lib/validate.ts`**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Extract client IP from Vercel request headers. */
export function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket?.remoteAddress || 'unknown';
}

/** Reject non-POST requests with 405. Returns true if rejected. */
export function rejectNonPost(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }
  return false;
}

/** Set standard CORS headers for API responses. */
export function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
```

**Step 2: Commit**

```bash
git add api/lib/validate.ts
git commit -m "feat: add request validation utilities for API routes"
```

---

### Task 5: Create DeepSeek API proxy

**Files:**
- Create: `api/deepseek.ts`

**Step 1: Write `api/deepseek.ts`**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './lib/rateLimit.js';
import { getClientIp, rejectNonPost, setCorsHeaders } from './lib/validate.js';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const MAX_PROMPT_LENGTH = 8000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (rejectNonPost(req, res)) return;

  // Rate limit: 10 requests per IP per minute
  const ip = getClientIp(req);
  const limit = checkRateLimit(`deepseek:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: limit.resetInSeconds,
    });
  }

  // Validate request body
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required and must be a string' });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `prompt exceeds ${MAX_PROMPT_LENGTH} characters` });
  }

  // Read API key from server environment (never exposed to client)
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY not configured');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', response.status, errorText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('DeepSeek proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

**Step 2: Commit**

```bash
git add api/deepseek.ts
git commit -m "feat: add DeepSeek API serverless proxy with rate limiting"
```

---

### Task 6: Create Deezer CORS proxy

**Files:**
- Create: `api/deezer/[...path].ts`

**Step 1: Create directory and write file**

```bash
mkdir -p "api/deezer"
```

**Step 2: Write `api/deezer/[...path].ts`**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from '../lib/rateLimit.js';
import { getClientIp, setCorsHeaders } from '../lib/validate.js';

const DEEZER_API_BASE = 'https://api.deezer.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 30 requests per IP per minute
  const ip = getClientIp(req);
  const limit = checkRateLimit(`deezer:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: limit.resetInSeconds,
    });
  }

  // Build Deezer API URL from the catch-all path segments
  const pathSegments = req.query.path;
  const deezerPath = Array.isArray(pathSegments)
    ? pathSegments.join('/')
    : pathSegments || '';

  // Forward all query params except "path" (used by Vercel routing)
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (typeof value === 'string') params.set(key, value);
  }

  const targetUrl = `${DEEZER_API_BASE}/${deezerPath}${params.toString() ? '?' + params.toString() : ''}`;

  try {
    const response = await fetch(targetUrl);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Deezer proxy error:', error);
    return res.status(500).json({ error: 'Proxy error' });
  }
}
```

**Step 3: Commit**

```bash
git add "api/deezer/[...path].ts"
git commit -m "feat: add Deezer CORS proxy serverless function"
```

---

### Task 7: Create frontend API client and rewire aiService

**Files:**
- Create: `src/services/api/deepseekClient.ts`
- Modify: `src/services/aiService.ts` (full rewrite — 48 lines)

**Step 1: Create client directory**

```bash
mkdir -p src/services/api
```

**Step 2: Write `src/services/api/deepseekClient.ts`**

```typescript
/**
 * Frontend client for the /api/deepseek serverless function.
 * Replaces direct DeepSeek API calls — API key stays on server.
 */

const DEEPSEEK_PROXY_URL = '/api/deepseek';

export interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function postToDeepSeek(prompt: string): Promise<DeepSeekResponse> {
  const response = await fetch(DEEPSEEK_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}
```

**Step 3: Rewrite `src/services/aiService.ts`**

Replace entire file content with:

```typescript
import { postToDeepSeek } from './api/deepseekClient';

/**
 * Call the DeepSeek API (via server proxy) and return parsed JSON.
 * API key is never exposed to the browser.
 */
export async function callDeepSeek<T>(prompt: string): Promise<T> {
  const data = await postToDeepSeek(prompt);
  const content: string | undefined = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in DeepSeek response');
  }

  // Strip markdown code block wrappers if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  }

  return JSON.parse(jsonStr) as T;
}

/**
 * Check if the AI service is available.
 * In the proxy architecture, the key is on the server — always "available" from frontend perspective.
 * Actual availability is checked when making requests.
 */
export function getApiKey(): string | undefined {
  // Return a truthy placeholder so callers that check `getApiKey()` still proceed.
  // The real key is on the server; frontend never sees it.
  return 'server-side';
}
```

Note: `getApiKey()` is kept because `deepseekService.ts:10` and `queryGenerator.ts:13` and `tagMappingService.ts:9` import it to check if AI is available before attempting calls. Returning `'server-side'` keeps these checks passing without leaking secrets.

**Step 4: Verify build**

```bash
npx vite build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/services/api/deepseekClient.ts src/services/aiService.ts
git commit -m "feat: route DeepSeek calls through server proxy, remove client-side API key"
```

---

## Phase 3: Deployment Configuration

### Task 8: Remove API key injection from vite.config.ts

**Files:**
- Modify: `vite.config.ts:21-25` — remove `define` block
- Modify: `vite.config.ts:8-18` — add dev proxy for `/api/deepseek`

**Step 1: Update `vite.config.ts`**

Full new content:

```typescript
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // Deezer search API does not return CORS headers; proxy in dev.
      '/api/deezer': {
        target: 'https://api.deezer.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/deezer/, ''),
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

Changes from current:
- Removed `loadEnv` import (no longer needed)
- Removed `({ mode })` parameter (no longer needed)
- Removed entire `define` block (API keys no longer injected into client)
- Kept Deezer dev proxy

Note: `/api/deepseek` is NOT proxied in dev — it will only work when running `vercel dev`. When using plain `npx vite`, AI features require `vercel dev` to be running separately, or the developer can temporarily start a local proxy. This is acceptable for the dev workflow.

**Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "fix: remove API key injection from client bundle"
```

---

### Task 9: Create vercel.json and update .gitignore

**Files:**
- Create: `vercel.json`
- Modify: `.gitignore:14` — add `.vercel/`

**Step 1: Write `vercel.json`**

```json
{
  "buildCommand": "npx vite build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Step 2: Update `.gitignore`**

Add after line 14 (`*.local`):

```
.vercel
```

**Step 3: Install @vercel/node**

```bash
npm install --save-dev @vercel/node
```

**Step 4: Commit**

```bash
git add vercel.json .gitignore package.json package-lock.json
git commit -m "feat: add Vercel deployment configuration"
```

---

## Phase 4: Verification

### Task 10: Verify production build

**Step 1: Clean build**

```bash
rm -rf dist
npx vite build
```

Expected: Build succeeds. Check that output does NOT contain any API key strings:

```bash
grep -r "DEEPSEEK" dist/ || echo "No API keys found in bundle — PASS"
```

Expected: "No API keys found in bundle — PASS"

**Step 2: Verify bundle doesn't contain DeepSeek API URL**

```bash
grep -r "api.deepseek.com" dist/ || echo "No direct DeepSeek URL in bundle — PASS"
```

Expected: "No direct DeepSeek URL in bundle — PASS"

**Step 3: Check bundle size**

```bash
du -sh dist/
ls -la dist/assets/
```

Informational — just note the size for reference.

**Step 4: Final commit if any fixes were needed**

```bash
git status
```

If clean, no commit needed.

---

### Task 11: Test with vercel dev (manual)

This task is manual — requires Vercel CLI login.

**Step 1: Install Vercel CLI globally (if not installed)**

```bash
npm install -g vercel
```

**Step 2: Link project**

```bash
vercel link
```

Follow prompts to connect to Vercel account.

**Step 3: Set environment variable locally**

```bash
vercel env pull .env.local
```

Or manually ensure `.env.local` has `DEEPSEEK_API_KEY=<your-key>`.

**Step 4: Run local dev with serverless functions**

```bash
vercel dev
```

**Step 5: Test endpoints**

- Open `http://localhost:3000` — app should load
- Open browser DevTools Network tab
- Perform a search — verify `/api/deepseek` is called (not `api.deepseek.com` directly)
- Verify Deezer results appear (proxy working)

**Step 6: Deploy**

```bash
vercel --prod
```

Or connect GitHub repo in Vercel Dashboard for automatic deployments.

---

## Summary of all files

### Created (7 files)
- `api/lib/rateLimit.ts`
- `api/lib/validate.ts`
- `api/deepseek.ts`
- `api/deezer/[...path].ts`
- `src/services/api/deepseekClient.ts`
- `vercel.json`

### Modified (4 files)
- `index.html` — script src path
- `vite.config.ts` — remove define, update alias
- `tsconfig.json` — update paths, add include
- `.gitignore` — add .vercel
- `src/services/aiService.ts` — rewrite to use proxy client

### Moved (8 items)
- `App.tsx` → `src/App.tsx`
- `index.tsx` → `src/main.tsx`
- `types.ts` → `src/types.ts`
- `constants.ts` → `src/constants.ts`
- `components/` → `src/components/`
- `hooks/` → `src/hooks/`
- `services/` → `src/services/`
- `data/` → `src/data/`

### Deleted (2 files)
- `constants.tsx` (duplicate)
- `services/jamendoService.ts` (legacy)

### Added dependency
- `@vercel/node` (devDependency)
