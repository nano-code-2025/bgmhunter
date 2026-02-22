const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

export function getApiKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY || process.env.API_KEY;
}

// Call DeepSeek API and return parsed JSON object
export async function callDeepSeek<T>(prompt: string): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('DeepSeek API key not found');
  }

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
    throw new Error(`DeepSeek API error: ${response.statusText}`);
  }

  const data = await response.json();
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

