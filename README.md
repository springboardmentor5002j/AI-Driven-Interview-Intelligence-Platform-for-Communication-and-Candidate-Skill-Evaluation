# SmartHire AI
### AI-Powered Mock Interview and Candidate Assessment Platform

SmartHire AI is a web application for conducting mock interviews, analyzing candidate responses, generating assessment feedback, managing candidate reports, and comparing eligible candidates.

## Features

- User authentication with role-based access for candidates, recruiters, and administrators.
- Resume upload and AI-assisted extraction of skills, technologies, education, experience, and summary.
- Interview creation and question generation.
- Audio/video interview recording and speech-analysis workflows.
- AI-assisted assessment scoring and feedback.
- Candidate reports and recruiter access management.
- Side-by-side comparison of eligible candidate assessments.
- Local development storage or private AWS S3 storage for uploaded files.

## Technology Stack

- **Frontend:** React, Vite, JavaScript, Axios
- **Backend:** Python, Django, Django REST Framework
- **Authentication:** JSON Web Tokens (JWT)
- **Database:** SQLite for local development; PostgreSQL when configured
- **File storage:** Local filesystem or Amazon S3
- **AI services:** OpenRouter and other providers configured in the backend environment
- **Cloud tools:** AWS CLI v2 (for AWS administration and credential configuration)

---

## Requirements

Install the following before setting up the project:

- Python 3.12 or 3.13
- Node.js compatible with Vite 8 (Node.js 20.19+ or 22.12+ recommended; use a current LTS release)
- npm (included with Node.js)
- Git (optional)
- AWS CLI v2 (only required for AWS CLI commands and S3 credential setup)

An internet connection is required to install dependencies and use configured external AI services.

## 1. Install Dependencies

Open PowerShell in the project root (the directory containing `backend`, `frontend`, and `setup.ps1`).

Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup.ps1
```

The setup script creates the backend virtual environment, installs Python packages from `backend/requirements.txt`, installs frontend dependencies, and attempts to install AWS CLI v2 if it is not already available.

If Python or Node.js is missing, install it first, reopen PowerShell, and rerun the setup script.

## 2. Configure Environment Variables and API Keys

Copy the example environment file if setup has not already created it:

```powershell
Copy-Item backend\.env.example backend\.env
```

If `backend\.env` already exists, do not overwrite it.

Open `backend/.env` in a text editor and configure the values needed for your environment. Keep this file private; never commit it to a public repository or include it in a public release.

### Django application settings

Set a unique secret key and development settings, for example:

```dotenv
SECRET_KEY=replace-with-a-long-random-secret
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
USE_SQLITE=True
```

Use `DEBUG=True` only for local development. Production deployments require `DEBUG=False`, a secure secret key, explicit allowed hosts, HTTPS, and production-grade database configuration.

### OpenRouter

OpenRouter is used by the project's shared AI client for supported AI-generated functionality, including resume structuring and interview-related workflows.

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Create an API key in your OpenRouter account and replace the placeholder. Never place this key in frontend code.

### Other AI or speech providers

The backend settings may support additional providers for speech transcription or analysis. Configure only the providers used by your current project code. For example, if the configured speech workflow uses Gemini:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

If the configured workflow uses Deepgram:

```dotenv
DEEPGRAM_API_KEY=your-deepgram-api-key
```

Only add keys for providers you have configured and intend to use. Provider availability, account credits, quotas, and model access are controlled by those providers.

### Frontend API URL

The frontend defaults to the local Django API. If a `frontend/.env` file is needed, set:

```dotenv
VITE_API_URL=http://localhost:8000/api
```

Do not put private API keys or AWS credentials in any `VITE_*` variable; Vite variables are exposed to the browser.

---

## 3. Configure AWS S3 (Optional)

AWS S3 is optional when using local file storage. To store resumes and interview recordings in S3, an AWS account owner must create or select a private bucket and grant the application appropriate permissions.

### 3.1 Install and verify AWS CLI v2

Verify installation:

```powershell
aws --version
```

If it is not installed, install AWS CLI v2 from the official AWS installation guide:
https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

Open a new PowerShell terminal after installation if `aws` is not recognized.

### 3.2 Configure AWS credentials

Use an authorized IAM identity or your organization's approved sign-in method. Do not use or share AWS root-account access keys.

For an authorized IAM access-key profile:

```powershell
aws configure
```

Enter the access key, secret access key, default region (for example, `ap-south-1` if that is the bucket's region), and output format (`json`).

For AWS IAM Identity Center (SSO), use:

```powershell
aws configure sso
aws sso login --profile YOUR_PROFILE_NAME
```

Verify the identity:

```powershell
aws sts get-caller-identity
```

The identity must have permission to access the intended bucket. Installing AWS CLI does not create a bucket, sign in automatically, or grant permissions.

### 3.3 Set S3 configuration in `backend/.env`

Use the actual bucket name and region assigned to your deployment:

```dotenv
USE_S3=True
AWS_STORAGE_BUCKET_NAME=your-private-bucket-name
AWS_S3_REGION_NAME=ap-south-1
```

If using the standard AWS CLI credential chain, do not add long-lived AWS access keys to the project `.env`; let boto3 use the configured AWS profile or role. If your deployment specifically uses environment-based credentials, follow the account administrator's approved secret-management approach.

Keep the bucket private. The application is configured to use authenticated, time-limited URLs for stored objects when S3 is enabled. Do not enable public bucket access for resumes or interview recordings.

If `USE_S3=False`, the app uses local filesystem storage and AWS credentials are not required for uploads.

---

## 4. Database Setup

The default development configuration uses SQLite. To create or update the schema, run the migration command from the backend directory:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py migrate
```

If the application is configured to use PostgreSQL (`USE_SQLITE=False`), PostgreSQL must be installed and running, and the `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` values in `backend/.env` must be correct.

To create a Django administrator account when needed:

```powershell
python manage.py createsuperuser
```

---

## 5. Run SmartHire AI Locally

Run the backend and frontend in separate PowerShell terminals.

### Terminal 1 — Django backend

From the project root:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py runserver
```

The backend is available at:

```text
http://127.0.0.1:8000/
```

### Terminal 2 — React frontend

From the project root:

```powershell
cd frontend
npm run dev
```

Vite prints the local frontend address, normally:

```text
http://localhost:5173/
```

Open that address in a browser and sign in through the application.

To stop either server, press `Ctrl+C` in its terminal.

---

## 6. Troubleshooting

### `aws` is not recognized

Confirm AWS CLI v2 is installed:

```powershell
aws --version
```

If installation just completed, open a new terminal. If still unavailable, install AWS CLI v2 using the official AWS installer.

### Resume upload fails

- Confirm the backend is running and the frontend API URL points to `http://localhost:8000/api`.
- Sign in to the application before uploading.
- Check that the file is a valid, non-empty PDF within the application's configured size limit.
- Review the Django terminal for the actual error.
- With `USE_S3=False`, local storage is used and AWS credentials are not required.
- With `USE_S3=True`, verify bucket name, region, AWS identity, and bucket permissions.

### AI-generated fields are empty or unavailable

- Confirm the required provider API key is set in `backend/.env`.
- Restart Django after changing environment settings.
- Check provider credits, quotas, model access, and the Django terminal for the provider error.
- Never expose API keys in screenshots, frontend code, or public repositories.

### Frontend dependency or Node.js errors

Check versions:

```powershell
node --version
npm --version
```

Then, from `frontend`, run:

```powershell
npm install
npm run dev
```

### Django configuration errors

From `backend`, activate the environment and run:

```powershell
python manage.py check
```

Review the reported configuration or dependency error before proceeding.

---

## Security Notes

- Never commit `.env` files, API keys, AWS credentials, database passwords, or Django secret keys.
- Do not expose private resumes, interview recordings, or candidate assessment data publicly.
- Grant recruiters access only to candidates they are authorized to view.
- Use HTTPS, `DEBUG=False`, secure secret management, proper database backups, and restrictive storage permissions in production.
- The local Django development server is intended for development, not public production hosting.

