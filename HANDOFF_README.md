# SmartHire AI — Windows handoff

## What to include in the project ZIP

Keep:
- `setup.ps1`
- `backend/requirements.txt`
- `backend/.env.example`
- all backend application code and migrations
- `frontend/package.json`
- `frontend/package-lock.json` (if present)
- all frontend source files and public assets
- this README

Exclude:
- `backend/.env` (contains secrets and machine-specific settings)
- `backend/.venv/`
- `frontend/node_modules/`
- `frontend/dist/`
- Python `__pycache__/` folders and `.pyc` files
- `backend/db.sqlite3` unless you deliberately want to transfer the existing local accounts/interviews
- private resume uploads and audio/video recordings unless a secure data transfer is intentional
- AWS credentials or credential files

## First-time setup (Windows 10/11)

Prerequisites:
1. Python 3.12 or 3.13.
2. A current Node.js LTS version compatible with Vite 8 (Node 22.12+ recommended).
3. Internet access to download packages.

Extract the project ZIP. Keep `setup.ps1` in the project root beside the `backend` and `frontend` folders.

Open PowerShell in the project root and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup.ps1
```

The script:
- creates `backend/.venv` if it does not exist;
- installs packages from `backend/requirements.txt`;
- installs frontend dependencies with `npm ci` when a lockfile exists, otherwise `npm install`;
- copies `backend/.env.example` to `backend/.env` only if `.env` does not already exist;
- attempts AWS CLI v2 installation with winget and verifies whether the CLI became available.

If Python or Node.js is missing/outdated, install it from the official Python or Node.js website, reopen PowerShell, and rerun setup. If AWS CLI installation fails, setup reports that separately; AWS CLI is not required for local resume uploads when `USE_S3=False`.

## Configure environment

Open `backend/.env`. Review settings and add your own provider keys for AI/speech features. Do not share this file or commit it to a public repository.

Default local storage should be used for a clean local install:
- `USE_S3=False`
- `USE_SQLITE=True`

The backend `.env.example` currently has these defaults. With local storage enabled, AWS credentials and AWS CLI login are not required just to upload a resume. If you intentionally enable S3 (`USE_S3=True`), the bucket name, region, and authorized AWS credentials/permissions must be configured. AWS CLI installation does not sign in to AWS, create a bucket, or grant permissions. Never use/share AWS root credentials for application access.

If `backend/.env` uses PostgreSQL instead of SQLite, a PostgreSQL server and matching database configuration are also required.

## Start the application (the normal commands)

Open TWO PowerShell terminals in the project root.

### Terminal 1 — backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py runserver
```

If migrations were already applied, `migrate` is safe to rerun; Django reports that there is nothing to apply. Keep this terminal open.

### Terminal 2 — frontend

```powershell
cd frontend
npm run dev
```

Keep this terminal open and open `http://localhost:5173` in the browser.

Stop each server with `Ctrl+C`.

## AWS CLI commands (only if needed)

Check whether AWS CLI is installed:

```powershell
aws --version
```

`aws login` is not a general AWS CLI command. For an authorized access-key profile, use `aws configure`. For an organization's IAM Identity Center/SSO, use `aws configure sso` and then `aws sso login --profile PROFILE_NAME`.

Only use credentials provided through the AWS account owner/administrator and with the minimum permissions required. Do not send credentials through chat or include them in the ZIP.

## Troubleshooting

- If `python` isn't found, install Python 3.12/3.13 and reopen PowerShell.
- If `npm` isn't found or Node is too old, install current Node.js LTS and reopen PowerShell.
- If `npm ci` fails, verify that `package-lock.json` matches `package.json`; only regenerate the lockfile in a development copy if needed.
- If the frontend cannot reach the backend, confirm the Django server is running at `http://localhost:8000` and inspect `frontend/src/api/axios.js` for the configured API base URL.
- If resume uploads fail, check the response in browser DevTools (F12 → Network) for `POST /api/resumes/upload/`. With local storage enabled, AWS CLI is not a prerequisite.
- If AWS CLI isn't installed, setup prints a warning rather than pretending installation succeeded. Install from the official AWS CLI documentation and verify `aws --version` in a new PowerShell window.

## Scope

This is a local development setup, not production deployment. Setup does not migrate existing accounts/interviews from another computer and does not create AWS resources or configure billing.
