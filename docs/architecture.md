# SmartHire AI: current architecture and implementation status

This document records the repository state inspected on 3 October 2026 and the first completed feature increment. Existing modules and database tables remain the source of truth; the resume UI uses the existing `Resume` model and upload flow.

## Current structure

- `backend/app/main.py` constructs FastAPI, configures local Vite CORS, creates SQLAlchemy tables, and mounts the auth, user, resume, and interview routers.
- `backend/app/database/database.py` creates the PostgreSQL engine and SQLAlchemy sessions. Configuration currently lives in Python source and needs environment-based configuration during the security/deployment phase.
- `backend/app/models/` contains `User`, `Resume`, `Interview`, `InterviewQuestion`, and `InterviewScore`; startup uses `Base.metadata.create_all`.
- `backend/app/routers/auth.py` handles registration/login and JWT issuance. `users.py` exposes profile and role-specific endpoints. `resume.py` handles owned resume uploads and, now, owned resume listing. `interview.py` implements generation, start, question retrieval, answer saving, completion, evaluation, results, and candidate interview listing.
- `backend/app/services/` contains resume parsing, deterministic question generation, and rule-based scoring. Overall score uses the existing weights: communication 30%, confidence 25%, technical relevance 30%, professionalism 15%.
- `frontend/src/App.jsx` defines React Router routes and authenticated application navigation. `pages/` contains login, resume management, interview generation, interview room, interview list, and result pages. `services/` wraps API calls.
- `docker-compose.yml` and `backend/Dockerfile` exist. Their production readiness remains to be reviewed.

## Feature inventory

| Area | State observed |
| --- | --- |
| JWT registration/login, roles | Implemented in backend; frontend login exists. Registration UI is not present. |
| Resume PDF parsing | Backend extraction for text, skills, education, experience, and summary exists. |
| Resume management | Previously lacked list/UI and typed resume IDs; now has an owned-resume API, upload/library page, extraction display, and selection during generation. |
| Interview pipeline | Generate, start, retrieve questions, save answers, complete, evaluate, fetch result, and list interviews are implemented. |
| Interview room | Text answers, local navigation, progress indicator, and completion exist. Camera, microphone, timer, and speech capture are not implemented. |
| Speech transcription/communication metrics | Not implemented; scoring remains answer-text heuristics. |
| Eye contact/facial expression | Not implemented. |
| Candidate/recruiter/admin dashboards | Profile/role endpoints exist; dedicated dashboards are not present. |
| Reports/notifications | Not implemented. |
| Tests | Existing parser/scoring/database test files are present; coverage of full API journey has not yet been established. |
| Deployment/security | Docker files exist. Configuration, upload controls, migrations, and deployment readiness need additional review. |

## Resume flow added in this increment

1. Candidate authenticates and opens `/resumes`.
2. `GET /resume` returns only that user's metadata and extracted fields.
3. `POST /resume/upload` accepts PDF files up to 10 MiB, verifies the PDF signature and parseability, extracts resume data, and saves it to the existing `resumes` table.
4. Candidate selects an existing resume in `/generate-interview`; the current `POST /interviews/generate?resume_id=...` contract is preserved.

Uploads reject empty, oversized, non-PDF, password-protected, malformed, and textless PDFs. Failed processing rolls back the database session and removes the temporary saved file. Resume filenames are reduced to a basename for display and a safe generated storage name is used.

## Next implementation increments

Proceed in the requested order: interview room improvements; real backend STT (with text fallback); transcript communication metrics; sampled, explicitly estimated visual indicators; transparent confidence indicators while retaining score weights; dashboards; reports and notification infrastructure; security/data review and safe migrations; automated journey tests; Docker/deployment and final documentation. Avoid claiming unavailable AI or visual analysis as implemented.
