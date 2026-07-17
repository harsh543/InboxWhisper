import OpenAI from "openai";

const SYSTEM = `You are a hands-free voice assistant. Your reply will be READ ALOUD.

Hard rules:
- No markdown, no bullet points, no lists, no emojis, no URLs.
- Short spoken sentences. Confirm what you did in one or two sentences.
- Return ONLY valid JSON matching this exact shape (no prose before or after):

{
  "spoken_reply": string,
  "actions": [
    {"type": "gmail_draft", "to": string, "subject": string, "body": string}
    | {"type": "calendar_event", "title": string, "start": string, "end": string, "attendees": string[]}
  ]
}

Use ISO8601 with timezone for times. Empty actions array if no action needed.`;

export type Action =
  | { type: "gmail_draft"; to: string; subject: string; body: string }
  | { type: "calendar_event"; title: string; start: string; end: string; attendees: string[] };

export type Plan = { spoken_reply: string; actions: Action[] };

const FALLBACK: Plan = { spoken_reply: "Sorry, I didn't catch that clearly.", actions: [] };
const UNAVAILABLE: Plan = { spoken_reply: "The assistant is temporarily unavailable.", actions: [] };

export async function reason(transcript: string): Promise<Plan> {
  const client = new OpenAI({ baseURL: "https://sauna.local/v1/llms", apiKey: "sauna" });
  let res;
  try {
    res = await client.responses.create({
      model: "balanced",
      instructions: SYSTEM,
      input: transcript,
    });
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    if (status === 402) return UNAVAILABLE;
    throw err;
  }
  let text = (res.output_text ?? "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(text) as Plan;
    if (typeof parsed.spoken_reply !== "string") return FALLBACK;
    if (!Array.isArray(parsed.actions)) parsed.actions = [];
    return parsed;
  } catch {
    return FALLBACK;
  }
}
