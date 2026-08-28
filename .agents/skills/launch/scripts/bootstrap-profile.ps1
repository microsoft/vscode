[CmdletBinding()]
param(
	[string]$Repo = (Get-Location).Path,
	[string]$UserDataDir = $(if ($env:CODE_OSS_DEV_AUTHED_USER_DATA_DIR) { $env:CODE_OSS_DEV_AUTHED_USER_DATA_DIR } else { Join-Path $env:USERPROFILE '.vscode-oss-dev' }),
	[switch]$WaitForExit,
	[string]$ExitMarker = '',
	[int]$ReadyTimeoutMs = 90000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($WaitForExit) {
	if ([string]::IsNullOrWhiteSpace($ExitMarker)) {
		throw '-ExitMarker is required with -WaitForExit.'
	}
	$ExitMarker = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExitMarker)
	$stopwatch = [Diagnostics.Stopwatch]::StartNew()
	do {
		if (Test-Path -LiteralPath $ExitMarker -PathType Leaf) {
			[PSCustomObject]@{
				exitMarker = $ExitMarker
				stopped = $true
			} | ConvertTo-Json -Compress
			exit 0
		}
		Start-Sleep -Milliseconds 250
	} while ($stopwatch.ElapsedMilliseconds -lt 30000)

	throw "Code OSS processes still use the bootstrap profile after 30 seconds."
}

$Repo = (Resolve-Path -LiteralPath $Repo).Path
$codeBat = Join-Path $Repo 'scripts\code.bat'
if (-not (Test-Path -LiteralPath $codeBat -PathType Leaf)) {
	throw "Could not find a Code OSS launcher at $codeBat. Pass -Repo <vscode-repo-root>."
}

$UserDataDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($UserDataDir)
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
$runId = [guid]::NewGuid().ToString('N')
$logFile = Join-Path $env:TEMP "code-oss-profile-bootstrap-$runId.log"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
try {
	$listener.Start()
	$cdpPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
} finally {
	$listener.Stop()
}
$command = "set ELECTRON_RUN_AS_NODE=&& call `"$codeBat`" --user-data-dir=`"$UserDataDir`" --shared-data-dir=`"$sharedDataDir`" --remote-debugging-port=$cdpPort >> `"$logFile`" 2>&1"
$process = Start-Process -FilePath $env:ComSpec -ArgumentList '/d', '/s', '/c', "`"$command`"" -WorkingDirectory $Repo -PassThru
$exitMarker = "$logFile.exited"
$stopMarker = "$logFile.stop"
$monitorScript = Join-Path $PSScriptRoot 'windows-process-tree-monitor.ps1'
$monitorArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$monitorScript`" -RootProcessId $($process.Id) -ExitMarker `"$exitMarker`" -StopMarker `"$stopMarker`""
Start-Process -FilePath 'powershell.exe' -ArgumentList $monitorArguments -WindowStyle Hidden | Out-Null
$node = (Get-Command node -CommandType Application -ErrorAction Stop).Source
$waitForCdp = Join-Path $PSScriptRoot 'waitForCdp.ts'
$readyMs = & $node $waitForCdp $process.Id $cdpPort $ReadyTimeoutMs
$readyStatus = $LASTEXITCODE
if ($readyStatus -ne 0) {
	$logTail = if (Test-Path -LiteralPath $logFile) { (Get-Content -LiteralPath $logFile -Tail 40) -join "`n" } else { '(no log output)' }
	New-Item -ItemType File -Force -Path $stopMarker | Out-Null
	$stopwatch = [Diagnostics.Stopwatch]::StartNew()
	do {
		if (Test-Path -LiteralPath $exitMarker -PathType Leaf) {
			break
		}
		Start-Sleep -Milliseconds 250
	} while ($stopwatch.ElapsedMilliseconds -lt 30000)
	if (-not (Test-Path -LiteralPath $exitMarker -PathType Leaf)) {
		throw "Code OSS bootstrap window did not become ready (status $readyStatus), and its process tree could not be stopped.`n$logTail"
	}
	throw "Code OSS bootstrap window did not become ready (status $readyStatus).`n$logTail"
}

[PSCustomObject]@{
	processId = $process.Id
	cdpPort = $cdpPort
	readyMs = [int]$readyMs
	userDataDir = $UserDataDir
	sharedDataDir = $sharedDataDir
	logFile = $logFile
	exitMarker = $exitMarker
} | ConvertTo-Json -Compress
