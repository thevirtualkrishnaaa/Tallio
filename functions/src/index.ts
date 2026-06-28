import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';

// The Claude API key lives in Google Secret Manager — never shipped to the browser.
// Set it once with:  firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Model can be swapped here. Opus is the most capable; switch to
// 'claude-haiku-4-5' (~5x cheaper) or 'claude-sonnet-4-6' if cost matters.
const MODEL = 'claude-opus-4-8';

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface AskTallioRequest {
  context: string;
  history: ChatTurn[];
  question: string;
}

export const askTallio = onCall<AskTallioRequest>(
  { secrets: [ANTHROPIC_API_KEY], region: 'us-central1' },
  async (request) => {
    // Only signed-in users (including demo/anonymous) may call the AI.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Please sign in to use Tallio AI.');
    }

    const { context, history, question } = request.data ?? ({} as AskTallioRequest);
    if (typeof question !== 'string' || !question.trim()) {
      throw new HttpsError('invalid-argument', 'A question is required.');
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    const system =
      `You are "Tallio", a friendly, concise business analyst assistant built into a ` +
      `point-of-sale app for small businesses. Answer questions using ONLY the business ` +
      `data provided below. If the data doesn't contain the answer, say so honestly and ` +
      `suggest what the user could track to get it. Keep answers short and practical, use ` +
      `the business's currency symbol, and format numbers clearly. Do not invent figures. ` +
      `Reply in PLAIN TEXT only — no markdown, no asterisks, hashes, or backticks. For ` +
      `lists, start lines with "- ".\n\n` +
      `=== BUSINESS DATA SNAPSHOT ===\n${context ?? ''}\n=== END DATA ===`;

    const messages = [
      ...(Array.isArray(history) ? history : [])
        .filter((h) => h && typeof h.text === 'string')
        .map((h) => ({
          role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: h.text,
        })),
      { role: 'user' as const, content: question },
    ];

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages,
      });
      const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { answer };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI request failed';
      throw new HttpsError('internal', message);
    }
  }
);
