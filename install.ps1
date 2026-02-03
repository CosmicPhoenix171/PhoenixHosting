# Phoenix Agent Quick Installer
# Run with: irm https://cosmicphoenix171.github.io/PhoenixHosting/install.ps1 | iex

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Phoenix Hosting - Quick Installer   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$installPath = "$env:LOCALAPPDATA\PhoenixAgent"
$tempPath = "$env:TEMP\PhoenixInstaller"

# Cleanup
if (Test-Path $tempPath) { Remove-Item $tempPath -Recurse -Force }
New-Item -ItemType Directory -Path $tempPath -Force | Out-Null

# Download installer
Write-Host "Downloading installer..." -ForegroundColor Cyan
$installerUrl = "https://raw.githubusercontent.com/CosmicPhoenix171/PhoenixHosting/main/install/Install-PhoenixAgent.ps1"
$installerPath = "$tempPath\Install-PhoenixAgent.ps1"

try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "Running installer..." -ForegroundColor Green
    Write-Host ""
    & $installerPath
} catch {
    Write-Host "Failed to download installer: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please download manually from:" -ForegroundColor Yellow
    Write-Host "https://github.com/CosmicPhoenix171/PhoenixHosting/releases" -ForegroundColor Cyan
}
