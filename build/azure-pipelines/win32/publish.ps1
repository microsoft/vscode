. build/azure-pipelines/win32/exec.ps1
$ErrorActionPreference = "Stop"

$Arch = "$env:VSCODE_ARCH"

exec { yarn gulp "vscode-win32-$Arch-archive" "vscode-win32-$Arch-system-setup" "vscode-win32-$Arch-user-setup" --sign }

$Repo = "$(pwd)"
$Root = "$Repo\.."
$SystemExe = "$Repo\.build\win32-$Arch\system-setup\VSCodeSetup.exe"
$UserExe = "$Repo\.build\win32-$Arch\user-setup\VSCodeSetup.exe"
$Zip = "$Repo\.build\win32-$Arch\archive\VSCode-win32-$Arch.zip"
$Build = "$Root\VSCode-win32-$Arch"

# get version
$PackageJson = Get-Content -Raw -Path "$Build\resources\app\package.json" | ConvertFrom-Json
$Version = $PackageJson.version
$Quality = "$env:VSCODE_QUALITY"

$AssetPlatform = if ("$Arch" -eq "ia32") { "win32" } else { "win32-x64" }

exec { node build/azure-pipelines/common/publish.js $Quality "$AssetPlatform-archive" archive "VSCode-win32-$Arch-$Version.zip" $Version true $Zip }
exec { node build/azure-pipelines/common/publish.js $Quality "$AssetPlatform" setup "VSCodeSetup-$Arch-$Version.exe" $Version true $SystemExe }
exec { node build/azure-pipelines/common/publish.js $Quality "$AssetPlatform-user" setup "VSCodeUserSetup-$Arch-$Version.exe" $Version true $UserExe }

# publish hockeyapp symbols
$hockeyAppId = if ("$Arch" -eq "ia32") { "$env:VSCODE_HOCKEYAPP_ID_WIN32" } else { "$env:VSCODE_HOCKEYAPP_ID_WIN64" }
exec { node build/azure-pipelines/common/symbols.js "$env:VSCODE_MIXIN_PASSWORD" "$env:VSCODE_HOCKEYAPP_TOKEN" "$Arch" $hockeyAppId }
