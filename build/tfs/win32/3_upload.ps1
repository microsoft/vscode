Param(
   [string]$storageKey,
   [string]$mooncakeStorageKey,
	 [string]$documentDbKey
)

. .\build\tfs\win32\lib.ps1

$Repo = "$(pwd)"
$Root = "$Repo\.."
$Exe = "$Repo\.build\win32\setup\VSCodeSetup.exe"
$Zip = "$Repo\.build\win32\archive\VSCode-win32.zip"
$Build = "$Root\VSCode-win32"

# get version
$PackageJson = Get-Content -Raw -Path "$Build\resources\app\package.json" | ConvertFrom-Json
$Version = $PackageJson.version
$Quality = "$env:VSCODE_QUALITY"

STEP "Install build dependencies"
pushd "$Repo\build\tfs\common"
exec { & npm i }
popd

$env:AZURE_STORAGE_ACCESS_KEY_2 = $storageKey
$env:MOONCAKE_STORAGE_ACCESS_KEY = $mooncakeStorageKey
$env:AZURE_DOCUMENTDB_MASTERKEY = $documentDbKey

STEP "Publish archive"
exec { & node build/tfs/common/publish.js $Quality win32-archive archive "VSCode-win32-$Version.zip" $Version true $Zip }

STEP "Publish setup package"
exec { & node build/tfs/common/publish.js $Quality win32 setup "VSCodeSetup-$Version.exe" $Version true $Exe }
