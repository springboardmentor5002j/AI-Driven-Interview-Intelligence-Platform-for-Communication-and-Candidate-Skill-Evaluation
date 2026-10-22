$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"

if (!(Test-Path $Python)) {
    throw "Backend environment not found. Run .\setup.ps1 first."
}
if (!(Test-Path (Join-Path $Backend ".env"))) {
    throw "backend\.env is missing. Copy backend\.env.example to backend\.env and configure it."
}

Push-Location $Backend
try {
    & $Python manage.py check
    if ($LASTEXITCODE -ne 0) { throw "Django check failed. Review backend\.env and the error above." }
    & $Python manage.py migrate
    if ($LASTEXITCODE -ne 0) { throw "Database migration failed. Check your database configuration." }
    & $Python manage.py runserver
} finally {
    Pop-Location
}
