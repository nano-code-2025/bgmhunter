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

  const ip = getClientIp(req);
  const limit = checkRateLimit(`deezer:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: limit.resetInSeconds,
    });
  }

  const pathSegments = req.query.path;
  const deezerPath = Array.isArray(pathSegments)
    ? pathSegments.join('/')
    : pathSegments || '';

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
