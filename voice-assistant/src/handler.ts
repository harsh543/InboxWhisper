import type { AppCtx, AppHandler } from "@sauna/apps-runtime";
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { makeDb, sessions, messages, actionLog } from "./db";
import { reason } from "./llm";
import { transcribe, streamTts } from "./elevenlabs";
import { runAction } from "./actions";

type Env = { sql: any; websocket: any; ctx: AppCtx };
const app = new Hono<{ Bindings: Env }>();

function newId(): string {
  return crypto.randomUUID();
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/session/start", async (c) => {
  const db = makeDb(c.env);
  const id = newId();
  const userId = c.env.ctx?.session?.userId ?? "anonymous";
  await db.insert(sessions).values({
    id,
    userId,
    status: "active",
    createdAt: Date.now(),
  }).run();
  return c.json({ sessionId: id });
});

app.post("/api/turn", async (c) => {
  const db = makeDb(c.env);
  const sessionId = c.req.header("x-session-id");
  if (!sessionId) return c.json({ error: "missing x-session-id" }, 400);

  let transcript = "";
  try {
    const body = await c.req.parseBody();
    const file = body.audio;
    if (!(file instanceof File)) return c.json({ error: "missing audio file" }, 400);
    transcript = await transcribe(file, file.name || "turn.webm");
  } catch (err: any) {
    return c.json({ error: `stt_failed: ${err?.message ?? err}`, transcript: "", spokenReply: "I couldn't hear you clearly.", actions: [] }, 200);
  }

  await db.insert(messages).values({
    id: newId(),
    sessionId,
    role: "user",
    transcript,
    llmPlanJson: null,
    createdAt: Date.now(),
  }).run();

  const plan = await reason(transcript);

  const actionResults: Array<{ type: string; ok: boolean; id?: string; error?: string }> = [];
  for (const action of plan.actions) {
    const result = await runAction(action);
    actionResults.push({ type: action.type, ...result });
    await db.insert(actionLog).values({
      id: newId(),
      sessionId,
      actionType: action.type,
      paramsJson: JSON.stringify(action),
      resultJson: JSON.stringify(result),
      createdAt: Date.now(),
    }).run();
  }

  await db.insert(messages).values({
    id: newId(),
    sessionId,
    role: "assistant",
    transcript: plan.spoken_reply,
    llmPlanJson: JSON.stringify({ ...plan, actions: plan.actions.map((a, i) => ({ ...a, result: actionResults[i] })) }),
    createdAt: Date.now(),
  }).run();

  return c.json({
    sessionId,
    transcript,
    spokenReply: plan.spoken_reply,
    actions: plan.actions.map((a, i) => ({ ...a, result: actionResults[i] })),
  });
});

app.post("/api/speak", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ error: "empty text" }, 400);
  try {
    const body = await streamTts(text);
    return new Response(body, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err: any) {
    return c.json({ error: `tts_failed: ${err?.message ?? err}` }, 500);
  }
});

app.get("/api/session/:id", async (c) => {
  const db = makeDb(c.env);
  const id = c.req.param("id");
  const msgs = await db.select().from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(desc(messages.createdAt))
    .all();
  const logs = await db.select().from(actionLog)
    .where(eq(actionLog.sessionId, id))
    .orderBy(desc(actionLog.createdAt))
    .all();
  return c.json({
    messages: msgs.map((m) => ({ ...m, llmPlanJson: m.llmPlanJson ? JSON.parse(m.llmPlanJson) : null })),
    actions: logs.map((l) => ({ ...l, paramsJson: JSON.parse(l.paramsJson), resultJson: l.resultJson ? JSON.parse(l.resultJson) : null })),
  });
});

export default {
  fetch: (request, env, ctx) => app.fetch(request, { ...env, ctx }),
} satisfies AppHandler;
