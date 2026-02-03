# Hytale Server Agent - Windows Service Installation Script
# Requires NSSM (Non-Sucking Service Manager) - https://nssm.cc/

param(
    [string]$ServiceName = "HytaleServerAgent",
    [string]$AgentPath = $PSScriptRoot,
    [string]$NodePath = "C:\Program Files\nodejs\node.exe",
    [string]$GithubToken = "",
    [string]$CommandSecret = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Hytale Server Agent - Service Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check for NSSM
$nssmPath = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssmPath) {
    Write-Host "NSSM not found. Attempting to download..." -ForegroundColor Yellow
    
    $nssmDir = "$env:ProgramFiles\nssm"
    $nssmExe = "$nssmDir\nssm.exe"
    
    if (-not (Test-Path $nssmDir)) {
        New-Item -ItemType Directory -Path $nssmDir -Force | Out-Null
    }
    
    if (-not (Test-Path $nssmExe)) {
        $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
        $zipPath = "$env:TEMP\nssm.zip"
        
        try {
            Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath
            Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\nssm" -Force
            Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $nssmExe -Force
            Remove-Item $zipPath -Force
            Remove-Item "$env:TEMP\nssm" -Recurse -Force
            Write-Host "NSSM downloaded successfully" -ForegroundColor Green
        } catch {
            Write-Host "Failed to download NSSM. Please install manually from https://nssm.cc/" -ForegroundColor Red
            exit 1
        }
    }
    
    # Add to PATH for this session
    $env:Path += ";$nssmDir"
    $nssmPath = $nssmExe
} else {
    $nssmPath = $nssmPath.Source
}

Write-Host "Using NSSM: $nssmPath" -ForegroundColor Gray

# Resolve agent path
$AgentPath = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentScript = Join-Path $AgentPath "agent.js"
$ConfigPath = Join-Path $AgentPath "config.json"

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Service Name: $ServiceName"
Write-Host "  Agent Path:   $AgentPath"
Write-Host "  Node Path:    $NodePath"
Write-Host ""

# Check prerequisites
if (-not (Test-Path $NodePath)) {
    Write-Host "ERROR: Node.js not found at $NodePath" -ForegroundColor Red
    Write-Host "Please install Node.js or specify the correct path with -NodePath" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $AgentScript)) {
    Write-Host "ERROR: agent.js not found at $AgentScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ConfigPath)) {
    Write-Host "WARNING: config.json not found at $ConfigPath" -ForegroundColor Yellow
    Write-Host "Creating from example..." -ForegroundColor Yellow
    
    $exampleConfig = Join-Path $AgentPath "config.json.example"
    if (Test-Path $exampleConfig) {
        Copy-Item $exampleConfig $ConfigPath
        Write-Host "Please edit $ConfigPath before starting the service" -ForegroundColor Yellow
    } else {
        Write-Host "ERROR: No config example found" -ForegroundColor Red
        exit 1
    }
}

# Prompt for credentials if not provided
if (-not $GithubToken) {
    Write-Host ""
    $GithubToken = Read-Host "Enter GitHub Token (PAT)"
}

if (-not $CommandSecret) {
    $CommandSecret = Read-Host "Enter Command Secret (for HMAC signing)"
}

if (-not $GithubToken -or -not $CommandSecret) {
    Write-Host "ERROR: Both GitHub Token and Command Secret are required" -ForegroundColor Red
    exit 1
}

# Check if service already exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host ""
    Write-Host "Service '$ServiceName' already exists." -ForegroundColor Yellow
    $response = Read-Host "Do you want to reinstall? (y/n)"
    
    if ($response -eq 'y') {
        Write-Host "Stopping and removing existing service..." -ForegroundColor Yellow
        & $nssmPath stop $ServiceName 2>$null
        Start-Sleep -Seconds 2
        & $nssmPath remove $ServiceName confirm
        Start-Sleep -Seconds 2
    } else {
        Write-Host "Installation cancelled" -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "Installing service..." -ForegroundColor Cyan

# Install the service
& $nssmPath install $ServiceName $NodePath $AgentScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install service" -ForegroundColor Red
    exit 1
}

# Configure service parameters
Write-Host "Configuring service..." -ForegroundColor Cyan

& $nssmPath set $ServiceName AppDirectory $AgentPath
& $nssmPath set $ServiceName DisplayName "Hytale Server Manager Agent"
& $nssmPath set $ServiceName Description "Remote management agent for Hytale dedicated server"
& $nssmPath set $ServiceName Start SERVICE_AUTO_START
& $nssmPath set $ServiceName AppStdout (Join-Path $AgentPath "logs\service-stdout.log")
& $nssmPath set $ServiceName AppStderr (Join-Path $AgentPath "logs\service-stderr.log")
& $nssmPath set $ServiceName AppRotateFiles 1
& $nssmPath set $ServiceName AppRotateBytes 10485760

# Set environment variables
& $nssmPath set $ServiceName AppEnvironmentExtra "GITHUB_TOKEN=$GithubToken" "COMMAND_SECRET=$CommandSecret" "CONFIG_PATH=$ConfigPath"

# Create logs directory
$logsDir = Join-Path $AgentPath "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Write-Host ""
Write-Host "Service installed successfully!" -ForegroundColor Green
Write-Host ""

# Ask to start service
$startNow = Read-Host "Start service now? (y/n)"
if ($startNow -eq 'y') {
    Write-Host "Starting service..." -ForegroundColor Cyan
    & $nssmPath start $ServiceName
    
    Start-Sleep -Seconds 3
    $service = Get-Service -Name $ServiceName
    
    if ($service.Status -eq 'Running') {
        Write-Host "Service is running!" -ForegroundColor Green
    } else {
        Write-Host "Service failed to start. Check logs at:" -ForegroundColor Red
        Write-Host "  $logsDir\service-stderr.log" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Installation Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  Start:   nssm start $ServiceName"
Write-Host "  Stop:    nssm stop $ServiceName"
Write-Host "  Restart: nssm restart $ServiceName"
Write-Host "  Status:  nssm status $ServiceName"
Write-Host "  Remove:  nssm remove $ServiceName"
Write-Host "  Edit:    nssm edit $ServiceName"
Write-Host ""
