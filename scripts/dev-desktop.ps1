# Start Liora Tauri desktop (requires VS C++ Build Tools)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# Load MSVC env if vswhere exists
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
  $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($vsPath) {
    $vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
    if (Test-Path $vcvars) {
      Write-Host "Loading MSVC env from $vcvars"
      cmd /c "`"$vcvars`" && set" | ForEach-Object {
        if ($_ -match "^(.*?)=(.*)$") {
          [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
      }
    }
  }
}

if (-not (Get-Command link -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: link.exe not found. Install Visual Studio Build Tools with C++ workload."
  Write-Host "winget install Microsoft.VisualStudio.2022.BuildTools --override `"--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`""
  exit 1
}

Write-Host "Starting tauri dev..."
npm run tauri dev
