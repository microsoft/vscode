Param(
  [string]$arch,
  [string]$mixinPassword,
  [string]$vsoPAT,
	[string]$storageKey,
	[string]$mooncakeStorageKey,
	[string]$documentDbKey
)

. .\build\tfs\win32\node.ps1
. .\scripts\env.ps1
. .\build\tfs\win32\lib.ps1

# Create a _netrc file to download distro dependencies
# In order to get _netrc to work, we need a HOME variable setup
"machine monacotools.visualstudio.com password ${vsoPAT}" | Out-File "$env:HOME\_netrc" -Encoding ASCII

# Set the right architecture
$env:npm_config_arch="$arch"
$env:CHILD_CONCURRENCY="1"

step "Install dependencies" {
  exec { & yarn }
}

step "Hygiene" {
  exec { & npm run gulp -- hygiene }
}

$env:VSCODE_MIXIN_PASSWORD = $mixinPassword
step "Mix in repository from vscode-distro" {
  exec { & npm run gulp -- mixin }
}

step "Get Electron" {
  exec { & npm run gulp -- "electron-$global:arch" }
}

step "Install distro dependencies" {
  exec { & node build\tfs\common\installDistro.js }
}

step "Build minified" {
  exec { & npm run gulp -- "vscode-win32-$global:arch-min" }
}

step "Run unit tests" {
  exec { & .\scripts\test.bat --build --reporter dot }
}

step "Run smoke test" {
	$Artifacts = "$env:AGENT_BUILDDIRECTORY\smoketest-artifacts"
	Remove-Item -Recurse -Force -ErrorAction Ignore $Artifacts

	exec { & npm run smoketest -- --build "$env:AGENT_BUILDDIRECTORY\VSCode-win32-$global:arch" --log "$Artifacts" }
}

step "Create archive and setup package" {
	exec { & npm run gulp -- "vscode-win32-$global:arch-archive" "vscode-win32-$global:arch-setup" }
}

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

step "Publish UNSIGNED archive" {
  exec { & node build/tfs/common/publish.js $Quality "$global:assetPlatform-archive" archive-unsigned "VSCode-win32-$global:arch-$Version-unsigned.zip" $Version false $Zip }
}

step "Publish UNSIGNED setup package" {
  exec { & node build/tfs/common/publish.js $Quality "$global:assetPlatform" setup-unsigned "VSCodeSetup-$global:arch-$Version-unsigned.exe" $Version false $Exe }
}

done
