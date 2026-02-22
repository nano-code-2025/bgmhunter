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
 */
export function getApiKey(): string | undefined {
  return 'server-side';
}
