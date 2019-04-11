. build/azure-pipelines/win32/exec.ps1
$ErrorActionPreference = "Stop"
exec { yarn gulp "vscode-win32-$(VSCODE_ARCH)-min" }
exec { yarn gulp "vscode-win32-$(VSCODE_ARCH)-inno-updater" }