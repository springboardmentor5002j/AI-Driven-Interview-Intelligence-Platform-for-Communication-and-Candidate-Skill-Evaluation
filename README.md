# SmartHire AI — FastAPI + React dashboard edition

Start with `DASHBOARD_UPDATE.md` for the new dashboard and features. Existing Supabase projects must run the additive `supabase/dashboard-migration.sql` once; keep the original schema and data. New projects run the base schema first and the dashboard migration second.

The application has been converted to a Python FastAPI backend and a standalone React/Vite frontend. Supabase remains responsible for Google authentication, PostgreSQL data and private file storage. The existing candidate/recruiter/admin interfaces and consent workflow are retained.

## Project structure

- `backend/app/main.py`: Python API endpoints and optional serving of the built React app.
- `backend/app/supabase.py`: verified Supabase user identity, roles, token-scoped upstream requests.
- `backend/app/assessment.py`: server-side resume rubric and mock-test grading.
- `backend/tests/test_api.py`: real FastAPI endpoint tests with mocked Supabase HTTP.
- `frontend/src`: React components, dashboards, Google login and browser media capture.
- `supabase/schema.sql`: existing tables, role/consent policies and private Storage bucket.

No Vinext, Next.js, Cloudflare Workers, D1 or R2 dependency is required by this converted project. The UI uses React with TypeScript, not a TypeScript backend. Python FastAPI implements all application API routes.

## Requirements

- Python 3.10 or newer (tested with Python 3.12).
- Node.js 22.13 or newer and npm.
- Your existing Supabase project with the SmartHire schema and Google provider enabled.

## Keep your existing Supabase data

If you already ran the supplied SmartHire Supabase schema in an earlier version, keep using that project. The tables and policies are unchanged; do not rerun the CREATE statements on an existing installation. Candidates, recruiter roles, grants, resumes and recordings remain in the same Supabase project and can be read by the converted app. Hosted D1/R2 fallback data is a separate dataset and is not automatically migrated.

For a new project, replace `replace_with_admin_email@example.com` in `supabase/schema.sql` with your lowercase administrator Google email, then run the SQL once in Supabase SQL Editor, followed by `supabase/dashboard-migration.sql`.

## Configure environment values

Copy `backend/.env.example` to `backend/.env`. You may instead copy your existing root `.env` to the converted project root; the backend loads that as a fallback. Set:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_UPLOAD_MB=80
```

Use a public publishable/anon key. The app rejects a service-role or secret key in this setting. Roles, including the administrator, come from the protected Supabase `role_allowlist` table. `ADMIN_EMAIL` from the previous fallback configuration does not grant Supabase administrator permissions.

Google client ID and client secret belong in Supabase Authentication > Providers > Google, not the React code. Google Cloud's authorized redirect URI must be the callback displayed by that Supabase project, such as:

`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

In Supabase Authentication > URL Configuration, allow:

- `http://localhost:5173/login`
- `http://127.0.0.1:5173/login`
- `http://127.0.0.1:8000/login` if serving the production React build through FastAPI.
- Your eventual production origin followed by `/login`.

Choose one frontend hostname and keep it consistent throughout the Google flow. Changing the backend language does not repair incorrectly configured Google client credentials. Check Supabase Auth logs if provider code exchange still fails.

## Windows — two terminals

Extract the ZIP and open the extracted project root in VS Code.

Terminal 1, backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2, frontend:

```powershell
cd frontend
npm ci
npm run dev
```

These commands do not require PowerShell virtual-environment activation. Open `http://127.0.0.1:5173/login`. The Vite proxy forwards `/api` to the Python backend on port 8000.

API docs: `http://127.0.0.1:8000/docs`.
Health check: `http://127.0.0.1:8000/api/health`.

Keep both terminals running; Ctrl+C stops the corresponding server. If port 8000 is already occupied, stop the old server or change the backend port and set `API_PROXY_TARGET` in `frontend/.env` to match it.

Optional Windows shortcuts `run-backend.bat` and `run-frontend.bat` install dependencies and start each server in its own terminal. They do not insert real credentials into `.env`.

## Linux / macOS

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal, `cd frontend`, `npm ci`, `npm run dev`.

## Candidate and recruiter flow

1. Login page asks for Candidate Login or Recruiter Login; Administrator Login is also available.
2. New/unlisted identities default to candidates.
3. Administrator authorizes recruiter Google emails through `/admin`.
4. Unlisted emails cannot enter the recruiter portal, even by changing the URL.
5. Candidate explicitly grants an authorized recruiter permission to see their data.
6. Recruiter can view only shared candidate reports and recordings.
7. Candidate consent revocation or recruiter role removal prevents future access. Previously downloaded copies cannot be recalled.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Python backend status |
| GET | `/api/config` | Supabase public configuration |
| POST | `/api/login` | Verify selected login portal |
| GET | `/api/data` | Own activity or consented recruiter records |
| POST | `/api/data` | Save resume/test/interview/template or grant |
| DELETE | `/api/data?id=...` | Revoke a candidate grant |
| GET | `/api/roles` | Admin lists roles |
| POST | `/api/roles` | Admin authorizes a recruiter email |
| DELETE | `/api/roles?email=...` | Admin removes recruiter authorization |
| POST | `/api/files` | Upload a private resume or recording |
| GET | `/api/files?key=...` | Authorized streaming of a private file |

## Build and production serving

```sh
cd frontend
npm ci
npm run build
```

Start FastAPI normally from `backend`. When `frontend/dist` exists, it serves the built React app and SPA routes as well as the API from the same origin. Development remains a two-server workflow on ports 5173 and 8000. For external deployment, use HTTPS for camera/microphone and OAuth; configure the frontend origin and Supabase redirect allowlist accordingly.

## Tests

From `backend`, run `.venv\Scripts\python.exe -m pytest -q` on Windows or `.venv/bin/python -m pytest -q` on Linux.

Tests exercise the actual FastAPI handlers with mocked Supabase HTTP. They verify token rejection, role enforcement, grants/revocation, private recording access, server-side grading, uploads and validation. They do not validate a remote Supabase project's SQL/RLS installation, Google provider configuration or real camera/microphone behavior.

## Existing feature limits

Resume readiness is a transparent rule-based rubric, not an employer's ATS score or an AI model. Interview questions are curated skill/domain templates. Speech transcription uses browser support and may use its speech service. No OpenAI/Whisper API evaluation, emotion recognition, eye tracking or speaker identity verification has been added in this architecture conversion. Scanned PDFs require manually entered text. Supabase's global upload limit may be lower than `MAX_UPLOAD_MB`, depending on the project configuration; keep recordings within the supported limit.

The earlier ChatGPT-hosted Site remains the earlier TypeScript backend deployment. This downloadable project is the Python conversion; a Python-capable server is required to deploy it.
