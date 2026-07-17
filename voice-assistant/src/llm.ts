import OpenAI from "openai";

const SYSTEM = `You are a hands-free voice assistant. Your reply will be READ ALOUD.

Hard rules:
- No markdown, no bullet points, no lists, no emojis, no URLs in spoken_reply.
- Short spoken sentences. Confirm what you did in one or two sentences.
- Return ONLY valid JSON matching this exact shape (no prose before or after):

{
  "spoken_reply": string,
  "actions": [
    {"type": "gmail_draft", "to": string, "subject": string, "body": string}
    | {"type": "gmail_read", "max": number, "query": string}
    | {"type": "calendar_event", "title": string, "start": string, "end": string, "attendees": string[]}
    | {"type": "availability_event", "title": string, "start": string, "end": string, "autoDecline": boolean}
    | {"type": "google_docs_create", "title": string, "content": string}
    | {"type": "google_docs_create", "title": string, "content": string}
    | {"type": "google_sheets_create", "title": string, "headers": string[], "rows": string[][]}
  ]
}

When to use each action:
- gmail_draft: user asks to compose or draft an email. The body is the full email text.
- gmail_read: user asks about their inbox, recent emails, or messages from a specific person or topic. query uses Gmail search syntax (e.g. "from:alice", "is:unread", "subject:meeting"). Default max 5, cap at 10. Empty query means all recent.
- calendar_event: user asks to schedule or set up a MEETING with other people. start and end are ISO8601 with timezone. attendees is a list of email addresses.
- availability_event: user says they are OUT, OOO, busy, on vacation, unavailable, taking time off, or blocked. Creates a busy Google Calendar block (transparent opaque) so meetings won't be scheduled into that time. autoDecline is accepted in the schema for forward compatibility (true Google OOO events require a Workspace calendar) — if the user has Workspace, the autoDecline will be honored.
- google_docs_create: user asks to write a document, take notes, or draft something longer than a quick message. content is plain text (no markdown).
- google_sheets_create: user asks for a spreadsheet, table, or structured list. headers is the column header row. rows is a 2D array of strings.

Use ISO8601 with timezone for times. Empty actions array if no action needed.`;

export type Action =
  | { type: "gmail_draft"; to: string; subject: string; body: string }
  | { type: "gmail_read"; max?: number; query?: string }
  | { type: "calendar_event"; title: string; start: string; end: string; attendees: string[] }
  | { type: "availability_event"; title: string; start: string; end: string; autoDecline?: boolean }
  | { type: "google_docs_create"; title: string; content: string }
  | { type: "google_sheets_create"; title: string; headers: string[]; rows: string[][] };

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
