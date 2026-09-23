import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Stripe billing functions (checkout + webhook)
export { createCheckoutSession, stripeWebhook } from './stripe.js';

// The Google Gemini API key lives in Google Secret Manager — never shipped to the browser.
// Set it once with:  npx firebase-tools functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Google's latest Gemini 2.5 Flash model (fast, capable, free tier with Google AI Studio key)
const MODEL = 'gemini-2.5-flash';

interface ChatTurn {
  role: 'user' | 'assistant' | 'model';
  text: string;
}

// 'chat'     — the conversational Ask Tallio page (short, direct answers)
// 'insights' — the analyst briefing rendered on the Insights page (structured)
type AskMode = 'chat' | 'insights';

interface AskTallioRequest {
  context: string;
  history: ChatTurn[];
  question: string;
  mode?: AskMode;
}

const DATA_RULES =
  `Use ONLY the business data provided below. Never invent or estimate figures that ` +
  `are not derivable from it. If the data does not contain the answer, say so honestly ` +
  `and suggest what the user could start tracking to get it. Always use the business's ` +
  `own currency symbol. Reply in PLAIN TEXT only — no markdown, no asterisks, hashes or ` +
  `backticks. For lists, start lines with "- ".`;

const CHAT_SYSTEM =
  `You are "Tallio", a friendly, concise business analyst assistant built into a ` +
  `point-of-sale app for small businesses. Keep answers short and practical, and format ` +
  `numbers clearly. ${DATA_RULES}`;

const INSIGHTS_SYSTEM =
  `You are "Tallio", a sharp, practical business analyst working for the owner of a small ` +
  `business. You are writing the analyst briefing shown on their Insights page — the one ` +
  `piece of writing they read before deciding what to do this week.\n\n` +
  `${DATA_RULES}\n\n` +
  `What makes a good briefing:\n` +
  `- Every claim carries a real number from the data — revenue, quantity, product name, ` +
  `day, or day-count. A claim without a number is not worth printing.\n` +
  `- Look for what a simple dashboard misses: trends across weeks and months, products ` +
  `quietly rising or fading, day-of-week patterns, stock that runs out before it can ` +
  `realistically be reordered, revenue concentrated in too few customers or products, ` +
  `catalogue dead weight, operating overheads/expenses, and margin (selling price versus cost).\n` +
  `- Be specific to THIS business. No generic small-business advice.\n` +
  `- Say plainly when the history is too short to call a trend, instead of overreaching.\n\n` +
  `Reply in EXACTLY this structure, using these literal section labels on their own lines:\n\n` +
  `SUMMARY:\n` +
  `Two to four sentences on how the business is doing right now and the single most ` +
  `important thing to notice.\n\n` +
  `FINDINGS:\n` +
  `- [positive] Short title :: One or two sentences with the numbers behind it\n` +
  `- [warning] Short title :: One or two sentences with the numbers behind it\n` +
  `- [neutral] Short title :: One or two sentences with the numbers behind it\n` +
  `Give three to five findings. The tone tag must be exactly positive, warning or neutral, ` +
  `and every finding must use the " :: " separator between title and detail.\n\n` +
  `ACTIONS:\n` +
  `- A specific thing to do this week, tied to a finding above\n` +
  `Give two to four actions.`;

export const askTallio = onCall<AskTallioRequest>(
  { secrets: [GEMINI_API_KEY], region: 'us-central1' },
  async (request) => {
    // Only signed-in users (including demo/anonymous) may call the AI.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Please sign in to use Tallio AI.');
    }

    const { context, history, question, mode } = request.data ?? ({} as AskTallioRequest);
    if (typeof question !== 'string' || !question.trim()) {
      throw new HttpsError('invalid-argument', 'A question is required.');
    }

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEY secret is not configured.');
    }

    const insightsMode = mode === 'insights';
    const genAI = new GoogleGenerativeAI(apiKey);

    const systemInstruction =
      `${insightsMode ? INSIGHTS_SYSTEM : CHAT_SYSTEM}\n\n` +
      `=== BUSINESS DATA SNAPSHOT ===\n${context ?? ''}\n=== END DATA ===`;

    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: insightsMode ? 1600 : 1024,
        temperature: 0.2,
      },
    });

    try {
      if (insightsMode) {
        // Briefing is one-shot
        const result = await model.generateContent(question);
        const answer = result.response.text().trim();
        return { answer };
      } else {
        // Conversational chat mode with history
        const formattedHistory = (Array.isArray(history) ? history : [])
          .filter((h) => h && typeof h.text === 'string')
          .map((h) => ({
            role: h.role === 'assistant' || h.role === 'model' ? ('model' as const) : ('user' as const),
            parts: [{ text: h.text }],
          }));

        const chat = model.startChat({
          history: formattedHistory,
        });

        const result = await chat.sendMessage(question);
        const answer = result.response.text().trim();
        return { answer };
      }
    } catch (err: unknown) {
      console.error('Gemini API Error:', err);
      const message = err instanceof Error ? err.message : 'Gemini AI request failed';
      throw new HttpsError('internal', message);
    }
  }
);
