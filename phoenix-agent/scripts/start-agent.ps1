# Phoenix Agent - Quick Start Script
# For running the agent in console mode (not as a service)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Phoenix Agent - Quick Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to agent directory
$agentDir = Split-Path $PSScriptRoot -Parent
Set-Location $agentDir

# Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please install Python 3.10+ and add to PATH"
    exit 1
}

Write-Host "Python: $($python.Source)" -ForegroundColor Green

# Check if virtual environment exists
$venvPath = Join-Path $agentDir "venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

if (Test-Path $venvPython) {
    Write-Host "Using virtual environment" -ForegroundColor Green
    $pythonExe = $venvPython
} else {
    Write-Host "Using system Python" -ForegroundColor Yellow
    $pythonExe = $python.Source
}

# Check dependencies
Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow
& $pythonExe -c "import firebase_admin; import psutil" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    & $pythonExe -m pip install -r requirements.txt
}

# Check configuration
$configPath = Join-Path $agentDir "config\agent-config.json"
$serviceAccountPath = Join-Path $agentDir "config\service-account.json"

if (-not (Test-Path $configPath)) {
    Write-Host "ERROR: Configuration not found: $configPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $serviceAccountPath)) {
    Write-Host "ERROR: Service account not found: $serviceAccountPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please download your service account key from Firebase Console:"
    Write-Host "1. Go to Firebase Console > Project Settings > Service Accounts"
    Write-Host "2. Click 'Generate new private key'"
    Write-Host "3. Save as: $serviceAccountPath"
    exit 1
}

Write-Host ""
Write-Host "Starting Phoenix Agent..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Run agent
& $pythonExe agent.py
