---
name: voice-assistant
description: Voice-first AI assistant — speak, get reasoned replies + Gmail/Calendar/Docs/Sheets actions
manifest_version: 1
enabled: true
visibility: private
---

# Voice Assistant

A press-to-talk voice interface that:

1. Records your voice in the browser (MediaRecorder, webm/opus)
2. Sends the audio to the handler in one POST (`/api/turn`)
3. Transcribes via ElevenLabs (Sauna proxy — no account needed)
4. Reasons about the request via Claude via the Sauna LLM endpoint (no key needed)
5. Dispatches actions to **Gmail (read + draft)**, **Google Calendar (create event)**, **Google Docs (create)**, **Google Sheets (create)**
6. Streams the spoken reply back via ElevenLabs TTS

Pipeline: press-to-talk → MediaRecorder → POST `/api/turn` (audio blob) → handler: STT → LLM (spoken-word-aware structured JSON) → action dispatch → JSON reply. Then a second call to `/api/speak` streams the TTS audio bytes back for browser playback.

## Connections

- `conn_IpcE35CjNeZS` — Gmail (read recent emails + create drafts)
- `conn_DrCzC4UkULoP` — Google Calendar (create events)
- `apn_1Kh7JQE` — Google Docs (create documents with content)
- `apn_eahbypZ` — Google Sheets (create spreadsheets with rows)

ElevenLabs and LLM access ride the Sauna proxy (`sauna.local`), so no separate account needed.

## Bootstrap / external state

None — no upstream webhooks, no config rows, no backfill.
