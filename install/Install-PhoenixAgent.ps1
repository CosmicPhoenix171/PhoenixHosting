# Phoenix Agent - Windows Installer
# Downloads and sets up Phoenix Agent with a simple wizard

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Phoenix Hosting - Agent Installer   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check for admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Note: Running without admin rights. Some features may be limited." -ForegroundColor Yellow
    Write-Host ""
}

# Set install directory
$defaultPath = "$env:LOCALAPPDATA\PhoenixAgent"
Write-Host "Where do you want to install Phoenix Agent?"
Write-Host "Default: $defaultPath"
$installPath = Read-Host "Press Enter for default, or type a path"
if ([string]::IsNullOrWhiteSpace($installPath)) {
    $installPath = $defaultPath
}

# Create directory
Write-Host ""
Write-Host "Installing to: $installPath" -ForegroundColor Green
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
New-Item -ItemType Directory -Path "$installPath\config" -Force | Out-Null
New-Item -ItemType Directory -Path "$installPath\logs" -Force | Out-Null

# Download latest release
Write-Host ""
Write-Host "Downloading Phoenix Agent..." -ForegroundColor Cyan
$releasesUrl = "https://api.github.com/repos/CosmicPhoenix171/PhoenixHosting/releases/latest"

try {
    $release = Invoke-RestMethod -Uri $releasesUrl -Headers @{"User-Agent"="PowerShell"}
    $asset = $release.assets | Where-Object { $_.name -like "*Windows*" } | Select-Object -First 1
    
    if ($asset) {
        $downloadUrl = $asset.browser_download_url
        $zipPath = "$env:TEMP\PhoenixAgent.zip"
        
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath $installPath -Force
        Remove-Item $zipPath -Force
        
        Write-Host "Downloaded and extracted successfully!" -ForegroundColor Green
    } else {
        throw "No Windows release found"
    }
} catch {
    Write-Host "Could not download from releases. Downloading source..." -ForegroundColor Yellow
    
    # Fallback: download source and use Python
    $sourceUrl = "https://github.com/CosmicPhoenix171/PhoenixHosting/archive/refs/heads/main.zip"
    $zipPath = "$env:TEMP\PhoenixSource.zip"
    
    Invoke-WebRequest -Uri $sourceUrl -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\PhoenixSource" -Force
    
    Copy-Item "$env:TEMP\PhoenixSource\PhoenixHosting-main\phoenix-agent\*" $installPath -Recurse -Force
    Remove-Item $zipPath -Force
    Remove-Item "$env:TEMP\PhoenixSource" -Recurse -Force
    
    Write-Host "Source downloaded. Python 3.8+ required to run." -ForegroundColor Yellow
}

# Configuration wizard
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         Configuration Wizard          " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "You need a Firebase project to use Phoenix Hosting."
Write-Host "If you don't have one, visit: https://console.firebase.google.com"
Write-Host ""

# Get Firebase config
$databaseUrl = Read-Host "Enter your Firebase Database URL (e.g., https://your-project-default-rtdb.firebaseio.com)"

# Create basic config
$config = @{
    firebase = @{
        serviceAccountPath = "config/service-account.json"
        databaseURL = $databaseUrl
    }
    agent = @{
        heartbeatInterval = 30
        commandTimeout = 300
        logLevel = "INFO"
        maxConcurrentCommands = 5
        commandExpirySeconds = 300
    }
    logging = @{
        maxSizeMB = 10
        backupCount = 5
        retentionDays = 7
    }
    servers = @{}
}

$configPath = "$installPath\config\agent-config.json"
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath

Write-Host ""
Write-Host "Configuration saved!" -ForegroundColor Green

# Service account reminder
Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "         IMPORTANT: Next Steps         " -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Download your Firebase service account key:"
Write-Host "   - Go to Firebase Console -> Project Settings -> Service Accounts"
Write-Host "   - Click 'Generate new private key'"
Write-Host "   - Save the file as: $installPath\config\service-account.json"
Write-Host ""
Write-Host "2. Add your game servers to the config file:"
Write-Host "   - Edit: $configPath"
Write-Host ""
Write-Host "3. Run Phoenix Agent:"
Write-Host "   - Open: $installPath"

# Create start script
$startScript = @"
@echo off
cd /d "$installPath"
if exist PhoenixAgent.exe (
    PhoenixAgent.exe
) else (
    python agent.py
)
pause
"@
$startScript | Set-Content "$installPath\Start-PhoenixAgent.bat"

# Create desktop shortcut
$createShortcut = Read-Host "Create desktop shortcut? (y/n)"
if ($createShortcut -eq 'y') {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut("$desktop\Phoenix Agent.lnk")
    $shortcut.TargetPath = "$installPath\Start-PhoenixAgent.bat"
    $shortcut.WorkingDirectory = $installPath
    $shortcut.Description = "Phoenix Hosting Agent"
    $shortcut.Save()
    Write-Host "Desktop shortcut created!" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "      Installation Complete!           " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Install location: $installPath" -ForegroundColor Cyan
Write-Host ""

# Open install folder
$openFolder = Read-Host "Open install folder? (y/n)"
if ($openFolder -eq 'y') {
    explorer $installPath
}

Write-Host ""
Write-Host "Thank you for using Phoenix Hosting!" -ForegroundColor Cyan
Write-Host ""
pause
