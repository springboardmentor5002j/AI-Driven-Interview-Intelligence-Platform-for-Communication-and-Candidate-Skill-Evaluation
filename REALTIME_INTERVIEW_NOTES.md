# Live transcription upgrade and next steps

## Included
- Browser SpeechRecognition now enables interim results.
- Interim words are shown separately, preventing duplicate words in the editable finalized transcript.
- A diagnostic shows elapsed time from browser speech-start to first recognition result; this is an approximation, not independently measured provider latency.
- Existing question narration, camera, recording, saving, auth and dashboard remain in place.

## Important limitations
This is **not** a complete Chakra-style conversational AI. Current questions are pre-generated, browser speech synthesis reads questions, and browser speech recognition supplies text where supported. No streaming LLM, speech-to-speech API, interruption handling, or guaranteed latency SLA is included.

## For full real-time voice AI
Use a server-issued short-lived credential and WebRTC to a real-time speech model. Keep permanent API secrets on the backend; never ship them in Vite variables. Stream transcripts with turn IDs, cancel pending output on barge-in, and store only consented session data. Measure microphone-to-partial-transcript and end-of-turn-to-first-audio at p50/p95 under real network conditions.

## Running
Run npm ci and npm run build in frontend, and start the existing backend using its README. Microphone permissions and browser STT support are required.
