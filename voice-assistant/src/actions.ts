import type { Action } from "./llm";

const GMAIL_CONN = "conn_IpcE35CjNeZS";
const CALENDAR_CONN = "conn_DrCzC4UkULoP";

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function runAction(action: Action): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    if (action.type === "gmail_draft") {
      const raw = b64url(
        `To: ${action.to}\r\n` +
        `Subject: ${action.subject}\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
        action.body
      );
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sauna-Connection-Id": GMAIL_CONN,
        },
        body: JSON.stringify({ message: { raw } }),
      });
      if (!res.ok) return { ok: false, error: `gmail ${res.status}: ${await res.text()}` };
      const data = (await res.json()) as { id: string };
      return { ok: true, id: data.id };
    }
    if (action.type === "calendar_event") {
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Sauna-Connection-Id": CALENDAR_CONN,
          },
          body: JSON.stringify({
            summary: action.title,
            start: { dateTime: action.start },
            end: { dateTime: action.end },
            attendees: (action.attendees ?? []).map((email) => ({ email })),
          }),
        }
      );
      if (!res.ok) return { ok: false, error: `calendar ${res.status}: ${await res.text()}` };
      const data = (await res.json()) as { id: string };
      return { ok: true, id: data.id };
    }
    return { ok: false, error: "unknown action type" };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}
