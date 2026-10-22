$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root "frontend"

if (!(Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Host "Frontend dependencies are missing. Run .\setup.ps1 first." -ForegroundColor Yellow
    exit 1
}

Push-Location $Frontend
try {
    npm run dev
} finally {
    Pop-Location
}
