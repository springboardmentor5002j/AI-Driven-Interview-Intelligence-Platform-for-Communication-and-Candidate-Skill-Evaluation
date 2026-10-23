# SmartHire AI dashboard update

The dashboard now follows the supplied reference: a fixed slim top bar, grouped left navigation, horizontal learning and event cards, purple and pink accents, and responsive layouts.

## Set up the new features

1. Keep your current Supabase project and existing data.
2. In Supabase SQL Editor, run `supabase/dashboard-migration.sql` after the original SmartHire schema is installed. This additive migration is safe to rerun. Do not rerun the original `schema.sql` on an existing installation.
3. Keep your configured `backend/.env` (copy it into this extracted project). No new external API keys are needed.
4. Start the backend and frontend using the existing commands or the two `.bat` launchers. Visit `http://127.0.0.1:5173/login`.

For a brand-new Supabase project, replace the administrator email in `schema.sql`, run that file once, then run `dashboard-migration.sql`. Keep Google provider/callback configuration as described in README.md.

## Included features

- Courses: six curated courses, three text lessons and exercises per course, enrollment, per-lesson completion/undo and saved progress. Topics cover Java, React, SQL, API testing, Python and communication.
- Career paths: four paths with linked courses, completion counts and follow/unfollow.
- Events: authorized recruiters and administrators publish listings. Recruiters can remove only their own events; administrators can remove any listing; candidates register or cancel interest. Past events cannot receive new registrations.
- Jobs: administrators and authorized recruiters publish listings. Recruiters can remove only their own jobs. Candidates save/unsave jobs and follow HTTPS employer application links.
- Leaderboard: opt-in public aliases, completed lesson counts and best fixed mock-test result. Lesson progress is self-reported. It is a participation board, not a hiring score.
- Profile: editable name, headline, location, biography, skills, career goal, GitHub and LinkedIn links. Sign-in email and account role cannot be changed here. Profile fields are owner-private; the existing assessment consent workflow remains separate.
- Settings: preferred learning topic, compact course cards, leaderboard participation and public alias.
- Interview prep: communication lessons and a preparation checklist connected to resume checks, tests and recorded interviews.
- Dashboard utilities: catalog search, real saved-activity notifications, actual activity-day streak, preparation metrics, learning counts, and expanded JSON report export.
- Existing features retained: Google login, administrator recruiter email authorization, explicit candidate consent/revocation, resume rubric, mock tests, video recording, browser transcription and private playback/downloads. Microphone muting now also stops the separate speech recognizer; unmuting attempts to restart it while recording.

Events and jobs intentionally start empty. Authorized recruiters and administrators can add real events through `/candidate?view=Events`, and admins/recruiters can publish jobs through their Jobs section. No external listings were scraped or invented. Event registration records interest inside SmartHire; external tickets and job applications follow organizer/employer instructions.

## New API and files

`backend/app/hub.py` defines `/api/hub/catalog` (GET, POST, DELETE), `/account` (GET), `/profile` and `/preferences` (POST), `/actions` (POST, DELETE), and `/leaderboard` (GET). It uses the existing bearer-session verifier and token-scoped Supabase gateway.

`frontend/src/Hub.tsx` implements learning, paths, opportunities and account pages. `src/lib/hub-client.ts` defines the typed client. `src/dashboard.css` styles the reference-inspired shell. `Workspace.tsx` connects navigation, overview, account data and new learning activity to the existing tools.

`supabase/dashboard-migration.sql` creates `catalog_items`, `hub_profiles`, `hub_preferences` and `hub_actions`, seeds courses/paths, and installs RLS plus `valid_hub_action()` and `hub_leaderboard()`. The leaderboard recomputes fixed-test correctness from answers instead of trusting a stored score, and exposes no email, owner UUID or transcript. Lesson references are checked against the catalog even for direct Supabase REST writes.

`backend/app/data/catalog.json` is the canonical seed content. When changing it, update the seed inserts in the migration too. Existing learner action identifiers should remain stable.

## Current boundaries

The update does not add Whisper, AI evaluation, face analysis, speaker verification, social feeds, paid course checkout or a job-application tracking service. Learning lessons are text with exercises, not video courses or certified assessments. Saved interests are not tickets. The old hosted TypeScript Site remains separate; this downloadable edition runs Python FastAPI and needs a Python-capable host for deployment.

API tests mock Supabase; running them does not certify your live RLS policies or Google provider setup. Browser visual/device testing is not available in this environment, so verify responsive appearance and mic/camera behavior locally after setup. See VALIDATION.md for executed checks.

## Posting permissions update

Only authorized recruiters and administrators can publish events and job posts. Candidates cannot publish listings, including through direct API requests. Recruiters can remove their own listings; administrators can remove any event or job listing. Rerun dashboard-migration.sql to apply the updated catalog RLS policies.
