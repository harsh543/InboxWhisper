const BASE = "https://sauna.local/v1/elevenlabs/v1";
const VOICE = "ys3XeJJA4ArWMhRpcX1D";

export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model_id", "scribe_v2");
  const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text()}`);
  const { text } = (await res.json()) as { text: string };
  return text;
}

export async function streamTts(text: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE}/text-to-speech/${VOICE}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
  });
  if (!res.ok || !res.body) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  return res.body;
}
