# Hytale Server Agent - Quick Start Script (Windows)
# Run this script to start the agent manually for testing

param(
    [string]$GithubToken = $env:GITHUB_TOKEN,
    [string]$CommandSecret = $env:COMMAND_SECRET,
    [string]$LogLevel = "INFO"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Hytale Server Agent - Manual Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to agent directory
$AgentPath = Split-Path -Parent $PSScriptRoot
Set-Location $AgentPath

# Check config
$ConfigPath = Join-Path $AgentPath "config.json"
if (-not (Test-Path $ConfigPath)) {
    Write-Host "ERROR: config.json not found!" -ForegroundColor Red
    Write-Host "Copy config.json.example to config.json and edit it first." -ForegroundColor Yellow
    exit 1
}

# Prompt for credentials if not set
if (-not $GithubToken) {
    $GithubToken = Read-Host "Enter GitHub Token (or set GITHUB_TOKEN env var)"
}

if (-not $CommandSecret) {
    $CommandSecret = Read-Host "Enter Command Secret (or set COMMAND_SECRET env var)"
}

if (-not $GithubToken -or -not $CommandSecret) {
    Write-Host "ERROR: Both GitHub Token and Command Secret are required" -ForegroundColor Red
    exit 1
}

# Set environment variables
$env:GITHUB_TOKEN = $GithubToken
$env:COMMAND_SECRET = $CommandSecret
$env:LOG_LEVEL = $LogLevel
$env:CONFIG_PATH = $ConfigPath

Write-Host "Starting agent..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# Run the agent
node agent.js
