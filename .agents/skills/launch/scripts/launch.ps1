# Launch Code OSS (VS Code from sources) with an isolated, slimmed copy of a
# user-data-dir and unique debugger ports. Prints exactly one JSON line to
# stdout after the renderer CDP endpoint is ready; all diagnostics use stderr.

[CmdletBinding()]
param(
	[Parameter(ValueFromRemainingArguments = $true)]
	[string[]]$cliArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$agents = $false
$sourceUserDataDir = ''
$repo = ''
$cloneExtensions = $false
$full = $false
$skipPreLaunch = $false
$disableWorkspaceTrust = $false
if ($null -eq $cliArgs) {
	$cliArgs = @()
}

function Write-LaunchError([string]$message) {
	[Console]::Error.WriteLine($message)
}

function Exit-Usage([string]$message) {
	Write-LaunchError $message
	exit 2
}

function Get-UsableNode([string]$repoPath) {
	$command = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
	$nvmrcPath = Join-Path $repoPath '.nvmrc'
	$requiredVersion = if (Test-Path -LiteralPath $nvmrcPath -PathType Leaf) {
		(Get-Content -LiteralPath $nvmrcPath -Raw).Trim().TrimStart('v')
	} else {
		'20.0.0'
	}

	$setupMessage = "Run in PowerShell from $repoPath`: fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression; fnm use"
	if ($null -ne $command) {
		try {
			$version = & $command.Source --version 2>$null
			if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(?<version>\d+\.\d+\.\d+)') {
				throw 'could not determine its version'
			}
			if ([version]$Matches.version -lt [version]$requiredVersion) {
				throw "found $version"
			}
			return $command.Source
		} catch {
			# Fall through to fnm fallback
		}
	}

	# Fallback: Check fnm directories (most recent first)
	$fnmBase = Join-Path $env:USERPROFILE 'AppData\Local\fnm_multishells'
	if (Test-Path $fnmBase) {
		$fnmDirs = Get-ChildItem $fnmBase -Directory -ErrorAction SilentlyContinue | Sort-Object -Property CreationTime -Descending
		foreach ($dir in $fnmDirs) {
			$nodePath = Join-Path $dir.FullName 'node.exe'
			if (Test-Path $nodePath) {
				try {
					$version = & $nodePath --version 2>$null
					if ($LASTEXITCODE -eq 0 -and $version -match '^v(?<version>\d+\.\d+\.\d+)') {
						if ([version]$Matches.version -ge [version]$requiredVersion) {
							return $nodePath
						}
					}
				} catch { }
			}
		}
	}

	throw "Node.js $requiredVersion or newer is required on PATH. $setupMessage"
}

function Get-SourceSharedDataDir([string]$repoPath) {
	if ($env:CODE_OSS_DEV_AUTHED_SHARED_DATA_DIR) {
		return $env:CODE_OSS_DEV_AUTHED_SHARED_DATA_DIR
	}

	# Mirrors IEnvironmentService.appSharedDataHome, minus the --shared-data-dir
	# branch (that one names the *destination*, not the source we copy from):
	# VSCODE_PORTABLE\shared-data, else ~/<product.sharedDataFolderName>.
	if ($env:VSCODE_PORTABLE) {
		return Join-Path $env:VSCODE_PORTABLE 'shared-data'
	}

	$folderName = '.vscode-oss-shared'
	$productJson = Join-Path $repoPath 'product.json'
	if (Test-Path -LiteralPath $productJson -PathType Leaf) {
		$product = Get-Content -LiteralPath $productJson -Raw | ConvertFrom-Json
		if ($product.PSObject.Properties['sharedDataFolderName']) {
			$folderName = $product.sharedDataFolderName
		}
	}

	return Join-Path $env:USERPROFILE $folderName
}

function Get-FreePort {
	$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
	try {
		$listener.Start()
		return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
	} finally {
		$listener.Stop()
	}
}

function Get-FreePorts {
	$ports = [System.Collections.Generic.List[int]]::new()
	while ($ports.Count -lt 4) {
		$port = Get-FreePort
		if (-not $ports.Contains($port)) {
			$ports.Add($port)
		}
	}
	return $ports
}

function Test-Glob([string]$value, [string]$pattern) {
	return $value -like $pattern
}

function Test-ExcludedPath([string]$relativePath) {
	$relativePath = $relativePath.Replace('\', '/')
	$patterns = @(
		'/extensions',
		'/workspaceStorage', 'User/workspaceStorage',
		'User/History',
		'/CachedExtensionVSIXs',
		'/logs',
		'/Cache', '/Code Cache', '/CachedData', '/component_crx_cache',
		'/GPUCache', '/ShaderCache', '/Dawn*Cache',
		'Partitions/vscode-browser/Cache', 'Partitions/vscode-browser/Code Cache',
		'Partitions/vscode-browser/GPUCache', 'Partitions/vscode-browser/Dawn*Cache',
		'/Backups', '/blob_storage', '/BrowserMetrics', '/Crashpad',
		'/Session Storage',
		'/Singleton*',
		'*.lock', '*.sock'
	)

	foreach ($pattern in $patterns) {
		if ($pattern.StartsWith('/')) {
			if (-not $relativePath.Contains('/') -and (Test-Glob $relativePath $pattern.Substring(1))) {
				return $true
			}
			continue
		}

		if ($pattern.Contains('/')) {
			$segments = $relativePath.Split('/')
			$patternSegments = $pattern.Split('/')
			for ($start = 0; $start -le $segments.Length - $patternSegments.Length; $start++) {
				$matches = $true
				for ($index = 0; $index -lt $patternSegments.Length; $index++) {
					if (-not (Test-Glob $segments[$start + $index] $patternSegments[$index])) {
						$matches = $false
						break
					}
				}
				if ($matches) {
					return $true
				}
			}
		} elseif (Test-Glob ([IO.Path]::GetFileName($relativePath)) $pattern) {
			return $true
		}
	}

	return $false
}

function Copy-ProfileDirectory([string]$source, [string]$destination, [bool]$useExcludes) {
	New-Item -ItemType Directory -Force -Path $destination | Out-Null

	function Copy-ProfileEntry([System.IO.FileSystemInfo]$entry, [string]$relativePath) {
		if ($useExcludes -and (Test-ExcludedPath $relativePath)) {
			return
		}

		$target = Join-Path $destination $relativePath
		if ($entry.PSIsContainer) {
			New-Item -ItemType Directory -Force -Path $target | Out-Null
			foreach ($child in Get-ChildItem -LiteralPath $entry.FullName -Force) {
				Copy-ProfileEntry $child (Join-Path $relativePath $child.Name)
			}
		} else {
			$targetParent = Split-Path -Parent $target
			New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
			[IO.File]::Copy($entry.FullName, $target, $true)
			[IO.File]::SetLastWriteTimeUtc($target, $entry.LastWriteTimeUtc)
		}
	}

	foreach ($entry in Get-ChildItem -LiteralPath $source -Force) {
		Copy-ProfileEntry $entry $entry.Name
	}
}

function Assert-AuthCriticalProfileFiles([string]$destination) {
	$requiredPaths = @(
		'Local State',
		'machineid',
		'User\globalStorage\state.vscdb',
		'Network'
	)
	$missingPaths = @($requiredPaths | Where-Object {
		-not (Test-Path -LiteralPath (Join-Path $destination $_))
	})
	if ($missingPaths.Count -gt 0) {
		throw "Profile copy is missing auth-critical path(s): $($missingPaths -join ', '). Refusing to launch a profile that cannot preserve Windows authentication."
	}
}

function Test-DbHasGitHubAuthenticationSecret([string]$node, [string]$db, [string]$temporaryDb) {
	if (-not (Test-Path -LiteralPath $db -PathType Leaf)) {
		return $false
	}

	try {
		[IO.File]::Copy($db, $temporaryDb, $true)
		$script = @'
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[1], { readOnly: true });
try {
	const row = db.prepare('SELECT 1 FROM ItemTable WHERE key LIKE ? LIMIT 1').get('secret://%github-authentication%');
	process.stdout.write(row ? 'present' : 'absent');
} finally {
	db.close();
}
'@
		$result = @(& $node '--input-type=module' '-e' $script $temporaryDb 2>$null)
		if ($LASTEXITCODE -ne 0) {
			return $null
		}
		switch ($result -join '') {
			'present' { return $true }
			'absent' { return $false }
			default { return $null }
		}
	} catch {
		return $null
	} finally {
		Remove-Item -LiteralPath $temporaryDb -Force -ErrorAction SilentlyContinue
	}
}

function Test-SourceHasGitHubAuthenticationSecret([string]$node, [string]$source, [string]$sharedSource, [string]$temporaryDb) {
	# On Windows the GitHub session is APPLICATION_SHARED scoped, so it lives in
	# the shared-data-dir rather than the profile - see useSharedStorage in
	# src/vs/platform/secrets/common/secrets.ts. Older profiles may still hold it
	# in globalStorage, and both directories get copied, so either one counts.
	$databases = @(
		(Join-Path $sharedSource 'sharedStorage\state.vscdb'),
		(Join-Path $source 'User\globalStorage\state.vscdb')
	)

	$undetermined = $false
	foreach ($db in $databases) {
		$result = Test-DbHasGitHubAuthenticationSecret $node $db $temporaryDb
		if ($result -eq $true) {
			return $true
		}
		if ($null -eq $result) {
			$undetermined = $true
		}
	}

	if ($undetermined) {
		return $null
	}
	return $false
}

function Get-JsoncCodeMask([string]$text) {
	# Returns a same-length copy of $text with every comment span blanked out.
	# Offsets are preserved so a match found in the mask can be applied to the
	# original. String contents are respected, so a `//` inside a value (a URL,
	# say) is not mistaken for a comment.
	$chars = $text.ToCharArray()
	$masked = [char[]]::new($chars.Length)
	[Array]::Copy($chars, $masked, $chars.Length)

	$inString = $false
	$inLineComment = $false
	$inBlockComment = $false
	$escaped = $false

	for ($i = 0; $i -lt $chars.Length; $i++) {
		$current = $chars[$i]
		$next = if ($i + 1 -lt $chars.Length) { $chars[$i + 1] } else { [char]0 }

		if ($inLineComment) {
			if ($current -eq "`n") { $inLineComment = $false } else { $masked[$i] = ' ' }
			continue
		}
		if ($inBlockComment) {
			if ($current -eq '*' -and $next -eq '/') {
				$masked[$i] = ' '
				$masked[$i + 1] = ' '
				$i++
				$inBlockComment = $false
			} elseif ($current -ne "`n") {
				$masked[$i] = ' '
			}
			continue
		}
		if ($inString) {
			if ($escaped) { $escaped = $false }
			elseif ($current -eq '\') { $escaped = $true }
			elseif ($current -eq '"') { $inString = $false }
			continue
		}

		if ($current -eq '"') { $inString = $true }
		elseif ($current -eq '/' -and $next -eq '/') { $masked[$i] = ' '; $inLineComment = $true }
		elseif ($current -eq '/' -and $next -eq '*') { $masked[$i] = ' '; $masked[$i + 1] = ' '; $i++; $inBlockComment = $true }
	}

	return (-join $masked)
}

function Ensure-SimpleDialogSetting([string]$settingsFile) {
	$key = 'files.simpleDialog.enable'
	$settingsDirectory = Split-Path -Parent $settingsFile
	New-Item -ItemType Directory -Force -Path $settingsDirectory | Out-Null

	if (Test-Path -LiteralPath $settingsFile -PathType Leaf) {
		$text = [IO.File]::ReadAllText($settingsFile)
	} else {
		$text = ''
	}

	if ([string]::IsNullOrWhiteSpace($text)) {
		[IO.File]::WriteAllText($settingsFile, "{`n  `"$key`": true`n}`n", [Text.UTF8Encoding]::new($false))
		return
	}

	# Match against a comment-masked copy so a commented-out occurrence such as
	# `// "files.simpleDialog.enable": false` is not mistaken for the real
	# setting. Offsets line up with the original, so the value is rewritten in
	# place without disturbing comments.
	$maskedText = Get-JsoncCodeMask $text
	$keyPattern = [regex]::Escape($key)
	$keyValueRegex = [regex]::new("(`"$keyPattern`"\s*:\s*)(true|false|null|`"[^`"`r`n]*`"|-?\d+(?:\.\d+)?)")
	$keyMatch = $keyValueRegex.Match($maskedText)
	if ($keyMatch.Success) {
		$valueGroup = $keyMatch.Groups[2]
		$updated = $text.Substring(0, $valueGroup.Index) + 'true' + $text.Substring($valueGroup.Index + $valueGroup.Length)
		[IO.File]::WriteAllText($settingsFile, $updated, [Text.UTF8Encoding]::new($false))
		return
	}

	$lastBrace = $maskedText.LastIndexOf('}')
	if ($lastBrace -eq -1) {
		throw "settings.json has no closing brace - refusing to clobber it: $settingsFile"
	}
	$firstBrace = $maskedText.IndexOf('{')
	if ($firstBrace -eq -1 -or $firstBrace -ge $lastBrace) {
		throw "settings.json has no opening brace - refusing to clobber it: $settingsFile"
	}

	# Whether a leading comma is needed depends only on real content, so decide
	# it from the masked copy too.
	$between = $maskedText.Substring($firstBrace + 1, $lastBrace - $firstBrace - 1).Trim()
	$separator = if ($between.Length -eq 0 -or $between.EndsWith(',')) { '' } else { ',' }
	$insertion = "$separator`n  `"$key`": true`n"
	$updated = $text.Substring(0, $lastBrace) + $insertion + $text.Substring($lastBrace)
	[IO.File]::WriteAllText($settingsFile, $updated, [Text.UTF8Encoding]::new($false))
}

function Write-LogTail([string]$logFile) {
	if (Test-Path -LiteralPath $logFile) {
		Get-Content -LiteralPath $logFile -Tail 80 | ForEach-Object { [Console]::Error.WriteLine($_) }
	}
}

function Quote-CmdArgument([string]$argument) {
	if ($argument.Length -gt 0 -and $argument -notmatch '[\s"]') {
		return $argument
	}

	$quoted = [Text.StringBuilder]::new('"')
	$backslashCount = 0
	foreach ($character in $argument.ToCharArray()) {
		if ($character -eq '\') {
			$backslashCount++
		} elseif ($character -eq '"') {
			[void]$quoted.Append(('\' * ($backslashCount * 2 + 1)))
			[void]$quoted.Append('"')
			$backslashCount = 0
		} else {
			[void]$quoted.Append(('\' * $backslashCount))
			[void]$quoted.Append($character)
			$backslashCount = 0
		}
	}
	[void]$quoted.Append(('\' * ($backslashCount * 2)))
	[void]$quoted.Append('"')
	return $quoted.ToString()
}

function Start-Code([string]$codeBat, [string[]]$arguments, [string]$logFile) {
	$quotedCodeBat = Quote-CmdArgument $codeBat
	if (-not $quotedCodeBat.StartsWith('"')) {
		$quotedCodeBat = "`"$quotedCodeBat`""
	}
	$commandLine = ((@($quotedCodeBat) + @($arguments | ForEach-Object { Quote-CmdArgument $_ })) -join ' ') + " >> $(Quote-CmdArgument $logFile) 2>&1"
	$processInfo = [Diagnostics.ProcessStartInfo]::new()
	$processInfo.FileName = $env:ComSpec
	$processInfo.UseShellExecute = $false
	$processInfo.CreateNoWindow = $true
	$processInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
	$processInfo.Arguments = '/d /s /c "' + $commandLine + '"'
	# `EnvironmentVariables` (not `Environment`) so this works on Windows
	# PowerShell 5.1 as well as PowerShell 7+ — the latter property is .NET
	# Core only, and `powershell.exe` is still the built-in Windows shell.
	[void]($processInfo.EnvironmentVariables['VSCODE_SKIP_PRELAUNCH'] = '1')
	[void]$processInfo.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')

	$process = [Diagnostics.Process]::new()
	$process.StartInfo = $processInfo
	if (-not $process.Start()) {
		throw "Failed to start $codeBat."
	}

	return $process
}

$extraArgs = [System.Collections.Generic.List[string]]::new()
for ($index = 0; $index -lt $cliArgs.Count; $index++) {
	$argument = $cliArgs[$index]
	switch ($argument) {
		'--agents' {
			$agents = $true
			continue
		}
		'--source-user-data-dir' {
			if ($index + 1 -ge $cliArgs.Count) {
				Exit-Usage 'Missing value for --source-user-data-dir.'
			}
			$sourceUserDataDir = $cliArgs[++$index]
			continue
		}
		'--repo' {
			if ($index + 1 -ge $cliArgs.Count) {
				Exit-Usage 'Missing value for --repo.'
			}
			$repo = $cliArgs[++$index]
			continue
		}
		'--clone-extensions' {
			$cloneExtensions = $true
			continue
		}
		'--copy-extensions' {
			$cloneExtensions = $true
			continue
		}
		'--full' {
			$full = $true
			continue
		}
		'--skip-prelaunch' {
			$skipPreLaunch = $true
			continue
		}
		'--disable-workspace-trust' {
			$disableWorkspaceTrust = $true
			continue
		}
		'--' {
			for ($forwardIndex = $index + 1; $forwardIndex -lt $cliArgs.Count; $forwardIndex++) {
				$extraArgs.Add($cliArgs[$forwardIndex])
			}
			$index = $cliArgs.Count
			continue
		}
		default {
			Exit-Usage "Unknown arg: $argument"
		}
	}
}

try {
	$launchStopwatch = [Diagnostics.Stopwatch]::StartNew()
	if ([string]::IsNullOrWhiteSpace($repo)) {
		$candidateRepo = (Get-Location).Path
		if (Test-Path -LiteralPath (Join-Path $candidateRepo 'scripts\code.bat') -PathType Leaf) {
			$repo = $candidateRepo
		} else {
			Exit-Usage "Could not find a vscode checkout in $candidateRepo. Pass --repo <vscode-repo-root>."
		}
	}
	$repo = [IO.Path]::GetFullPath($repo)

	$codeBat = Join-Path $repo 'scripts\code.bat'
	if (-not (Test-Path -LiteralPath $codeBat -PathType Leaf)) {
		Exit-Usage "Could not find a Code OSS launcher at $codeBat. Pass --repo <vscode-repo-root>."
	}

	if ([string]::IsNullOrWhiteSpace($sourceUserDataDir)) {
		$sourceUserDataDir = if ($env:CODE_OSS_DEV_AUTHED_USER_DATA_DIR) {
			$env:CODE_OSS_DEV_AUTHED_USER_DATA_DIR
		} else {
			Join-Path $env:USERPROFILE '.vscode-oss-dev'
		}
	}
	if (-not (Test-Path -LiteralPath $sourceUserDataDir -PathType Container)) {
		Exit-Usage "Source user-data-dir does not exist: $sourceUserDataDir`nPass --source-user-data-dir <path> or set CODE_OSS_DEV_AUTHED_USER_DATA_DIR."
	}
	$sourceUserDataDir = [IO.Path]::GetFullPath($sourceUserDataDir)

	$node = Get-UsableNode $repo
	Write-LaunchError "[launch.ps1] using Node: $node"
	$ports = Get-FreePorts
	$cdpPort = $ports[0]
	$extHostPort = $ports[1]
	$mainPort = $ports[2]
	$agentHostPort = $ports[3]

	$stamp = '{0:yyyyMMdd-HHmmss}-{1}' -f (Get-Date), $PID
	$runDir = Join-Path (Join-Path $env:TEMP 'code-oss-dev') $stamp
	$destinationUdd = Join-Path $runDir 'user-data'
	$extensionsDir = Join-Path $destinationUdd 'extensions'
	$sharedDataDir = Join-Path $runDir 'shared-data'
	$logFile = Join-Path $runDir 'code.log'
	New-Item -ItemType Directory -Force -Path $runDir, $sharedDataDir | Out-Null
	[IO.File]::WriteAllText($logFile, '', [Text.UTF8Encoding]::new($false))
	$sourceSharedDataDir = Get-SourceSharedDataDir $repo
	if (Test-Path -LiteralPath $sourceSharedDataDir -PathType Container) {
		# On Windows the GitHub session is APPLICATION_SHARED scoped, so it lives here
		# and not in the profile - see useSharedStorage in
		# src/vs/platform/secrets/common/secrets.ts. Without this copy the launched
		# instance always prompts for sign-in.
		Write-LaunchError "[launch.ps1] copying shared data: $sourceSharedDataDir -> $sharedDataDir"
		Copy-ProfileDirectory $sourceSharedDataDir $sharedDataDir $false
	} else {
		# Not necessarily fatal: profiles predating the APPLICATION_SHARED migration
		# still hold the secret in globalStorage, and ApplicationSharedStorageMain
		# falls back to application storage. State the fact and let the preflight
		# below decide whether a sign-in is actually coming.
		Write-LaunchError "[launch.ps1] no shared-data-dir at $sourceSharedDataDir; nothing to seed"
	}
	$hasGitHubAuthenticationSecret = Test-SourceHasGitHubAuthenticationSecret $node $sourceUserDataDir $sourceSharedDataDir (Join-Path $runDir 'auth-preflight.vscdb')
	if ($hasGitHubAuthenticationSecret -eq $false) {
		Write-LaunchError "[launch.ps1] WARNING: source profile $sourceUserDataDir has no stored GitHub session; the launched instance will prompt you to sign in."
		Write-LaunchError 'To fix once and for all, launch Code OSS directly against the source profile (no copy), sign in, then close it:'
		Write-LaunchError "  .\scripts\code.bat --user-data-dir=$sourceUserDataDir"
		Write-LaunchError 'Every future launch copies that profile and inherits the session.'
	}

	if ($full) {
		Write-LaunchError "[launch.ps1] full copy: $sourceUserDataDir -> $destinationUdd"
		Copy-ProfileDirectory $sourceUserDataDir $destinationUdd $false
	} else {
		Write-LaunchError "[launch.ps1] slim copy: $sourceUserDataDir -> $destinationUdd"
		Copy-ProfileDirectory $sourceUserDataDir $destinationUdd $true
	}
	Assert-AuthCriticalProfileFiles $destinationUdd

	New-Item -ItemType Directory -Force -Path $extensionsDir | Out-Null
	if (-not $full -and $cloneExtensions) {
		$sourceExtensions = Join-Path $sourceUserDataDir 'extensions'
		Write-LaunchError "[launch.ps1] copying extensions: $sourceExtensions -> $extensionsDir"
		Copy-ProfileDirectory $sourceExtensions $extensionsDir $false
	}

	$settingsFile = Join-Path $destinationUdd 'User\settings.json'
	Ensure-SimpleDialogSetting $settingsFile
	Write-LaunchError "[launch.ps1] ensured files.simpleDialog.enable=true in $settingsFile"
	$profileReadyMs = $launchStopwatch.ElapsedMilliseconds

	$launchArgs = [System.Collections.Generic.List[string]]::new()
	if ($agents) {
		$launchArgs.Add('--agents')
	}
	$launchArgs.Add("--user-data-dir=$destinationUdd")
	$launchArgs.Add("--extensions-dir=$extensionsDir")
	$launchArgs.Add("--shared-data-dir=$sharedDataDir")
	$launchArgs.Add("--remote-debugging-port=$cdpPort")
	$launchArgs.Add("--inspect-extensions=$extHostPort")
	$launchArgs.Add("--inspect=$mainPort")
	$launchArgs.Add("--inspect-agenthost=$agentHostPort")
	if ($disableWorkspaceTrust) {
		$launchArgs.Add('--disable-workspace-trust')
	}
	foreach ($argument in $extraArgs) {
		$launchArgs.Add($argument)
	}

	Write-LaunchError "[launch.ps1] launching: $codeBat $($launchArgs -join ' ')"
	Write-LaunchError "[launch.ps1] logs: $logFile"
	if ($skipPreLaunch) {
		Write-LaunchError '[launch.ps1] skipping pre-launch by request'
	} else {
		Write-LaunchError '[launch.ps1] running pre-launch (ensures electron + compiled output + built-ins)...'
		Push-Location -LiteralPath $repo
		try {
			& $node 'build/lib/preLaunch.ts' *>> $logFile
			$preLaunchExitCode = $LASTEXITCODE
		} finally {
			Pop-Location
		}
		if ($preLaunchExitCode -ne 0) {
			Write-LaunchError '[launch.ps1] pre-launch FAILED. Log tail:'
			Write-LogTail $logFile
			exit 1
		}
	}
	$preLaunchReadyMs = $launchStopwatch.ElapsedMilliseconds

	$process = Start-Code $codeBat $launchArgs.ToArray() $logFile
	Write-LaunchError "[launch.ps1] waiting for CDP on port $cdpPort (timeout 90s)..."
	$waitForCdp = Join-Path $PSScriptRoot 'waitForCdp.ts'
	$readyMs = & $node $waitForCdp $process.Id $cdpPort
	$readyStatus = $LASTEXITCODE
	if ($readyStatus -eq 0) {
		Write-LaunchError "[launch.ps1] CDP ready after ${readyMs}ms"
	} else {
		switch ($readyStatus) {
			1 { Write-LaunchError "[launch.ps1] timed out waiting for CDP on port $cdpPort. Log tail:" }
			2 { Write-LaunchError "[launch.ps1] code.bat (PID $($process.Id)) exited before CDP came up. Log tail:" }
			default { Write-LaunchError "[launch.ps1] failed while waiting for CDP on port $cdpPort. Log tail:" }
		}
		Write-LogTail $logFile
		exit 1
	}
	$launchReadyMs = $launchStopwatch.ElapsedMilliseconds

	[PSCustomObject]@{
		pid = $process.Id
		cdpPort = $cdpPort
		extHostPort = $extHostPort
		mainPort = $mainPort
		agentHostPort = $agentHostPort
		userDataDir = $destinationUdd
		extensionsDir = $extensionsDir
		sharedDataDir = $sharedDataDir
		runDir = $runDir
		logFile = $logFile
		repo = $repo
		agents = [bool]$agents
		timings = [PSCustomObject]@{
			profileMs = $profileReadyMs
			preLaunchMs = $preLaunchReadyMs - $profileReadyMs
			cdpReadyMs = $launchReadyMs - $preLaunchReadyMs
			totalMs = $launchReadyMs
		}
	} | ConvertTo-Json -Compress
} catch {
	Write-LaunchError "[launch.ps1] $($_.Exception.Message)"
	exit 1
}
