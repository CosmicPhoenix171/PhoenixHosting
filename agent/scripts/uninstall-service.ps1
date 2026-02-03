# Hytale Server Agent - Windows Service Uninstallation Script

param(
    [string]$ServiceName = "HytaleServerAgent"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Hytale Server Agent - Service Uninstall" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    exit 1
}

# Check if service exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existingService) {
    Write-Host "Service '$ServiceName' not found." -ForegroundColor Yellow
    exit 0
}

Write-Host "Current service status: $($existingService.Status)" -ForegroundColor Gray

# Confirm
$response = Read-Host "Are you sure you want to remove the service '$ServiceName'? (y/n)"
if ($response -ne 'y') {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

# Find NSSM
$nssmPath = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssmPath) {
    $nssmPath = "$env:ProgramFiles\nssm\nssm.exe"
    if (-not (Test-Path $nssmPath)) {
        Write-Host "NSSM not found. Trying standard service removal..." -ForegroundColor Yellow
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $ServiceName
        exit 0
    }
} else {
    $nssmPath = $nssmPath.Source
}

Write-Host "Stopping service..." -ForegroundColor Cyan
& $nssmPath stop $ServiceName 2>$null
Start-Sleep -Seconds 3

Write-Host "Removing service..." -ForegroundColor Cyan
& $nssmPath remove $ServiceName confirm

Write-Host ""
Write-Host "Service removed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Configuration and log files have been preserved." -ForegroundColor Yellow
