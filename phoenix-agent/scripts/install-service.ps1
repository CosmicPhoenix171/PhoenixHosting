# Phoenix Agent - Windows Service Installation Script
# Run as Administrator

<#
.SYNOPSIS
    Installs Phoenix Agent as a Windows Service using NSSM.

.DESCRIPTION
    This script downloads NSSM (Non-Sucking Service Manager) if not present,
    and configures Phoenix Agent to run as a Windows service that:
    - Starts automatically on boot
    - Restarts on failure
    - Runs under a local service account

.NOTES
    Must be run as Administrator
#>

param(
    [switch]$Uninstall,
    [string]$ServiceName = "PhoenixAgent",
    [string]$InstallPath = $PSScriptRoot
)

# Requires Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator!"
    exit 1
}

$ErrorActionPreference = "Stop"

# Configuration
$NssmVersion = "2.24"
$NssmUrl = "https://nssm.cc/release/nssm-$NssmVersion.zip"
$NssmPath = Join-Path $InstallPath "tools\nssm.exe"
$PythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source
$AgentScript = Join-Path (Split-Path $InstallPath -Parent) "agent.py"
$LogPath = Join-Path (Split-Path $InstallPath -Parent) "logs"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "=" * 60 -ForegroundColor Cyan
}

function Install-NSSM {
    Write-Host "Checking for NSSM..." -ForegroundColor Yellow
    
    if (Test-Path $NssmPath) {
        Write-Host "NSSM already installed at: $NssmPath" -ForegroundColor Green
        return
    }
    
    Write-Host "Downloading NSSM..." -ForegroundColor Yellow
    $zipPath = Join-Path $env:TEMP "nssm.zip"
    $extractPath = Join-Path $env:TEMP "nssm-$NssmVersion"
    
    try {
        Invoke-WebRequest -Uri $NssmUrl -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
        
        # Create tools directory
        $toolsDir = Join-Path $InstallPath "tools"
        if (-not (Test-Path $toolsDir)) {
            New-Item -ItemType Directory -Path $toolsDir | Out-Null
        }
        
        # Copy appropriate architecture
        if ([Environment]::Is64BitOperatingSystem) {
            Copy-Item "$extractPath\nssm-$NssmVersion\win64\nssm.exe" $NssmPath
        } else {
            Copy-Item "$extractPath\nssm-$NssmVersion\win32\nssm.exe" $NssmPath
        }
        
        Write-Host "NSSM installed successfully" -ForegroundColor Green
    }
    finally {
        # Cleanup
        Remove-Item $zipPath -ErrorAction SilentlyContinue
        Remove-Item $extractPath -Recurse -ErrorAction SilentlyContinue
    }
}

function Install-Service {
    Write-Header "Installing Phoenix Agent Service"
    
    # Check Python
    if (-not $PythonPath) {
        Write-Error "Python not found in PATH. Please install Python 3.10+ and add to PATH."
        exit 1
    }
    Write-Host "Python found: $PythonPath" -ForegroundColor Green
    
    # Check agent script
    if (-not (Test-Path $AgentScript)) {
        Write-Error "Agent script not found: $AgentScript"
        exit 1
    }
    Write-Host "Agent script: $AgentScript" -ForegroundColor Green
    
    # Install NSSM
    Install-NSSM
    
    # Check if service already exists
    $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Write-Host "Service already exists. Removing old service..." -ForegroundColor Yellow
        & $NssmPath stop $ServiceName
        & $NssmPath remove $ServiceName confirm
    }
    
    Write-Host "Installing service..." -ForegroundColor Yellow
    
    # Install service
    & $NssmPath install $ServiceName $PythonPath $AgentScript
    
    # Configure service
    & $NssmPath set $ServiceName DisplayName "Phoenix Agent"
    & $NssmPath set $ServiceName Description "Phoenix Hosting - Game Server Management Agent"
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START
    & $NssmPath set $ServiceName AppDirectory (Split-Path $AgentScript -Parent)
    
    # Configure logging
    if (-not (Test-Path $LogPath)) {
        New-Item -ItemType Directory -Path $LogPath | Out-Null
    }
    & $NssmPath set $ServiceName AppStdout (Join-Path $LogPath "service-stdout.log")
    & $NssmPath set $ServiceName AppStderr (Join-Path $LogPath "service-stderr.log")
    & $NssmPath set $ServiceName AppRotateFiles 1
    & $NssmPath set $ServiceName AppRotateBytes 10485760
    
    # Configure recovery
    & $NssmPath set $ServiceName AppExit Default Restart
    & $NssmPath set $ServiceName AppRestartDelay 5000
    
    Write-Host ""
    Write-Host "Service installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service Name: $ServiceName"
    Write-Host "Log Path: $LogPath"
    Write-Host ""
    
    # Prompt to start
    $startNow = Read-Host "Start service now? (Y/n)"
    if ($startNow -ne 'n') {
        Write-Host "Starting service..." -ForegroundColor Yellow
        & $NssmPath start $ServiceName
        
        Start-Sleep -Seconds 2
        $service = Get-Service -Name $ServiceName
        if ($service.Status -eq 'Running') {
            Write-Host "Service started successfully!" -ForegroundColor Green
        } else {
            Write-Host "Service status: $($service.Status)" -ForegroundColor Yellow
            Write-Host "Check logs at: $LogPath" -ForegroundColor Yellow
        }
    }
}

function Uninstall-Service {
    Write-Header "Uninstalling Phoenix Agent Service"
    
    if (-not (Test-Path $NssmPath)) {
        Write-Error "NSSM not found. Cannot uninstall service."
        exit 1
    }
    
    $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $existingService) {
        Write-Host "Service not found: $ServiceName" -ForegroundColor Yellow
        return
    }
    
    Write-Host "Stopping service..." -ForegroundColor Yellow
    & $NssmPath stop $ServiceName
    
    Write-Host "Removing service..." -ForegroundColor Yellow
    & $NssmPath remove $ServiceName confirm
    
    Write-Host "Service uninstalled successfully!" -ForegroundColor Green
}

# Main
if ($Uninstall) {
    Uninstall-Service
} else {
    Install-Service
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
