# Interview question voice update

The interview reads the displayed question aloud when the room opens and whenever you select Next question. Replay question repeats it; Stop voice interrupts it. Closing the room or finishing the recording cancels narration.

Voice uses browser text-to-speech and prefers an English (India) voice when installed. No additional API key or paid service is required. Existing question selection is unchanged; this update adds narration, not a new question-generation model.

Live speech recognition pauses during narration and resumes after it finishes while recording and the microphone are enabled. Use headphones to reduce echo. Browser speech audio is not explicitly mixed into the saved recording.

## Run

1. Extract the ZIP.
2. In frontend, run `npm ci` once, then `npm run dev`, or use run-frontend.bat after installing dependencies.
3. Start the backend as before using run-backend.bat and your existing configuration.
4. Open Mock interview and start the room. If your browser blocks automatic voice playback, click Replay question.
5. Select Record answers. Wait for narration to finish before answering, then select Next question.

Generated dependency folders and Git internals are excluded from this portable ZIP. Project source, configuration, and refreshed frontend/dist are included.

## Files changed

- frontend/src/Workspace.tsx: narration, replay/stop controls, speaking status, transcription coordination, and lifecycle cleanup.
- frontend/dist: rebuilt production frontend.
- VOICE_UPDATE.md: instructions and validation.

## Actual validation

- TypeScript check: passed.
- Vite production build: passed (1,847 modules transformed).
- Eight mocked voice lifecycle checks: passed (speak, resume, replace, stop, mute, close, error, unsupported).
- Build used matching installed dependency versions on Linux because the uploaded node_modules contained Windows native dependencies.
- Audible playback and microphone behavior on your device were not tested. Check first/next question, Replay, Stop voice, microphone mute, and Finish recording in your browser.
