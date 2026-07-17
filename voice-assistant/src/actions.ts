import type { Action } from "./llm";

const GMAIL_CONN = "conn_IpcE35CjNeZS";
const CALENDAR_CONN = "conn_DrCzC4UkULoP";
const DOCS_CONN = "conn_pd_apn_1Kh7JQE";
const SHEETS_CONN = "conn_pd_apn_eahbypZ";

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type ActionResult = {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
  emails?: Array<{ id: string; from: string; subject: string; snippet: string; date: string }>;
};

export async function runAction(action: Action): Promise<ActionResult> {
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

    if (action.type === "gmail_read") {
      const max = Math.min(action.max ?? 5, 10);
      const query = action.query ?? "";
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("maxResults", String(max));
      if (query) url.searchParams.set("q", query);
      const listRes = await fetch(url, { headers: { "X-Sauna-Connection-Id": GMAIL_CONN } });
      if (!listRes.ok) return { ok: false, error: `gmail list ${listRes.status}: ${await listRes.text()}` };
      const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
      const ids = (list.messages ?? []).slice(0, max).map((m) => m.id);
      const emails: ActionResult["emails"] = [];
      for (const id of ids) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { "X-Sauna-Connection-Id": GMAIL_CONN } }
        );
        if (!msgRes.ok) continue;
        const msg = (await msgRes.json()) as {
          payload: { headers: Array<{ name: string; value: string }> };
          snippet: string;
        };
        const headers = msg.payload?.headers ?? [];
        emails.push({
          id,
          from: headers.find((h) => h.name === "From")?.value ?? "",
          subject: headers.find((h) => h.name === "Subject")?.value ?? "",
          snippet: msg.snippet ?? "",
          date: headers.find((h) => h.name === "Date")?.value ?? "",
        });
      }
      return { ok: true, emails };
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
      const data = (await res.json()) as { id: string; htmlLink: string };
      return { ok: true, id: data.id, url: data.htmlLink };
    }

    if (action.type === "google_docs_create") {
      const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sauna-Connection-Id": DOCS_CONN },
        body: JSON.stringify({ title: action.title }),
      });
      if (!createRes.ok) return { ok: false, error: `docs create ${createRes.status}: ${await createRes.text()}` };
      const doc = (await createRes.json()) as { documentId: string };
      if (action.content?.trim()) {
        const updateRes = await fetch(
          `https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Sauna-Connection-Id": DOCS_CONN },
            body: JSON.stringify({
              requests: [{ insertText: { location: { index: 1 }, text: action.content } }],
            }),
          }
        );
        if (!updateRes.ok) return { ok: true, id: doc.documentId, error: `docs content ${updateRes.status}: ${await updateRes.text()}` };
      }
      return { ok: true, id: doc.documentId, url: `https://docs.google.com/document/d/${doc.documentId}/edit` };
    }

    if (action.type === "google_sheets_create") {
      const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sauna-Connection-Id": SHEETS_CONN },
        body: JSON.stringify({
          properties: { title: action.title },
          sheets: [{ properties: { title: "Sheet1" } }],
        }),
      });
      if (!createRes.ok) return { ok: false, error: `sheets create ${createRes.status}: ${await createRes.text()}` };
      const ss = (await createRes.json()) as { spreadsheetId: string; spreadsheetUrl: string };
      const headers = action.headers ?? [];
      const rows = action.rows ?? [];
      if (headers.length || rows.length) {
        const values = [headers, ...rows];
        const valuesRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${ss.spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-Sauna-Connection-Id": SHEETS_CONN },
            body: JSON.stringify({ values }),
          }
        );
        if (!valuesRes.ok) return { ok: true, id: ss.spreadsheetId, url: ss.spreadsheetUrl, error: `sheets values ${valuesRes.status}: ${await valuesRes.text()}` };
      }
      return { ok: true, id: ss.spreadsheetId, url: ss.spreadsheetUrl };
    }

    return { ok: false, error: "unknown action type" };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}
