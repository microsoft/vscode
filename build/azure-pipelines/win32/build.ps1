. build/azure-pipelines/win32/exec.ps1
$ErrorActionPreference = "Stop"
exec { yarn gulp "vscode-win32-$env:VSCODE_ARCH-min" }
exec { yarn gulp "vscode-reh-win32-$env:VSCODE_ARCH-min" }
exec { yarn gulp "vscode-win32-$env:VSCODE_ARCH-inno-updater" }