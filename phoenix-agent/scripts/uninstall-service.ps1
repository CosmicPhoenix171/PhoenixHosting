# Phoenix Agent - Uninstall Service Script
# Run as Administrator

<#
.SYNOPSIS
    Uninstalls Phoenix Agent Windows Service.

.DESCRIPTION
    Stops and removes the Phoenix Agent service.

.NOTES
    Must be run as Administrator
#>

param(
    [string]$ServiceName = "PhoenixAgent"
)

# Just call the install script with -Uninstall flag
$installScript = Join-Path $PSScriptRoot "install-service.ps1"
& $installScript -Uninstall -ServiceName $ServiceName
