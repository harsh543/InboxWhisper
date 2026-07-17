import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type UiState = "idle" | "recording" | "processing" | "speaking" | "error";
type ActionResult = { type: string; result: { ok: boolean; id?: string; error?: string } };
type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: ActionResult[];
};

const MicIcon = ({ pulsing = false }: { pulsing?: boolean }) => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
    {pulsing && <circle cx="12" cy="8" r="9" fill="none" stroke="#ff5b5b" strokeWidth="0.5" opacity="0.6"><animate attributeName="r" from="9" to="14" dur="1.2s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.6" to="0" dur="1.2s" repeatCount="indefinite" /></circle>}
  </svg>
);

const StopIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<UiState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/session/start", { method: "POST" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || r.status);
        setSessionId(d.sessionId);
      } catch (e: any) { setErr(`Failed to start session: ${e?.message ?? e}`); setState("error"); }
    })();
  }, []);

  async function startRecording() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        submitTurn();
      };
      rec.start();
      recorderRef.current = rec;
      setState("recording");
    } catch (e: any) {
      setErr(`Microphone unavailable: ${e?.message ?? e}`);
      setState("error");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function submitTurn() {
    if (!sessionId) return;
    const blob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
    setState("processing");
    try {
      const form = new FormData();
      form.append("audio", blob, "turn.webm");
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "X-Session-Id": sessionId },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      const userTurn: Turn = { id: crypto.randomUUID(), role: "user", text: data.transcript };
      const assistantTurn: Turn = { id: crypto.randomUUID(), role: "assistant", text: data.spokenReply, actions: data.actions };
      setTurns((prev) => [userTurn, assistantTurn, ...prev]);
      setTranscript(data.transcript);

      setState("speaking");
      try {
        const ttsRes = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: data.spokenReply }),
        });
        if (!ttsRes.ok) throw new Error(`tts ${ttsRes.status}`);
        const audioBlob = await ttsRes.blob();
        const url = URL.createObjectURL(audioBlob);
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = url;
        audioRef.current.onended = () => { setState("idle"); URL.revokeObjectURL(url); };
        audioRef.current.onerror = () => { setState("idle"); URL.revokeObjectURL(url); };
        await audioRef.current.play();
      } catch (e: any) {
        setErr(`TTS failed: ${e?.message ?? e}`);
        setState("idle");
      }
    } catch (e: any) {
      setErr(`Turn failed: ${e?.message ?? e}`);
      setState("error");
    }
  }

  const buttonLabel = state === "idle" ? "Tap to speak"
    : state === "recording" ? "Listening… tap to stop"
    : state === "processing" ? "Thinking…"
    : state === "speaking" ? "Speaking…"
    : "Try again";

  const onTap = () => {
    if (state === "idle" || state === "error") startRecording();
    else if (state === "recording") stopRecording();
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 120px", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Voice Assistant</h1>
        <p style={{ color: "#9aa0a6", marginTop: 6, fontSize: 14 }}>Speak a request — I'll draft emails, schedule events, and reply out loud.</p>
      </header>

      {err && (
        <div style={{ background: "#3a1a1f", border: "1px solid #5a2a30", color: "#ffb4b4", padding: "12px 16px", borderRadius: 10, marginBottom: 16 }}>
          {err}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column-reverse", gap: 12 }}>
        {turns.length === 0 && state !== "recording" && state !== "processing" && (
          <div style={{ color: "#9aa0a6", textAlign: "center", padding: "60px 20px" }}>
            No conversation yet. Tap the mic.
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} style={{
            padding: "12px 16px",
            borderRadius: 14,
            background: t.role === "user" ? "#1c1f26" : "#17263d",
            alignSelf: t.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%",
          }}>
            <div style={{ fontSize: 11, color: "#9aa0a6", marginBottom: 4 }}>{t.role === "user" ? "You" : "Assistant"}</div>
            <div style={{ fontSize: 15, lineHeight: 1.4 }}>{t.text}</div>
            {t.actions && t.actions.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {t.actions.map((a, i) => (
                  <span key={i} style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: a.result.ok ? "#1f3a2a" : "#3a1a1f",
                    color: a.result.ok ? "#7be0a8" : "#ffb4b4",
                  }}>
                    {a.type === "gmail_draft" ? "✉️ Draft" : "📅 Event"} {a.result.ok ? "✓" : "✗"}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <button
          onClick={onTap}
          disabled={state === "processing" || state === "speaking"}
          style={{
            width: 84, height: 84, borderRadius: "50%",
            border: 0,
            background: state === "recording" ? "#c0392b" : state === "error" ? "#5a2a30" : "#1f6feb",
            color: "#fff",
            cursor: (state === "processing" || state === "speaking") ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {state === "recording" ? <StopIcon /> : <MicIcon />}
        </button>
        <div style={{ fontSize: 13, color: "#9aa0a6" }}>{buttonLabel}</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
