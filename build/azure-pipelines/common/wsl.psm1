# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

# Provisions WSL on the Windows Server 2022 CI agents. Their image only has the inbox WSL (wsl.exe 10.0.20348)
# without a WSL2 kernel, and with the 2021 standalone kernel its utility VM intermittently hangs on import or
# crashes processes, so CI installs the WSL release pinned in build/checksums/wsl.txt instead.

$ErrorActionPreference = 'Stop'
$script:WslExe = Join-Path $env:SystemRoot 'System32\wsl.exe'
# Without this, current wsl.exe writes UTF-16 to redirected output.
$env:WSL_UTF8 = '1'

<#
.SYNOPSIS
Runs wsl.exe, and kills it when it doesn't finish in time, because a hung WSL utility VM blocks wsl.exe indefinitely.

.OUTPUTS
An object with the ExitCode ($null after a timeout), TimedOut and, unless -Stream is set, the combined Output.
#>
function Invoke-WslExe {
	param(
		[Parameter(Mandatory)] [string[]] $ArgumentList,
		[int] $TimeoutSeconds = 60,
		# Write the output to the console as it arrives, instead of capturing it.
		[switch] $Stream
	)

	$startInfo = [Diagnostics.ProcessStartInfo]::new($script:WslExe)
	foreach ($argument in $ArgumentList) {
		$startInfo.ArgumentList.Add($argument)
	}
	$startInfo.UseShellExecute = $false
	$startInfo.RedirectStandardOutput = -not $Stream
	$startInfo.RedirectStandardError = -not $Stream
	$process = [Diagnostics.Process]::Start($startInfo)
	try {
		$reads = if ($Stream) { @() } else { @($process.StandardOutput.ReadToEndAsync(), $process.StandardError.ReadToEndAsync()) }
		$timedOut = -not $process.WaitForExit($TimeoutSeconds * 1000)
		if ($timedOut) {
			$commandLine = $ArgumentList -join ' '
			if ($commandLine.Length -gt 100) {
				$commandLine = $commandLine.Substring(0, 100) + '...'
			}
			Write-Warning "wsl.exe $commandLine did not finish within $TimeoutSeconds seconds, killing it."
			$process.Kill($true)
			$process.WaitForExit(10000) | Out-Null
		}
		$output = ''
		if ($reads.Count) {
			# Processes left behind by a killed wsl.exe can keep the pipes open, so don't wait for them indefinitely.
			if ([Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]] $reads, 10000)) {
				$output = (($reads | ForEach-Object Result) -join '') -replace "`0", ''
			} else {
				$output = '(output unavailable)'
			}
		}
		return [pscustomobject]@{
			ExitCode = if ($timedOut) { $null } else { $process.ExitCode }
			TimedOut = $timedOut
			Output   = $output
		}
	} finally {
		$process.Dispose()
	}
}

<#
.SYNOPSIS
Returns the version of the installed WSL package, or $null for the inbox WSL, which doesn't support --version.
#>
function Get-WslPackageVersion {
	$result = Invoke-WslExe -ArgumentList '--version' -TimeoutSeconds 60
	if ($result.ExitCode -eq 0 -and $result.Output -match 'WSL[^:\r\n]*:\s*(?<version>\d+(\.\d+){1,3})') {
		return [version] $Matches.version
	}
	return $null
}

function Write-WslHostInfo {
	$os = Get-CimInstance -ClassName Win32_OperatingSystem
	$updateBuildRevision = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name UBR -ErrorAction SilentlyContinue).UBR
	$processor = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
	Write-Host "Host: $($os.Caption) $($os.Version).$updateBuildRevision, CPU: $($processor.Name.Trim()) ($($processor.NumberOfLogicalProcessors) logical processors)"
}

<#
.SYNOPSIS
Installs the WSL release pinned in build/checksums/wsl.txt and makes WSL2 the default version, unless that release or
a newer one is already installed. Needs administrator rights.
#>
function Install-Wsl {
	param(
		# Keeps the verified installer, so that CI caches can restore it instead of downloading it again.
		[Parameter(Mandatory)] [string] $CacheDirectory,
		# Only download and verify the installer, to populate a cache.
		[switch] $DownloadOnly
	)

	$checksumFile = Join-Path $PSScriptRoot '..\..\checksums\wsl.txt'
	$pin = Get-Content -LiteralPath $checksumFile | Where-Object { $_.Trim() } | Select-Object -First 1
	if ($pin -notmatch '^(?<hash>[0-9a-f]{64})\s+\*?(?<file>wsl\.(?<release>\d+\.\d+\.\d+)\.\d+\.x64\.msi)\s*$') {
		throw "Unexpected WSL installer pin in ${checksumFile}: $pin"
	}
	$hash = $Matches.hash
	$file = $Matches.file
	$release = $Matches.release
	$installer = Join-Path $CacheDirectory $file

	if (-not $DownloadOnly) {
		Write-WslHostInfo
		$installedVersion = Get-WslPackageVersion
		if ($installedVersion -and $installedVersion -ge [version] $release) {
			Write-Host "WSL $installedVersion is already installed."
			return
		}
		Write-Host "Installed WSL: $(if ($installedVersion) { $installedVersion } else { 'inbox' }). Installing WSL $release."
	}

	if ((Test-Path -LiteralPath $installer -PathType Leaf) -and (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -eq $hash) {
		Write-Host "Using the cached WSL installer $installer."
	} else {
		New-Item -ItemType Directory -Force -Path $CacheDirectory | Out-Null
		$url = "https://github.com/microsoft/WSL/releases/download/$release/$file"
		curl.exe --fail --location --silent --show-error --retry 5 --retry-all-errors --retry-max-time 300 --connect-timeout 30 --max-time 600 --output $installer $url
		if ($LASTEXITCODE -ne 0) {
			throw "Downloading the WSL installer failed with exit code ${LASTEXITCODE}: $url"
		}
		if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $hash) {
			Remove-Item -LiteralPath $installer -Force
			throw "The WSL installer from $url does not match the SHA256 in $checksumFile."
		}
	}
	if ($DownloadOnly) {
		return
	}

	$signature = Get-AuthenticodeSignature -LiteralPath $installer
	if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation,') {
		throw "The WSL installer does not have a valid Microsoft signature ($($signature.Status))."
	}

	$installLog = Join-Path ([IO.Path]::GetTempPath()) "wsl-install-$([guid]::NewGuid().ToString('N')).log"
	$installStart = Get-Date
	$msiexec = Start-Process msiexec.exe -ArgumentList @('/i', "`"$installer`"", '/qn', '/norestart', '/l*v', "`"$installLog`"") -PassThru
	# Without holding the handle, ExitCode stays empty for processes started without -Wait.
	$null = $msiexec.Handle
	if (-not $msiexec.WaitForExit(10 * 60 * 1000)) {
		$msiexec.Kill($true)
		throw "The WSL installer did not finish within 10 minutes. Log: $installLog"
	}
	Write-Host "WSL installer exit code: $($msiexec.ExitCode) after $([int]((Get-Date) - $installStart).TotalSeconds)s"
	if ($msiexec.ExitCode -eq 3010) {
		# The checks below show whether WSL works without the reboot.
		Write-Warning 'The WSL installer requested a reboot, which CI cannot do.'
	} elseif ($msiexec.ExitCode -ne 0) {
		Get-Content -LiteralPath $installLog -Tail 50 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
		throw "The WSL installer failed with exit code $($msiexec.ExitCode)."
	}

	# The WSL service can still be finishing the upgrade after the installer returns.
	$deadline = (Get-Date).AddMinutes(5)
	while ($true) {
		$status = Invoke-WslExe -ArgumentList '--status' -TimeoutSeconds 60
		if (-not $status.TimedOut -and $status.Output -notmatch 'finishing an upgrade') {
			break
		}
		if ((Get-Date) -gt $deadline) {
			throw "WSL did not finish upgrading within 5 minutes: $($status.Output)"
		}
		Start-Sleep -Seconds 5
	}

	$installedVersion = Get-WslPackageVersion
	if (-not $installedVersion -or $installedVersion -lt [version] $release) {
		throw "WSL $release is not active after installation (installed: $(if ($installedVersion) { $installedVersion } else { 'inbox' }))."
	}
	$defaultVersion = Invoke-WslExe -ArgumentList '--set-default-version', '2' -TimeoutSeconds 60
	if ($defaultVersion.ExitCode -ne 0) {
		throw "Setting WSL2 as the default version failed: $($defaultVersion.Output)"
	}
	Write-Host (Invoke-WslExe -ArgumentList '--version' -TimeoutSeconds 60).Output
}

Export-ModuleMember -Function Invoke-WslExe, Install-Wsl
