# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

# Operations:
# - Setup: provisions a job-owned WSL 2 distribution with Linux Docker Engine, the pinned Linux server and a non-root
#   test user, and sets the root, distro and serverPath outputs. When WSL_PREPARED_DISTRO_VHD names a distribution that
#   Prepare exported, Setup imports it instead of building one, and falls back to building one when that fails.
# - Prepare: builds the same distribution and exports its VHD to the .vhdx file -Destination (see the wsl-distro job of
#   .github/workflows/pr-workspace-images.yml).
# - AddServer: adds the Linux server of a compilation artifact to the distribution.
# - Cleanup: removes the distribution, its files and its firewall rule.
param(
	[ValidateSet('Setup', 'Prepare', 'Cleanup', 'AddServer')]
	[string] $Operation = 'Setup',
	[ValidateSet('GitHub', 'AzureDevOps')]
	[string] $CI = 'GitHub',
	[string] $Distribution,
	[string] $Root,
	# AddServer: a compilation artifact's builds.tar.gz with the Linux server to add to the distribution.
	[string] $Archive,
	# Prepare: the .vhdx file to export the distribution to.
	[string] $Destination
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$scriptStartTime = [DateTime]::UtcNow
Import-Module (Join-Path $PSScriptRoot '..\..\build\azure-pipelines\common\wsl.psm1') -Force
$wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
$workspace = if ($CI -eq 'AzureDevOps') { $env:BUILD_SOURCESDIRECTORY } else { $env:GITHUB_WORKSPACE }
$runId = if ($CI -eq 'AzureDevOps') { $env:BUILD_BUILDID } else { $env:GITHUB_RUN_ID }
$runAttempt = if ($CI -eq 'AzureDevOps') { $env:SYSTEM_JOBATTEMPT } else { $env:GITHUB_RUN_ATTEMPT }
if (-not $workspace -or $runId -notmatch '^\d+$' -or $runAttempt -notmatch '^\d+$') {
	throw "Missing workspace, run ID, or attempt for $CI WSL smoke setup."
}

# The pinned inputs of the distribution.
$rootfsUrl = 'https://cloud-images.ubuntu.com/wsl/jammy/20250318/ubuntu-jammy-wsl-amd64-ubuntu22.04lts.rootfs.tar.gz'
$rootfsSha256 = '1483cc5c1dce13064f774834cbffdff226559fd522a67a381a8ea77d63fb4109'
# The frontend is built from this PR; the unchanged backend uses a pinned published server. The WSL Kerberos proxy smoke
# tests need a server with the agent host's client proxy, Kerberos and certificate support, and the WSL Basic PAC proxy
# smoke tests one with its Basic proxy authentication through the client.
$serverCommit = '54ab79431a5858c9546c7161e5afe5fd9e8570d6'
$aptPackages = 'ca-certificates curl git iproute2 procps docker.io libatomic1 libkrb5-3 krb5-kdc krb5-admin-server squid-openssl openssl'
$devContainerImage = 'mcr.microsoft.com/devcontainers/base:ubuntu-24.04'
$serverPath = '/opt/vscode-smoke-server'

function Write-SmokeOutput([string] $Name, [string] $Value) {
	if ($CI -eq 'AzureDevOps') {
		$variable = switch ($Name) {
			'root' { 'WSL_SMOKE_ROOT' }
			'distro' { 'WSL_SMOKE_DISTRO' }
			'serverPath' { 'WSL_SMOKE_SERVER_PATH' }
			'buildServerPath' { 'WSL_SMOKE_BUILD_SERVER_PATH' }
			default { throw "Unknown WSL smoke output: $Name" }
		}
		$escaped = $Value.Replace('%', '%AZP25').Replace("`r", '%0D').Replace("`n", '%0A')
		Write-Host "##vso[task.setvariable variable=$variable]$escaped"
	} else {
		"$Name=$Value" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
	}
}

function Invoke-Wsl([string] $Command, [int] $TimeoutSeconds = 300) {
	$Command = $Command -replace "`r`n", "`n"
	$result = Invoke-WslExe -ArgumentList @('--distribution', $Distribution, '--user', 'root', '--exec', '/bin/bash', '-euc', $Command) -TimeoutSeconds $TimeoutSeconds -Stream
	if ($result.TimedOut) {
		throw "WSL smoke command timed out after $TimeoutSeconds seconds."
	}
	if ($result.ExitCode -ne 0) {
		throw "WSL smoke command failed with exit code $($result.ExitCode)."
	}
}

function Format-WslResult($Result) {
	if ($Result.TimedOut) { 'timed out' } else { "exit code $($Result.ExitCode)" }
}

function Save-Download([string] $Url, [string] $Destination) {
	# curl only retries until --retry-max-time has passed, so it is longer than --max-time, or a transfer that runs until
	# --max-time would never be retried. Below 1 MiB/s, the 210-325 MiB downloads can't finish within --max-time, so such
	# a transfer is stopped after 30 seconds and retried on a fresh connection.
	curl.exe --fail --location --retry 5 --retry-all-errors --retry-max-time 300 --connect-timeout 30 --max-time 180 --speed-limit 1048576 --speed-time 30 --output $Destination $Url
	if ($LASTEXITCODE -ne 0) {
		throw "Download failed with exit code ${LASTEXITCODE}: $Url"
	}
}

function Write-DiagnosticSection([string] $Name, [scriptblock] $Action) {
	"--- $Name ---"
	try {
		$output = & $Action 2>&1 | Out-String -Width 4096
		$output.TrimEnd()
	} catch {
		"WARNING: Failed to collect ${Name}: $_"
	}
}

function Write-WslDiagnostics([datetime] $ImportStartTime, [string] $InstallPath) {
	'=== WSL diagnostics after failed import ==='
	"Import started (UTC): $($ImportStartTime.ToUniversalTime().ToString('o'))"
	# After a hang, wsl.exe may not respond at all, so every call here has a short timeout.
	Write-DiagnosticSection 'Windows and WSL versions' {
		Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
		"wsl.exe file version: $((Get-Item -LiteralPath $wsl).VersionInfo.FileVersion)"
		$result = Invoke-WslExe -ArgumentList '--version' -TimeoutSeconds 30
		$result.Output.TrimEnd()
		"wsl --version: $(Format-WslResult $result)"
	}
	Write-DiagnosticSection 'wsl --status' {
		$result = Invoke-WslExe -ArgumentList '--status' -TimeoutSeconds 30
		$result.Output.TrimEnd()
		"Result: $(Format-WslResult $result)"
	}
	Write-DiagnosticSection 'wsl --list --verbose' {
		$result = Invoke-WslExe -ArgumentList '--list', '--verbose' -TimeoutSeconds 30
		$result.Output.TrimEnd()
		"Result: $(Format-WslResult $result)"
	}
	Write-DiagnosticSection 'Partial import files' {
		$files = @(Get-ChildItem -LiteralPath $InstallPath -Force)
		if ($files.Count) {
			$files | Select-Object Name, Length, LastWriteTimeUtc | Format-List
		} else {
			'No files created.'
		}
	}
	Write-DiagnosticSection 'Virtualization' {
		Get-CimInstance -ClassName Win32_ComputerSystem |
			Select-Object Manufacturer, Model, HypervisorPresent
	}
	Write-DiagnosticSection 'Windows optional features' {
		foreach ($featureName in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')) {
			Get-WindowsOptionalFeature -Online -FeatureName $featureName |
				Select-Object FeatureName, State
		}
	}
	Write-DiagnosticSection 'WSL services' {
		foreach ($serviceName in @('LxssManager', 'WslService', 'vmcompute', 'hns')) {
			$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
			if ($service) {
				$service | Select-Object Name, Status, StartType
			} else {
				[pscustomobject]@{ Name = $serviceName; Status = 'NotFound'; StartType = $null }
			}
		}
	}
	Write-DiagnosticSection 'Pending reboot indicators' {
		$pendingFileRenames = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue).PendingFileRenameOperations
		[pscustomobject]@{
			ComponentBasedServicing = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'
			WindowsUpdate           = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
			PendingFileRenames      = $null -ne $pendingFileRenames
		}
	}

	$eventStartTime = $ImportStartTime.AddMinutes(-1)
	$eventEndTime = Get-Date
	$wslEventLogs = @()
	try {
		$wslEventLogs = @(Get-WinEvent -ListLog '*Lxss*' -ErrorAction Stop | Select-Object -ExpandProperty LogName)
	} catch {
		"WARNING: Failed to discover WSL event logs: $_"
	}
	Write-DiagnosticSection 'Available WSL event logs' {
		if ($wslEventLogs.Count) { $wslEventLogs } else { 'No Lxss event logs available.' }
	}
	foreach ($eventLogName in @($wslEventLogs + @('Microsoft-Windows-Host-Compute-Service-Admin', 'Microsoft-Windows-Hyper-V-Compute-Admin', 'Microsoft-Windows-Hyper-V-Worker-Admin', 'Microsoft-Windows-Hyper-V-VMMS-Admin') | Select-Object -Unique)) {
		$action = {
			Get-WinEvent -FilterHashtable @{ LogName = $eventLogName; StartTime = $eventStartTime; EndTime = $eventEndTime } -MaxEvents 20 -ErrorAction Stop |
				Select-Object TimeCreated, Id, LevelDisplayName, Message | Format-List
		}.GetNewClosure()
		Write-DiagnosticSection "Recent events: $eventLogName" $action
	}
}

<#
.SYNOPSIS
Unregisters the distribution and removes its files and firewall rule.
#>
function Remove-SmokeDistribution {
	try {
		Get-NetFirewallRule -Name $Distribution -ErrorAction SilentlyContinue | Remove-NetFirewallRule
		$registered = Invoke-WslExe -ArgumentList '--list', '--quiet' -TimeoutSeconds 60
		if ($registered.TimedOut) {
			throw "WSL is not responding; leaving $Distribution and its files intact."
		}
		$names = @($registered.Output -split "`r?`n" | ForEach-Object { $_.Trim() })
		if ($registered.ExitCode -ne 0 -or $names -contains $Distribution) {
			$logDirectory = Join-Path $workspace '.build\logs\wsl-dev-container'
			New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
			(Invoke-WslExe -ArgumentList '--distribution', $Distribution, '--user', 'root', '--exec', '/bin/sh', '-c', 'docker info; docker network inspect bridge --format "Docker bridge: {{range .IPAM.Config}}{{.Subnet}} {{end}}"; ip -4 route; cat /var/log/docker.log 2>/dev/null' -TimeoutSeconds 60).Output |
				Out-File -FilePath (Join-Path $logDirectory 'docker.log') -Encoding utf8
			Invoke-WslExe -ArgumentList '--terminate', $Distribution -TimeoutSeconds 60 | Out-Null
			$unregister = Invoke-WslExe -ArgumentList '--unregister', $Distribution -TimeoutSeconds 120
			if ($unregister.ExitCode -ne 0) {
				throw "Failed to unregister $Distribution ($(Format-WslResult $unregister)); leaving its files intact."
			}
		}
		Remove-Item -LiteralPath $Root -Recurse -Force
	} catch {
		throw "WSL smoke cleanup failed: $_"
	}
}

<#
.SYNOPSIS
Drops any registration of the distribution, stops the utility VM and empties the install directory, to start again.
#>
function Reset-SmokeDistribution([string] $Install) {
	Write-Host (Invoke-WslExe -ArgumentList '--unregister', $Distribution -TimeoutSeconds 60).Output
	$shutdown = Invoke-WslExe -ArgumentList '--shutdown', '--force' -TimeoutSeconds 60
	Write-Host "$($shutdown.Output)wsl --shutdown --force: $(Format-WslResult $shutdown)"
	if (Test-Path -LiteralPath $Install) {
		Remove-Item -LiteralPath $Install -Recurse -Force
	}
	New-Item -ItemType Directory -Path $Install | Out-Null
}

<#
.SYNOPSIS
Imports the distribution from the pinned Ubuntu rootfs.
#>
function Import-RootfsDistribution([string] $Install) {
	$archive = Join-Path $Root 'ubuntu-rootfs.tar.gz'
	Save-Download $rootfsUrl $archive
	if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $rootfsSha256) {
		throw 'Ubuntu WSL rootfs SHA256 mismatch.'
	}
	# The WSL2 utility VM sometimes stops right after boot or hangs, failing or blocking the import, so the import has
	# a timeout (a healthy one takes about 15 seconds) and is retried on a fresh utility VM.
	$maxImportAttempts = 3
	$importTimeoutSeconds = 120
	for ($importAttempt = 1; ; $importAttempt++) {
		$importStartTime = Get-Date
		$import = Invoke-WslExe -ArgumentList '--import', $Distribution, $Install, $archive, '--version', '2' -TimeoutSeconds $importTimeoutSeconds
		if ($import.ExitCode -eq 0) {
			break
		}
		$importResult = Format-WslResult $import
		$logDirectory = Join-Path $workspace '.build\logs\wsl-dev-container'
		New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
		$diagnosticsPath = Join-Path $logDirectory "import-$Distribution-attempt-$importAttempt.log"
		@("Import attempt: $importAttempt of $maxImportAttempts", "Import result: $importResult", 'Import output:', $import.Output) |
			Tee-Object -FilePath $diagnosticsPath
		Write-WslDiagnostics $importStartTime $Install | Tee-Object -FilePath $diagnosticsPath -Append
		if ($importAttempt -ge $maxImportAttempts) {
			throw "Explicit WSL2 import failed ($importResult) after $importAttempt attempts. WSL1 is not supported by this test."
		}
		Write-Warning "Explicit WSL2 import attempt $importAttempt failed ($importResult). Resetting WSL before retrying."
		Reset-SmokeDistribution $Install
		Start-Sleep -Seconds (10 * $importAttempt)
	}
	Write-Host $import.Output
	Invoke-Wsl 'uname -a; cat /etc/os-release' 120
}

<#
.SYNOPSIS
Downloads the .deb files listed in apt's --print-uris output to a directory until a deadline, and returns how many of
them it got. It leaves the packages it does not get to apt.

.DESCRIPTION
The packages are downloaded by the host rather than by apt in the distribution. The Azure mirror at times serves package
files at under 100 KB/s for minutes, or not at all for a while, while its index files stay fast, and apt keeps such a
connection until this step times out. Here the packages are downloaded in parallel, so stalls overlap rather than add
up. A transfer that stays below 256 KB/s for 20 seconds is stopped and continued on a fresh connection from where it
stopped, so a slow connection loses no bytes. Retries back off only after an attempt that got no bytes. The Azure mirror
is the only source, as archive.ubuntu.com answers 403 to the build agents.
A file of the wrong hash is downloaded again once, and apt checks each file against the index when it installs.
#>
function Save-DebPackages([string] $UriList, [string] $Directory, [datetime] $Deadline) {
	$packages = foreach ($line in Get-Content -LiteralPath $UriList) {
		if ($line -match "^'(https?://[^']+)' ([A-Za-z0-9_.+~%-]+\.deb) (\d+) (SHA512|SHA256|SHA1|MD5Sum):([0-9a-f]+)") {
			[pscustomobject]@{
				Url = $Matches[1]
				Name = $Matches[2]
				Destination = Join-Path $Directory $Matches[2]
				Size = [long]$Matches[3]
				Algorithm = @{ SHA512 = 'SHA512'; SHA256 = 'SHA256'; SHA1 = 'SHA1'; MD5Sum = 'MD5' }[$Matches[4]]
				Hash = $Matches[5].ToUpperInvariant()
			}
		}
	}
	$downloaded = $packages | ForEach-Object -ThrottleLimit 6 -Parallel {
		$package = $_
		$deadline = $using:Deadline
		$retryDelay = 1
		$hashMismatches = 0
		while ($true) {
			$length = if (Test-Path -LiteralPath $package.Destination) { (Get-Item -LiteralPath $package.Destination).Length } else { 0 }
			if ($length -eq $package.Size) {
				if ((Get-FileHash -LiteralPath $package.Destination -Algorithm $package.Algorithm).Hash -eq $package.Hash) {
					return $package.Name
				}
				$hashMismatches++
				Write-Host "$($package.Name) does not match its $($package.Algorithm) hash."
			}
			if ($length -ge $package.Size) {
				Remove-Item -LiteralPath $package.Destination
				$length = 0
			}
			$remainingSeconds = [int]($deadline - [DateTime]::UtcNow).TotalSeconds
			if ($remainingSeconds -lt 10 -or $hashMismatches -ge 2) {
				Remove-Item -LiteralPath $package.Destination -ErrorAction SilentlyContinue
				Write-Host "Leaving $($package.Name) for apt to download (got $length of $($package.Size) bytes)."
				return
			}
			$curlOutput = curl.exe --fail --location --silent --show-error --connect-timeout 10 --max-time ([Math]::Min(120, $remainingSeconds)) --speed-limit 262144 --speed-time 20 --continue-at - --output $package.Destination $package.Url 2>&1
			$exitCode = $LASTEXITCODE
			if ($exitCode -eq 0) {
				continue
			}
			# 33: the server did not accept the range request, so the next attempt starts over.
			if ($exitCode -eq 33) {
				Remove-Item -LiteralPath $package.Destination -ErrorAction SilentlyContinue
			}
			$newLength = if (Test-Path -LiteralPath $package.Destination) { (Get-Item -LiteralPath $package.Destination).Length } else { 0 }
			Write-Host "Download of $($package.Name) stopped at $newLength of $($package.Size) bytes: $(($curlOutput | Out-String).Trim())"
			if ($newLength -gt $length) {
				$retryDelay = 1
			} else {
				Start-Sleep -Seconds $retryDelay
				$retryDelay = [Math]::Min(2 * $retryDelay, 16)
			}
		}
	}
	return @($downloaded).Count
}

<#
.SYNOPSIS
Installs the pinned Linux server, the apt packages and the non-root test user into the distribution.
#>
function Install-DistributionContent {
	$metadata = Invoke-RestMethod "https://update.code.visualstudio.com/api/versions/commit:$serverCommit/server-linux-x64/insider"
	if (-not $metadata.url -or $metadata.sha256hash -notmatch '^[0-9a-fA-F]{64}$') {
		throw 'The pinned Linux server download metadata is incomplete.'
	}
	$serverArchive = Join-Path $Root 'server.tar.gz'
	Save-Download $metadata.url $serverArchive
	if ((Get-FileHash -LiteralPath $serverArchive -Algorithm SHA256).Hash -ne $metadata.sha256hash) {
		throw 'Linux server SHA256 mismatch.'
	}
	$wslPath = Invoke-WslExe -ArgumentList '--distribution', $Distribution, '--exec', 'wslpath', '-u', $serverArchive
	$linuxArchive = $wslPath.Output.Trim()
	if ($wslPath.ExitCode -ne 0 -or $linuxArchive -notmatch '^/mnt/[a-z]/[a-zA-Z0-9/_.-]+$') {
		throw 'Cannot safely resolve the Linux server archive path.'
	}
	# From the Azure-hosted agents, archive.ubuntu.com and security.ubuntu.com are at times so slow that apt runs past this
	# command's timeout, so apt uses the Azure Ubuntu mirror. apt only warns about index files it could not fetch, so the
	# index update fails on any fetch error and is retried. The WSL Kerberos proxy smoke tests run their own KDC and Squid,
	# so policy-rc.d keeps the packages from starting theirs.
	$linuxRoot = $linuxArchive.Substring(0, $linuxArchive.LastIndexOf('/'))
	$debDirectory = Join-Path $Root 'debs'
	New-Item -ItemType Directory -Force -Path $debDirectory | Out-Null
	Invoke-Wsl @"
export DEBIAN_FRONTEND=noninteractive
sed -i -e 's|http://archive.ubuntu.com|http://azure.archive.ubuntu.com|g' -e 's|http://security.ubuntu.com|http://azure.archive.ubuntu.com|g' /etc/apt/sources.list
printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries
for attempt in 1 2 3; do
	if timeout --kill-after=10 45 apt-get update --error-on=any; then
		break
	fi
	if [ "`$attempt" = 3 ]; then
		exit 1
	fi
	echo "Attempt `$attempt of 3 failed: apt-get update" >&2
done
apt-get install -y -qq --print-uris --no-install-recommends $aptPackages > '$linuxRoot/apt-uris.txt'
"@ 180

	# The host stops 10 minutes after the script started, leaving at least 5 minutes of the Azure DevOps step's 15-minute
	# timeout for installing.
	$debCount = Save-DebPackages (Join-Path $Root 'apt-uris.txt') $debDirectory $scriptStartTime.AddMinutes(10)
	Write-Host "Downloaded $debCount packages on the host."
	# A failed curl in Save-DebPackages must not become the exit code of this script.
	$global:LASTEXITCODE = 0

	Invoke-Wsl @"
export DEBIAN_FRONTEND=noninteractive
cp '$linuxRoot'/debs/*.deb /var/cache/apt/archives/ 2>/dev/null || true
printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod +x /usr/sbin/policy-rc.d
apt-get install -y --no-install-recommends $aptPackages
rm /usr/sbin/policy-rc.d
mkdir -p $serverPath
tar -xzf '$linuxArchive' --strip-components=1 -C $serverPath
$serverPath/node --version
test -f $serverPath/out/bootstrap-fork.js
useradd --create-home --shell /bin/bash vscode-smoke
usermod -aG docker vscode-smoke
printf '[user]\ndefault=vscode-smoke\n' > /etc/wsl.conf
"@ 720
	if ((Invoke-WslExe -ArgumentList '--terminate', $Distribution).ExitCode -ne 0) {
		throw 'Failed to restart the owned distribution to apply its non-root default user.'
	}
}

<#
.SYNOPSIS
Starts Docker Engine in the distribution and checks that the default user can run the dev container image with a
bind mount. With -Pull, pulls the image first; otherwise the distribution must already have it.
#>
function Start-SmokeDocker([switch] $Pull) {
	$image = if ($Pull) { "docker pull $devContainerImage" } else { "docker image inspect --format '{{index .RepoDigests 0}}' $devContainerImage" }
	# Docker's default nftables backend needs matches that older WSL2 kernels lack; legacy iptables works with all of them.
	# dockerd keeps the subnet of its default bridge in /var/lib/docker/network and reuses it. A prepared distribution
	# brings the subnet that dockerd chose on the machine that prepared it, usually 172.17.0.0/16, and WSL can put this
	# machine's NAT network inside it, such as 172.17.16.0/20. Containers then cannot reach the resolver or the host.
	# Without the stored network, dockerd picks a subnet that does not overlap the routes of this machine.
	Invoke-Wsl @"
update-alternatives --set iptables /usr/sbin/iptables-legacy
update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy
rm -rf /var/lib/docker/network
start-stop-daemon --start --background --make-pidfile --pidfile /run/vscode-smoke-docker.pid --startas /bin/sh -- -c 'exec /usr/bin/dockerd > /var/log/docker.log 2>&1'
for attempt in `$(seq 1 60); do
	if docker info > /dev/null 2>&1; then break; fi
	sleep 1
done
if ! docker info; then
	cat /var/log/docker.log
	exit 1
fi
test "`$(docker info --format '{{.OSType}}')" = linux
$image
mkdir -p /tmp/vscode-smoke-bind-check
printf smoke > /tmp/vscode-smoke-bind-check/marker
docker run --rm --mount type=bind,source=/tmp/vscode-smoke-bind-check,target=/check $devContainerImage sh -c 'test "`$(cat /check/marker)" = smoke'
rm /tmp/vscode-smoke-bind-check/marker
rmdir /tmp/vscode-smoke-bind-check
"@
	if ((Invoke-WslExe -ArgumentList '--distribution', $Distribution, '--exec', '/bin/sh', '-ec', 'test "$(id -u)" -ne 0; docker info --format "{{.OSType}}"' -Stream).ExitCode -ne 0) {
		throw 'The default WSL smoke user cannot access Docker.'
	}
}

<#
.SYNOPSIS
Shrinks a dynamically expanding VHD by dropping the blocks that fstrim released. Failures only leave it larger.
#>
function Optimize-PreparedVhd([string] $Path) {
	$commands = Join-Path ([IO.Path]::GetTempPath()) "compact-$([guid]::NewGuid().ToString('N')).txt"
	try {
		@("select vdisk file=`"$Path`"", 'attach vdisk readonly', 'compact vdisk', 'detach vdisk') | Set-Content -LiteralPath $commands
		diskpart /s $commands | Out-Host
		if ($LASTEXITCODE -ne 0) {
			Write-Warning "Compacting $Path failed with exit code $LASTEXITCODE; exporting it as is."
			@("select vdisk file=`"$Path`"", 'detach vdisk noerr') | Set-Content -LiteralPath $commands
			diskpart /s $commands | Out-Host
		}
	} finally {
		Remove-Item -LiteralPath $commands -ErrorAction SilentlyContinue
		$global:LASTEXITCODE = 0
	}
}

<#
.SYNOPSIS
Stops the distribution and exports its VHD to the .vhdx file $Path.
#>
function Export-PreparedDistribution([string] $Path) {
	$digest = Invoke-WslExe -ArgumentList '--distribution', $Distribution, '--user', 'root', '--exec', 'docker', 'image', 'inspect', '--format', '{{index .RepoDigests 0}}', $devContainerImage
	if ($digest.ExitCode -ne 0) {
		throw "Cannot determine the digest of ${devContainerImage}: $($digest.Output)"
	}
	# Every run starts its own dockerd and only needs its own log. Without the apt lists, apt needs an update first.
	Invoke-Wsl @'
start-stop-daemon --stop --oknodo --pidfile /run/vscode-smoke-docker.pid --remove-pidfile --retry TERM/30/KILL/5
: > /var/log/docker.log
apt-get clean
rm -rf /var/lib/apt/lists/*
sync
fstrim --verbose / || echo 'fstrim failed, so the export keeps the blocks of deleted files.'
'@
	# A VHD export fails with a sharing violation while the utility VM still holds the distribution's VHD, which
	# --terminate doesn't release (https://github.com/microsoft/WSL/issues/10737). Prepare runs in a job of its own, so
	# it stops the VM.
	$shutdown = Invoke-WslExe -ArgumentList '--shutdown' -TimeoutSeconds 60
	if ($shutdown.ExitCode -ne 0) {
		throw "Failed to stop WSL before exporting $Distribution ($(Format-WslResult $shutdown))."
	}
	New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
	Remove-Item -LiteralPath $Path -ErrorAction SilentlyContinue
	# A VHD export copies the distribution's ext4.vhdx as it is, which needs the same file extension.
	$export = Invoke-WslExe -ArgumentList '--export', $Distribution, $Path, '--format', 'vhd' -TimeoutSeconds 600
	if ($export.ExitCode -ne 0) {
		throw "Exporting $Distribution failed ($(Format-WslResult $export)): $($export.Output)"
	}
	$exportedSize = (Get-Item -LiteralPath $Path).Length
	Optimize-PreparedVhd $Path
	$compactedSize = (Get-Item -LiteralPath $Path).Length
	Write-Host ('Exported {0} with {1} to {2}: {3:N2} GB, {4:N2} GB after compacting.' -f $Distribution, $digest.Output.Trim(), $Path, ($exportedSize / 1GB), ($compactedSize / 1GB))
}

<#
.SYNOPSIS
Registers the distribution that Prepare exported to the .vhdx file $Vhd in the install directory, without copying it.
#>
function Import-PreparedDistribution([string] $Vhd, [string] $Install) {
	$installedVhd = Join-Path $Install 'ext4.vhdx'
	# On the same volume, this is a rename rather than a copy of several GB.
	Move-Item -LiteralPath $Vhd -Destination $installedVhd
	$import = Invoke-WslExe -ArgumentList '--import-in-place', $Distribution, $installedVhd -TimeoutSeconds 120
	if ($import.ExitCode -ne 0) {
		throw "wsl --import-in-place failed ($(Format-WslResult $import)): $($import.Output)"
	}
	Write-Host $import.Output
	Invoke-Wsl 'uname -a; cat /etc/os-release' 120
}

if ($Operation -eq 'Cleanup') {
	if ($Distribution -notmatch '^vscode-wsl-smoke-\d+-\d+-[0-9a-f]{32}$') {
		throw 'Refusing cleanup of an unexpected WSL distribution.'
	}
	$Root = [IO.Path]::GetFullPath($Root)
	if ([IO.Path]::GetDirectoryName($Root) -ne [IO.Path]::GetFullPath((Join-Path $workspace '.build')) -or [IO.Path]::GetFileName($Root) -ne $Distribution) {
		throw 'Refusing cleanup of an unexpected WSL smoke directory.'
	}
	Remove-SmokeDistribution
	exit 0
}

if ($Operation -eq 'AddServer') {
	if ($Distribution -notmatch '^vscode-wsl-smoke-\d+-\d+-[0-9a-f]{32}$') {
		throw 'Refusing to change an unexpected WSL distribution.'
	}
	$wslPath = Invoke-WslExe -ArgumentList '--distribution', $Distribution, '--exec', 'wslpath', '-u', ([IO.Path]::GetFullPath($Archive))
	$linuxArchive = $wslPath.Output.Trim()
	if ($wslPath.ExitCode -ne 0 -or $linuxArchive -notmatch '^/mnt/[a-z]/[a-zA-Z0-9/_.-]+$') {
		throw 'Cannot safely resolve the compilation archive path.'
	}
	# The server of the same build accepts the packaged client, unlike the pinned server.
	Invoke-Wsl @"
mkdir /opt/vscode-smoke-build-server
tar -xzf '$linuxArchive' --strip-components=1 -C /opt/vscode-smoke-build-server vscode-server-linux-x64
/opt/vscode-smoke-build-server/node --version
test -f /opt/vscode-smoke-build-server/out/server-main.js
"@ 600
	Write-SmokeOutput 'buildServerPath' '/opt/vscode-smoke-build-server'
	exit 0
}

if ($Operation -eq 'Prepare' -and $Destination -notmatch '\.vhdx$') {
	throw 'Prepare needs a .vhdx file -Destination to export the distribution to.'
}
if (-not (Test-Path -LiteralPath $wsl)) {
	throw 'WSL is unavailable. This job requires WSL and VirtualMachinePlatform enabled without a pending reboot.'
}
$installerCache = if ($env:WSL_INSTALLER_CACHE_DIR) { $env:WSL_INSTALLER_CACHE_DIR } else { Join-Path $workspace '.build\wsl-installer' }
Install-Wsl -CacheDirectory $installerCache
$stopwatch = [Diagnostics.Stopwatch]::StartNew()

$Distribution = "vscode-wsl-smoke-$runId-$runAttempt-$([guid]::NewGuid().ToString('N'))"
$Root = Join-Path $workspace ".build\$Distribution"
New-Item -ItemType Directory -Path $Root | Out-Null
$install = Join-Path $Root 'distro'
New-Item -ItemType Directory -Path $install | Out-Null

if ($Operation -eq 'Prepare') {
	try {
		Import-RootfsDistribution $install
		Install-DistributionContent
		Start-SmokeDocker -Pull
		Export-PreparedDistribution $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination)
	} finally {
		try {
			Remove-SmokeDistribution
		} catch {
			Write-Warning $_
		}
	}
	Write-Host "Prepared the WSL distribution with Linux server $serverCommit in $([int]$stopwatch.Elapsed.TotalSeconds)s."
	exit 0
}

Write-SmokeOutput 'root' $Root
Write-SmokeOutput 'distro' $Distribution

$imported = $false
if ($env:WSL_PREPARED_DISTRO_VHD -and (Test-Path -LiteralPath $env:WSL_PREPARED_DISTRO_VHD -PathType Leaf)) {
	try {
		Import-PreparedDistribution $env:WSL_PREPARED_DISTRO_VHD $install
		Start-SmokeDocker
		$imported = $true
	} catch {
		Write-Warning "Cannot use the prepared WSL distribution, building it instead: $_"
		Reset-SmokeDistribution $install
	}
} else {
	Write-Host 'No prepared WSL distribution, building it.'
}
if (-not $imported) {
	Import-RootfsDistribution $install
	Install-DistributionContent
	Start-SmokeDocker -Pull
}

$addresses = Invoke-WslExe -ArgumentList '--distribution', $Distribution, '--exec', 'hostname', '-I'
if ($addresses.ExitCode -ne 0) {
	throw 'Cannot determine the WSL guest address for mock-server access.'
}
$guestAddress = ($addresses.Output.Trim() -split '\s+')[0]
if ($guestAddress -notmatch '^\d+\.\d+\.\d+\.\d+$') {
	throw "Unexpected WSL guest address: $guestAddress"
}
New-NetFirewallRule -Name $Distribution -DisplayName $Distribution -Direction Inbound -Action Allow -Protocol TCP -RemoteAddress $guestAddress | Out-Null
Write-SmokeOutput 'serverPath' $serverPath
$source = if ($imported) { 'imported the prepared distribution' } else { 'built the distribution' }
Write-Host "WSL Docker is ready in $Distribution with Linux server $serverCommit ($source in $([int]$stopwatch.Elapsed.TotalSeconds)s)."
