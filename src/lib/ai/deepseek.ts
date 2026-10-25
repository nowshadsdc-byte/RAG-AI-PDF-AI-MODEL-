import { buildUserPrompt, groundedSystemPrompt } from "../prompts";

// DeepSeek is served by InferX through an OpenAI-compatible API, so plain
// fetch is enough — no extra SDK dependency.
const defaultBaseUrl = "https://model.inferx.net/endpoints/v1";
const defaultModel = "deepseek-v4.1-flash-1017";

type ChatCompletionResponse = {
  choices?: { message?: { content?: string | null } }[];
};

export async function generateAnswerWithDeepSeek(
  question: string,
  passages: string[],
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required. Set it in your local .env file.");
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL || defaultBaseUrl;
  const request = () => fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || defaultModel,
      messages: [
        { role: "system", content: groundedSystemPrompt },
        { role: "user", content: buildUserPrompt(question, passages) },
      ],
      // Low temperature keeps answers close to the passages.
      temperature: 0.1,
      // This is a reasoning model: hidden reasoning tokens count toward this
      // limit, so it must be generous or `content` comes back null.
      max_tokens: 4096,
    }),
    // Never let a hanging provider block the chat request forever.
    signal: AbortSignal.timeout(30_000),
  });

  // InferX answers 429/503 when its replicas are busy; retry with backoff.
  let response = await request();
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (response.status !== 429 && response.status !== 503) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    response = await request();
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`DeepSeek request failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("DeepSeek returned an empty answer.");
  }

  return answer;
}
