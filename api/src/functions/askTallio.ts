import { app, HttpRequest, InvocationContext } from "@azure/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireUser, HttpError } from "../auth";
import { errorResponse } from "../http";

// Same prompts as the old Firebase function — the Gemini key now lives
// only in Azure (Function App -> Environment variables -> GEMINI_API_KEY).
const MODEL = "gemini-2.5-flash";

interface ChatTurn { role: "user" | "assistant" | "model"; text: string }
type AskMode = "chat" | "insights";
interface AskTallioRequest { context?: string; history?: ChatTurn[]; question?: string; mode?: AskMode }

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

// POST /api/ask-tallio  { context, history, question, mode }
app.http("askTallio", {
  methods: ["POST"],
  authLevel: "anonymous", // we check the Firebase token ourselves
  route: "ask-tallio",
  handler: async (req: HttpRequest, context: InvocationContext) => {
    try {
      await requireUser(req);

      const body = (await req.json().catch(() => ({}))) as AskTallioRequest;
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (!question) throw new HttpError(400, "A question is required.");
      if (question.length > 4000 || (body.context ?? "").length > 200_000) {
        throw new HttpError(413, "Request is too large.");
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new HttpError(503, "Tallio AI is not configured yet.");

      const insightsMode = body.mode === "insights";
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: MODEL,
        systemInstruction:
          `${insightsMode ? INSIGHTS_SYSTEM : CHAT_SYSTEM}\n\n` +
          `=== BUSINESS DATA SNAPSHOT ===\n${body.context ?? ""}\n=== END DATA ===`,
        generationConfig: { maxOutputTokens: insightsMode ? 1600 : 1024, temperature: 0.2 },
      });

      let answer: string;
      if (insightsMode) {
        answer = (await model.generateContent(question)).response.text().trim();
      } else {
        const history = (Array.isArray(body.history) ? body.history : [])
          .filter((h) => h && typeof h.text === "string")
          .slice(-20)
          .map((h) => ({
            role: h.role === "assistant" || h.role === "model" ? ("model" as const) : ("user" as const),
            parts: [{ text: h.text }],
          }));
        answer = (await model.startChat({ history }).sendMessage(question)).response.text().trim();
      }
      return { jsonBody: { answer } };
    } catch (err) {
      return errorResponse(err, context);
    }
  },
});
