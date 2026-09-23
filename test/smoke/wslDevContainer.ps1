# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

param(
	[ValidateSet('Setup', 'Cleanup')]
	[string] $Operation = 'Setup',
	[ValidateSet('GitHub', 'AzureDevOps')]
	[string] $CI = 'GitHub',
	[string] $Distribution,
	[string] $Root
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
$workspace = if ($CI -eq 'AzureDevOps') { $env:BUILD_SOURCESDIRECTORY } else { $env:GITHUB_WORKSPACE }
$runId = if ($CI -eq 'AzureDevOps') { $env:BUILD_BUILDID } else { $env:GITHUB_RUN_ID }
$runAttempt = if ($CI -eq 'AzureDevOps') { $env:SYSTEM_JOBATTEMPT } else { $env:GITHUB_RUN_ATTEMPT }
if (-not $workspace -or $runId -notmatch '^\d+$' -or $runAttempt -notmatch '^\d+$') {
	throw "Missing workspace, run ID, or attempt for $CI WSL smoke setup."
}

function Write-SmokeOutput([string] $Name, [string] $Value) {
	if ($CI -eq 'AzureDevOps') {
		$variable = switch ($Name) {
			'root' { 'WSL_SMOKE_ROOT' }
			'distro' { 'WSL_SMOKE_DISTRO' }
			'serverPath' { 'WSL_SMOKE_SERVER_PATH' }
			default { throw "Unknown WSL smoke output: $Name" }
		}
		$escaped = $Value.Replace('%', '%AZP25').Replace("`r", '%0D').Replace("`n", '%0A')
		Write-Host "##vso[task.setvariable variable=$variable]$escaped"
	} else {
		"$Name=$Value" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
	}
}

function Invoke-Wsl([string] $Command) {
	$Command = $Command -replace "`r`n", "`n"
	& $wsl --distribution $Distribution --user root --exec /bin/bash -euc $Command
	if ($LASTEXITCODE -ne 0) {
		throw "WSL smoke command failed with exit code $LASTEXITCODE."
	}
}

function Save-Download([string] $Url, [string] $Destination) {
	curl.exe --fail --location --retry 5 --retry-max-time 120 --connect-timeout 30 --max-time 180 --output $Destination $Url
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
	Write-DiagnosticSection 'Windows and WSL versions' {
		Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
		"wsl.exe file version: $((Get-Item -LiteralPath $wsl).VersionInfo.FileVersion)"
		$output = & $wsl --version 2>&1
		$exitCode = $LASTEXITCODE
		$output | Select-Object -First 20 | ForEach-Object { "$_" -replace "`0", '' }
		"wsl --version exit code: $exitCode"
	}
	Write-DiagnosticSection 'wsl --status' {
		$output = & $wsl --status 2>&1
		$exitCode = $LASTEXITCODE
		$output | ForEach-Object { "$_" -replace "`0", '' }
		"Exit code: $exitCode"
	}
	Write-DiagnosticSection 'wsl --list --verbose' {
		$output = & $wsl --list --verbose 2>&1
		$exitCode = $LASTEXITCODE
		$output | ForEach-Object { "$_" -replace "`0", '' }
		"Exit code: $exitCode"
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

if ($Operation -eq 'Cleanup') {
	if ($Distribution -notmatch '^vscode-wsl-smoke-\d+-\d+-[0-9a-f]{32}$') {
		throw 'Refusing cleanup of an unexpected WSL distribution.'
	}
	$Root = [IO.Path]::GetFullPath($Root)
	if ([IO.Path]::GetDirectoryName($Root) -ne [IO.Path]::GetFullPath((Join-Path $workspace '.build')) -or [IO.Path]::GetFileName($Root) -ne $Distribution) {
		throw 'Refusing cleanup of an unexpected WSL smoke directory.'
	}
	try {
		Get-NetFirewallRule -Name $Distribution -ErrorAction SilentlyContinue | Remove-NetFirewallRule
		$registered = & $wsl --list --quiet
		$listExitCode = $LASTEXITCODE
		$names = @($registered | ForEach-Object { ($_ -replace "`0", '').Trim() })
		if ($listExitCode -ne 0 -or $names -contains $Distribution) {
			$logDirectory = Join-Path $workspace '.build\logs\wsl-dev-container'
			New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
			& $wsl --distribution $Distribution --user root --exec /bin/sh -c 'docker info; cat /var/log/docker.log 2>/dev/null' |
				Out-File -FilePath (Join-Path $logDirectory 'docker.log') -Encoding utf8
			& $wsl --terminate $Distribution
			& $wsl --unregister $Distribution
			if ($LASTEXITCODE -ne 0) {
				throw "Failed to unregister $Distribution; leaving its files intact."
			}
		}
		Remove-Item -LiteralPath $Root -Recurse -Force
	} catch {
		throw "WSL smoke cleanup failed: $_"
	}
	exit 0
}

if (-not (Test-Path -LiteralPath $wsl)) {
	throw 'WSL is unavailable. This job requires WSL and VirtualMachinePlatform enabled without a pending reboot.'
}
$Distribution = "vscode-wsl-smoke-$runId-$runAttempt-$([guid]::NewGuid().ToString('N'))"
$Root = Join-Path $workspace ".build\$Distribution"
New-Item -ItemType Directory -Path $Root | Out-Null
Write-SmokeOutput 'root' $Root
Write-SmokeOutput 'distro' $Distribution

$kernelPackage = Join-Path $Root 'wsl_update_x64.msi'
Save-Download 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' $kernelPackage
$signature = Get-AuthenticodeSignature -LiteralPath $kernelPackage
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation,') {
	throw 'The WSL2 kernel package does not have a valid Microsoft signature.'
}
$installer = Start-Process msiexec.exe -ArgumentList @('/i', "`"$kernelPackage`"", '/qn', '/norestart') -Wait -PassThru
Write-Host "WSL2 kernel installer exit code: $($installer.ExitCode)"
if ($installer.ExitCode -ne 0) {
	throw "WSL2 kernel installation failed or requires a reboot (exit code $($installer.ExitCode)). No reboot will be attempted."
}

$archive = Join-Path $Root 'ubuntu-rootfs.tar.gz'
Save-Download 'https://cloud-images.ubuntu.com/wsl/jammy/20250318/ubuntu-jammy-wsl-amd64-ubuntu22.04lts.rootfs.tar.gz' $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne '1483cc5c1dce13064f774834cbffdff226559fd522a67a381a8ea77d63fb4109') {
	throw 'Ubuntu WSL rootfs SHA256 mismatch.'
}
$install = Join-Path $Root 'distro'
New-Item -ItemType Directory -Path $install | Out-Null
$importStartTime = Get-Date
$importOutput = & $wsl --import $Distribution $install $archive --version 2 2>&1
$importExitCode = $LASTEXITCODE
if ($importExitCode -ne 0) {
	$logDirectory = Join-Path $workspace '.build\logs\wsl-dev-container'
	New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
	$diagnosticsPath = Join-Path $logDirectory "import-$Distribution.log"
	@("WSL2 kernel installer exit code: $($installer.ExitCode)", "Import exit code: $importExitCode", 'Import output:') + @($importOutput | ForEach-Object { "$_" -replace "`0", '' }) |
		Tee-Object -FilePath $diagnosticsPath
	Write-WslDiagnostics $importStartTime $install | Tee-Object -FilePath $diagnosticsPath -Append
	throw "Explicit WSL2 import failed with exit code $importExitCode. WSL1 is not supported by this test."
}
$importOutput | ForEach-Object { Write-Host ("$_" -replace "`0", '') }
Invoke-Wsl 'uname -a; cat /etc/os-release'

# The frontend is built from this PR; the unchanged backend uses a pinned published server.
$serverCommit = '046944034292b5479b4e9a50ad1a508033ffb64f'
$metadata = Invoke-RestMethod "https://update.code.visualstudio.com/api/versions/commit:$serverCommit/server-linux-x64/insider"
if (-not $metadata.url -or $metadata.sha256hash -notmatch '^[0-9a-fA-F]{64}$') {
	throw 'The pinned Linux server download metadata is incomplete.'
}
$serverArchive = Join-Path $Root 'server.tar.gz'
Save-Download $metadata.url $serverArchive
if ((Get-FileHash -LiteralPath $serverArchive -Algorithm SHA256).Hash -ne $metadata.sha256hash) {
	throw 'Linux server SHA256 mismatch.'
}
$linuxArchive = (& $wsl --distribution $Distribution --exec wslpath -u $serverArchive).Trim()
if ($LASTEXITCODE -ne 0 -or $linuxArchive -notmatch '^/mnt/[a-z]/[a-zA-Z0-9/_.-]+$') {
	throw 'Cannot safely resolve the Linux server archive path.'
}
Invoke-Wsl @"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git iproute2 procps docker.io libatomic1 libkrb5-3
mkdir -p /opt/vscode-smoke-server
tar -xzf '$linuxArchive' --strip-components=1 -C /opt/vscode-smoke-server
/opt/vscode-smoke-server/node --version
test -f /opt/vscode-smoke-server/out/bootstrap-fork.js
useradd --create-home --shell /bin/bash vscode-smoke
usermod -aG docker vscode-smoke
printf '[user]\ndefault=vscode-smoke\n' > /etc/wsl.conf
"@
& $wsl --terminate $Distribution
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to restart the owned distribution to apply its non-root default user.'
}
# The inbox WSL2 kernel lacks the nftables matches needed by Docker's bridge.
Invoke-Wsl @"
update-alternatives --set iptables /usr/sbin/iptables-legacy
update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy
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
docker pull mcr.microsoft.com/devcontainers/base:ubuntu-24.04
mkdir -p /tmp/vscode-smoke-bind-check
printf smoke > /tmp/vscode-smoke-bind-check/marker
docker run --rm --mount type=bind,source=/tmp/vscode-smoke-bind-check,target=/check mcr.microsoft.com/devcontainers/base:ubuntu-24.04 sh -c 'test "`$(cat /check/marker)" = smoke'
rm /tmp/vscode-smoke-bind-check/marker
rmdir /tmp/vscode-smoke-bind-check
"@
& $wsl --distribution $Distribution --exec /bin/sh -ec 'test "$(id -u)" -ne 0; docker info --format "{{.OSType}}"'
if ($LASTEXITCODE -ne 0) {
	throw 'The default WSL smoke user cannot access Docker.'
}
$addresses = & $wsl --distribution $Distribution --exec hostname -I
if ($LASTEXITCODE -ne 0) {
	throw 'Cannot determine the WSL guest address for mock-server access.'
}
$guestAddress = ($addresses.Trim() -split '\s+')[0]
if ($guestAddress -notmatch '^\d+\.\d+\.\d+\.\d+$') {
	throw "Unexpected WSL guest address: $guestAddress"
}
New-NetFirewallRule -Name $Distribution -DisplayName $Distribution -Direction Inbound -Action Allow -Protocol TCP -RemoteAddress $guestAddress | Out-Null
Write-SmokeOutput 'serverPath' '/opt/vscode-smoke-server'
Write-Host "WSL Docker is ready in $Distribution with Linux server $serverCommit."
