import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './lib/rateLimit.js';
import { getClientIp, rejectNonPost, setCorsHeaders } from './lib/validate.js';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const MAX_PROMPT_LENGTH = 8000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (rejectNonPost(req, res)) return;

  const ip = getClientIp(req);
  const limit = checkRateLimit(`deepseek:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: limit.resetInSeconds,
    });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required and must be a string' });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `prompt exceeds ${MAX_PROMPT_LENGTH} characters` });
  }

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
