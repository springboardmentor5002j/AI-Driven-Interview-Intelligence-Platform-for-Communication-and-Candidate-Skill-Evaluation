$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

function Write-Section([string]$Message) {
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}
function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Section "SmartHire AI setup"

if (!(Test-Path (Join-Path $Backend "manage.py")) -or !(Test-Path (Join-Path $Frontend "package.json"))) {
    throw "Project layout not recognized. Keep setup.ps1 in the project root beside the backend and frontend folders."
}

# Python: prefer 3.13, then 3.12. Vite 8 needs a recent Node version.
$PythonExe = $null
if (Test-Command "py") {
    foreach ($v in @("3.13", "3.12")) {
        & py "-$v" --version *> $null
        if ($LASTEXITCODE -eq 0) {
            $PythonExe = "py"
            $PythonArgs = @("-$v")
            break
        }
    }
}
if (-not $PythonExe -and (Test-Command "python")) {
    $versionText = (& python --version 2>&1 | Out-String).Trim()
    if ($versionText -match "Python 3\.(12|13)\.") {
        $PythonExe = "python"
        $PythonArgs = @()
    }
}
if (-not $PythonExe) {
    throw "Python 3.12 or 3.13 was not found. Install it from https://www.python.org/downloads/windows/ (enable Add Python to PATH), reopen PowerShell, and rerun .\setup.ps1."
}

if (!(Test-Command "node") -or !(Test-Command "npm")) {
    throw "Node.js and npm are required. Install the current Node.js LTS from https://nodejs.org/, reopen PowerShell, then rerun .\setup.ps1."
}
$nodeVersionText = (& node --version 2>&1 | Out-String).Trim()
if ($nodeVersionText -notmatch '^v?(\d+)\.') {
    throw "Could not determine Node.js version ($nodeVersionText). Install a current Node.js LTS release."
}
$nodeMajor = [int]$Matches[1]
$nodeVersion = [version](($nodeVersionText -replace '^v','') -replace '-.*$','')
# Vite 8 needs Node >=20.19.0 or >=22.12.0 (or a newer supported major).
$nodeOk = ($nodeMajor -gt 22) -or ($nodeMajor -eq 22 -and $nodeVersion -ge [version]"22.12.0") -or ($nodeMajor -eq 20 -and $nodeVersion -ge [version]"20.19.0")
if (-not $nodeOk) {
    throw "Node.js $nodeVersionText is too old for this project's Vite version. Install Node.js 22.12+ LTS from https://nodejs.org/ and rerun setup."
}

# AWS CLI is optional for local development when USE_S3=False. Try winget, verify, and continue if unavailable.
Write-Section "AWS CLI v2 (optional for local uploads)"
$awsExe = $null
$awsCmd = Get-Command aws -ErrorAction SilentlyContinue
if ($awsCmd) {
    $awsExe = $awsCmd.Source
} else {
    $commonAwsPaths = @(
        "$env:ProgramFiles\Amazon\AWSCLIV2\aws.exe",
        "$env:ProgramFiles\Amazon\AWSCLIV2\aws.cmd",
        "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2\aws.exe"
    )
    foreach ($candidate in $commonAwsPaths) {
        if (Test-Path $candidate) { $awsExe = $candidate; break }
    }
}
if ($awsExe) {
    & $awsExe --version
    Write-Host "AWS CLI already installed." -ForegroundColor Green
} elseif (Test-Command "winget") {
    Write-Host "Attempting to install AWS CLI v2 with winget..." -ForegroundColor Yellow
    & winget install --id Amazon.AWSCLI --exact --source winget --accept-package-agreements --accept-source-agreements
    $wingetExit = $LASTEXITCODE

    # Refresh PATH in this process because winget/MSI may update machine/user PATH.
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    $awsCmd = Get-Command aws -ErrorAction SilentlyContinue
    if ($awsCmd) { $awsExe = $awsCmd.Source }
    if (-not $awsExe) {
        foreach ($candidate in @("$env:ProgramFiles\Amazon\AWSCLIV2\aws.exe", "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2\aws.exe")) {
            if (Test-Path $candidate) { $awsExe = $candidate; break }
        }
    }

    if ($awsExe) {
        & $awsExe --version
        Write-Host "AWS CLI v2 is installed." -ForegroundColor Green
    } else {
        Write-Warning "AWS CLI installation could not be verified (winget exit code: $wingetExit). Local development can still run with USE_S3=False. To use AWS, install AWS CLI v2 from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html, reopen PowerShell, and verify with: aws --version"
    }
} else {
    Write-Warning "winget is unavailable, so AWS CLI was not installed. Local development can still run with USE_S3=False. Install AWS CLI v2 manually from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html if S3 administration is needed."
}

# Create the venv only if it doesn't already exist.
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
if (!(Test-Path $VenvPython)) {
    Write-Section "Creating backend virtual environment"
    Push-Location $Backend
    try {
        if ($PythonArgs.Count -gt 0) {
            & $PythonExe @PythonArgs -m venv .venv
        } else {
            & $PythonExe -m venv .venv
        }
        if ($LASTEXITCODE -ne 0) { throw "Failed to create backend\.venv." }
    } finally { Pop-Location }
} else {
    Write-Host "Existing backend virtual environment found; keeping it." -ForegroundColor Green
}

$Requirements = Join-Path $Backend "requirements.txt"
if (!(Test-Path $Requirements)) { throw "Missing backend\requirements.txt." }

Write-Section "Installing Python packages"
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed. Check your internet connection and retry." }
& $VenvPython -m pip install -r $Requirements
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed. See the pip error above." }

Write-Section "Installing frontend packages"
Push-Location $Frontend
try {
    if (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install
    }
    if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed. See the npm error above." }
} finally { Pop-Location }

# Create .env from the example without ever overwriting a user's existing secrets.
$EnvFile = Join-Path $Backend ".env"
$EnvExample = Join-Path $Backend ".env.example"
if (!(Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        Write-Host "Created backend\.env from backend\.env.example. Review it before starting the app." -ForegroundColor Yellow
    } else {
        Write-Warning "backend\.env.example was not found. You will need to create backend\.env yourself."
    }
} else {
    Write-Host "Existing backend\.env preserved." -ForegroundColor Green
}

Write-Section "Setup complete"
Write-Host "To run the backend, open PowerShell and use:" -ForegroundColor Green
Write-Host "  cd backend"
Write-Host "  .\.venv\Scripts\Activate.ps1"
Write-Host "  python manage.py migrate"
Write-Host "  python manage.py runserver"
Write-Host ""
Write-Host "To run the frontend in a SECOND PowerShell terminal:" -ForegroundColor Green
Write-Host "  cd frontend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Then open http://localhost:5173"
Write-Host "Resume uploads should use local storage when backend\.env has USE_S3=False."
Write-Host "AWS CLI installation does not sign in to AWS or grant S3 access."
