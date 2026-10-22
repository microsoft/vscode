# Runs the launch skill's TypeScript scripts for the PowerShell wrappers.

function Get-UsableNode([string]$repoPath) {
	$nvmrcPath = Join-Path $repoPath '.nvmrc'
	$requiredVersion = if (Test-Path -LiteralPath $nvmrcPath -PathType Leaf) {
		(Get-Content -LiteralPath $nvmrcPath -Raw).Trim().TrimStart('v')
	} else {
		'22.18.0'
	}

	$isUsable = {
		param([string]$candidate)
		try {
			$version = & $candidate --version 2>$null
			return $LASTEXITCODE -eq 0 -and $version -match '^v(?<version>\d+\.\d+\.\d+)' -and [version]$Matches.version -ge [version]$requiredVersion
		} catch {
			return $false
		}
	}

	$command = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
	if ($null -ne $command -and (& $isUsable $command.Source)) {
		return $command.Source
	}

	# Shells set up by fnm, most recent first. There is one folder per shell, often thousands, so
	# this only runs when Node on PATH does not qualify.
	$fnmBase = Join-Path $env:USERPROFILE 'AppData\Local\fnm_multishells'
	if (Test-Path -LiteralPath $fnmBase) {
		foreach ($directory in Get-ChildItem -LiteralPath $fnmBase -Directory -ErrorAction SilentlyContinue | Sort-Object -Property CreationTime -Descending) {
			$candidate = Join-Path $directory.FullName 'node.exe'
			if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and (& $isUsable $candidate)) {
				return $candidate
			}
		}
	}

	throw "Node.js $requiredVersion or newer is required on PATH. Run in PowerShell from $repoPath`: fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression; fnm use"
}

# Runs a script and returns its exit code and stdout lines, streaming its stderr live.
#
# The script is started through ShellExecute, which passes it no handles. Otherwise processes it
# starts, Code in particular, would inherit the handles of this PowerShell process, including a
# pipe of a caller reading its output to the end, and keep that caller waiting until Code exits.
# Arguments go through JSON, which also survives Windows PowerShell's native argument quoting.
function Invoke-NodeScript([string]$node, [string]$script, [string[]]$arguments, [hashtable]$environment = @{}) {
	$stdoutFile = [IO.Path]::GetTempFileName()
	$stderrFile = [IO.Path]::GetTempFileName()
	$variables = @{
		CODE_OSS_DEV_SCRIPT_ARGS = ConvertTo-Json -InputObject @($arguments) -Compress
		CODE_OSS_DEV_STDOUT_FILE = $stdoutFile
		CODE_OSS_DEV_STDERR_FILE = $stderrFile
	} + $environment
	foreach ($name in $variables.Keys) {
		Set-Item -LiteralPath "Env:$name" -Value $variables[$name]
	}
	try {
		$process = Start-Process -FilePath $node -ArgumentList "--disable-warning=ExperimentalWarning `"$script`"" -WindowStyle Hidden -PassThru
		# Windows PowerShell only reports the exit code if the handle was opened while the process ran
		$null = $process.Handle
		$stderr = [IO.StreamReader]::new([IO.FileStream]::new($stderrFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
		try {
			do {
				$exited = $process.WaitForExit(50)
				$text = $stderr.ReadToEnd()
				if ($text) {
					[Console]::Error.Write($text)
				}
			} until ($exited)
		} finally {
			$stderr.Dispose()
		}
		$process.WaitForExit()
		return [PSCustomObject]@{
			ExitCode = $process.ExitCode
			Stdout = @(Get-Content -LiteralPath $stdoutFile -Encoding UTF8)
		}
	} finally {
		foreach ($name in $variables.Keys) {
			Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
		}
		Remove-Item -LiteralPath $stdoutFile, $stderrFile -ErrorAction SilentlyContinue
	}
}
