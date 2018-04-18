Param(
   [string]$arch,
   [string]$storageKey,
   [string]$mooncakeStorageKey,
	 [string]$documentDbKey
)

. .\build\tfs\win32\node.ps1
. .\build\tfs\win32\lib.ps1

$Repo = "$(pwd)"
$Root = "$Repo\.."
$Exe = "$Repo\.build\win32-$arch\setup\VSCodeSetup.exe"
$Zip = "$Repo\.build\win32-$arch\archive\VSCode-win32-$arch.zip"
$Build = "$Root\VSCode-win32-$arch"

# get version
$PackageJson = Get-Content -Raw -Path "$Build\resources\app\package.json" | ConvertFrom-Json
$Version = $PackageJson.version
$Quality = "$env:VSCODE_QUALITY"
$env:AZURE_STORAGE_ACCESS_KEY_2 = $storageKey
$env:MOONCAKE_STORAGE_ACCESS_KEY = $mooncakeStorageKey
$env:AZURE_DOCUMENTDB_MASTERKEY = $documentDbKey

$assetPlatform = if ($arch -eq "ia32") { "win32" } else { "win32-x64" }

step "Publish archive" {
  exec { & node build/tfs/common/publish.js $Quality "$global:assetPlatform-archive" archive "VSCode-win32-$global:arch-$Version.zip" $Version true $Zip }
}

step "Publish setup package" {
  exec { & node build/tfs/common/publish.js $Quality "$global:assetPlatform" setup "VSCodeSetup-$global:arch-$Version.exe" $Version true $Exe }
}

done