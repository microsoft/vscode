[CmdletBinding()]
param(
	[string]$Repo = (Get-Location).Path,
	[string]$UserDataDir = $(if ($env:CODE_OSS_DEV_AUTHED_USER_DATA_DIR) { $env:CODE_OSS_DEV_AUTHED_USER_DATA_DIR } else { Join-Path $env:USERPROFILE '.vscode-oss-dev' })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = (Resolve-Path -LiteralPath $Repo).Path
$codeBat = Join-Path $Repo 'scripts\code.bat'
if (-not (Test-Path -LiteralPath $codeBat -PathType Leaf)) {
	throw "Could not find a Code OSS launcher at $codeBat. Pass -Repo <vscode-repo-root>."
}

$sharedDataDir = if ($env:CODE_OSS_DEV_AUTHED_SHARED_DATA_DIR) {
	$env:CODE_OSS_DEV_AUTHED_SHARED_DATA_DIR
} elseif ($env:VSCODE_PORTABLE) {
	Join-Path $env:VSCODE_PORTABLE 'shared-data'
} else {
	$folderName = '.vscode-oss-shared'
	$productJson = Join-Path $Repo 'product.json'
	if (Test-Path -LiteralPath $productJson -PathType Leaf) {
		$product = Get-Content -LiteralPath $productJson -Raw | ConvertFrom-Json
		if ($product.PSObject.Properties['sharedDataFolderName']) {
			$folderName = $product.sharedDataFolderName
		}
	}
	Join-Path $env:USERPROFILE $folderName
}

New-Item -ItemType Directory -Force -Path $UserDataDir, $sharedDataDir | Out-Null
$UserDataDir = (Resolve-Path -LiteralPath $UserDataDir).Path
$sharedDataDir = (Resolve-Path -LiteralPath $sharedDataDir).Path
$logFile = Join-Path $env:TEMP "code-oss-profile-bootstrap-$PID.log"
$command = "set ELECTRON_RUN_AS_NODE=&& call `"$codeBat`" --user-data-dir=`"$UserDataDir`" --shared-data-dir=`"$sharedDataDir`" >> `"$logFile`" 2>&1"
$process = Start-Process -FilePath $env:ComSpec -ArgumentList '/d', '/s', '/c', "`"$command`"" -WorkingDirectory $Repo -PassThru
Start-Sleep -Seconds 2
if ($process.HasExited -and $process.ExitCode -ne 0) {
	$logTail = if (Test-Path -LiteralPath $logFile) { (Get-Content -LiteralPath $logFile -Tail 40) -join "`n" } else { '(no log output)' }
	throw "Code OSS exited before opening the bootstrap window.`n$logTail"
}

[PSCustomObject]@{
	userDataDir = $UserDataDir
	sharedDataDir = $sharedDataDir
	logFile = $logFile
} | ConvertTo-Json -Compress
