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
