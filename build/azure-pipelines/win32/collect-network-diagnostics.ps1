# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root.

[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$started = [DateTime]::UtcNow
$script:failedSections = @()
$maximumRecords = 64

function Write-JsonFile([string]$Name, $Value) {
	$json = ConvertTo-Json -InputObject $Value -Depth 10
	if ([System.Text.Encoding]::UTF8.GetByteCount($json) -gt 65536) {
		$error = [System.IO.InvalidDataException]::new('Diagnostic exceeded the 64 KiB limit.')
		$error.Data['NetworkDiagnosticReason'] = 'outputLimitExceeded'
		throw $error
	}
	[System.IO.File]::WriteAllText((Join-Path $OutputDirectory "$Name.json"), $json, [System.Text.UTF8Encoding]::new($false))
}

function Write-Diagnostic([string]$Name, [scriptblock]$Collect) {
	$record = [ordered]@{ capturedAt = [DateTime]::UtcNow.ToString('o'); status = 'complete' }
	try {
		$record.data = & $Collect
		Write-JsonFile $Name $record
	} catch {
		$script:failedSections += $Name
		# Exception messages can contain command arguments, file contents or credentials.
		$reason = 'collectionFailed'
		if ($_.Exception.Data['NetworkDiagnosticReason'] -in @('channelDisabled', 'outputLimitExceeded', 'notRegularDirectory')) {
			$reason = $_.Exception.Data['NetworkDiagnosticReason']
		} elseif ($_.Exception -is [System.UnauthorizedAccessException]) {
			$reason = 'accessDenied'
		} elseif ($_.Exception -is [System.Management.Automation.ItemNotFoundException]) {
			$reason = 'notFound'
		} elseif ($_.Exception -is [System.Management.Automation.CommandNotFoundException]) {
			$reason = 'commandNotFound'
		}
		$record = [ordered]@{
			capturedAt = $record.capturedAt
			status = 'unavailable'
			reason = $reason
			errorType = $_.Exception.GetType().Name
			errorCode = $_.Exception.HResult
		}
		Write-Host "##vso[task.logissue type=warning]Network diagnostic '$Name' is unavailable ($reason, $($record.errorType)); see the diagnostic artifact."
		Write-JsonFile $Name $record
	}
}

function Get-MatchingEvents([string]$LogName, [string]$Predicate) {
	$log = Get-WinEvent -ListLog $LogName -ErrorAction Stop
	if (-not $log.IsEnabled) {
		$error = [System.InvalidOperationException]::new('Event channel is disabled; collection does not enable it.')
		$error.Data['NetworkDiagnosticReason'] = 'channelDisabled'
		throw $error
	}
	try {
		Get-WinEvent -LogName $LogName -FilterXPath "*[System[TimeCreated[timediff(@SystemTime) <= 3600000]] and ($Predicate)]" -MaxEvents ($maximumRecords + 1) -ErrorAction Stop
	} catch {
		if ($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound,*') {
			throw
		}
	}
}

function Get-EventData($Event) {
	$xml = [xml]$Event.ToXml()
	$values = @{}
	foreach ($node in $xml.SelectNodes('/*[local-name()="Event"]/*[local-name()="EventData"]/*[local-name()="Data"]')) {
		$values[$node.GetAttribute('Name')] = $node.InnerText
	}
	return $values
}

function Get-NumericEventValue($Value) {
	if ($null -ne $Value -and $Value -match '^(?:0x)?[0-9a-fA-F]{1,16}$') {
		return [string]$Value
	}
	return $null
}

[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$capture = [ordered]@{
	schemaVersion = 1
	startedAt = $started.ToString('o')
	completed = $false
	eventLookbackMinutes = 60
	maximumRecordsPerSection = $maximumRecords
	context = [ordered]@{}
}
foreach ($name in @('BUILD_BUILDID', 'SYSTEM_JOBID', 'SYSTEM_JOBATTEMPT', 'AGENT_ID', 'AGENT_NAME', 'AGENT_MACHINENAME', 'AGENT_VERSION', 'ImageOS', 'ImageVersion')) {
	$value = [Environment]::GetEnvironmentVariable($name)
	$capture.context[$name] = if ($value -and $value -cmatch '^[A-Za-z0-9 ._()-]{1,128}$') { $value } else { $null }
}
Write-JsonFile 'capture' $capture
Write-Host '##vso[task.setvariable variable=VSCODE_NETWORK_DIAGNOSTICS_CAPTURED]true'

# Do not mistake evidence from an earlier invocation for sections interrupted in this one.
foreach ($section in @('listener', 'dns-servers', 'dns-udp-endpoints', 'dns-tcp-listeners', 'listener-crashes', 'dns-timeouts', 'dns-query-results', 'listener-log-inventory')) {
	Write-JsonFile $section ([ordered]@{ capturedAt = $started.ToString('o'); status = 'notCollected' })
}

Write-Diagnostic 'listener' {
	$processes = @(Get-Process -ErrorAction Stop | Where-Object ProcessName -EQ 'EtwNetworkEventListener' | Select-Object -First ($maximumRecords + 1))
	[ordered]@{
		truncated = $processes.Count -gt $maximumRecords
		processes = @($processes | Select-Object -First $maximumRecords | ForEach-Object {
			[ordered]@{ processId = $_.Id; startedAt = $_.StartTime.ToUniversalTime().ToString('o') }
		})
	}
}

Write-Diagnostic 'dns-servers' {
	$interfaces = @(Get-DnsClientServerAddress -ErrorAction Stop | Select-Object -First ($maximumRecords + 1))
	[ordered]@{
		truncated = $interfaces.Count -gt $maximumRecords
		interfaces = @($interfaces | Select-Object -First $maximumRecords | ForEach-Object {
			[ordered]@{
				interfaceIndex = $_.InterfaceIndex
				addressFamily = [int]$_.AddressFamily
				serverAddressesTruncated = @($_.ServerAddresses).Count -gt $maximumRecords
				serverAddresses = @($_.ServerAddresses | Select-Object -First $maximumRecords | ForEach-Object { [System.Net.IPAddress]::Parse($_).ToString() })
			}
		})
	}
}

Write-Diagnostic 'dns-udp-endpoints' {
	$endpoints = @(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object LocalPort -EQ 53 | Select-Object -First ($maximumRecords + 1))
	[ordered]@{
		truncated = $endpoints.Count -gt $maximumRecords
		endpoints = @($endpoints | Select-Object -First $maximumRecords | ForEach-Object {
			[ordered]@{ address = [System.Net.IPAddress]::Parse($_.LocalAddress).ToString(); port = 53; processId = $_.OwningProcess }
		})
	}
}

Write-Diagnostic 'dns-tcp-listeners' {
	$listeners = @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.LocalPort -eq 53 -and $_.State -eq 'Listen' } | Select-Object -First ($maximumRecords + 1))
	[ordered]@{
		truncated = $listeners.Count -gt $maximumRecords
		listeners = @($listeners | Select-Object -First $maximumRecords | ForEach-Object {
			[ordered]@{ address = [System.Net.IPAddress]::Parse($_.LocalAddress).ToString(); port = 53; processId = $_.OwningProcess }
		})
	}
}

Write-Diagnostic 'listener-crashes' {
	$events = @(Get-MatchingEvents 'Application' "(System[Provider[@Name='Application Error'] and EventID=1000] and EventData[Data[@Name='AppName']='EtwNetworkEventListener.exe']) or (System[Provider[@Name='Windows Error Reporting'] and EventID=1001] and EventData[Data[@Name='P1']='EtwNetworkEventListener.exe'])")
	[ordered]@{
		truncated = $events.Count -gt $maximumRecords
		events = @($events | Select-Object -First $maximumRecords | ForEach-Object {
			$data = Get-EventData $_
			[ordered]@{
				time = $_.TimeCreated.ToUniversalTime().ToString('o')
				eventId = $_.Id
				recordId = $_.RecordId
				processId = Get-NumericEventValue $data['ProcessId']
				exceptionCode = Get-NumericEventValue $data['ExceptionCode']
			}
		})
	}
}

foreach ($channel in @(
	@{ name = 'dns-timeouts'; log = 'System'; eventId = 1014 },
	@{ name = 'dns-query-results'; log = 'Microsoft-Windows-DNS-Client/Operational'; eventId = 3008 }
)) {
	Write-Diagnostic $channel.name {
		$events = @(Get-MatchingEvents $channel.log "System[Provider[@Name='Microsoft-Windows-DNS-Client'] and EventID=$($channel.eventId)] and EventData[Data[@Name='QueryName']='vsblob.dev.azure.com']")
		[ordered]@{
			truncated = $events.Count -gt $maximumRecords
			queryName = 'vsblob.dev.azure.com'
			events = @($events | Select-Object -First $maximumRecords | ForEach-Object {
				$data = Get-EventData $_
				[ordered]@{
					time = $_.TimeCreated.ToUniversalTime().ToString('o')
					eventId = $_.Id
					recordId = $_.RecordId
					clientProcessId = Get-NumericEventValue $data['ClientPID']
					queryType = Get-NumericEventValue $data['QueryType']
					queryStatus = Get-NumericEventValue $data['QueryStatus']
				}
			})
		}
	}
}

Write-Diagnostic 'listener-log-inventory' {
	$directory = Get-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'Temp\NetworkIsolation\Logs') -ErrorAction Stop
	if (-not $directory.PSIsContainer -or ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
		$error = [System.IO.InvalidDataException]::new('Listener log directory is not a regular directory.')
		$error.Data['NetworkDiagnosticReason'] = 'notRegularDirectory'
		throw $error
	}
	$files = @(Get-ChildItem -LiteralPath $directory.FullName -File -ErrorAction Stop | Select-Object -First ($maximumRecords + 1))
	[ordered]@{
		truncated = $files.Count -gt $maximumRecords
		contentsCollected = $false
		files = @($files | Select-Object -First $maximumRecords | ForEach-Object {
			[ordered]@{
				name = $_.Name
				bytes = $_.Length
				lastModifiedAt = $_.LastWriteTimeUtc.ToString('o')
				reparsePoint = [bool]($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
			}
		})
	}
}

$capture.completed = $true
$capture.finishedAt = [DateTime]::UtcNow.ToString('o')
$capture.unavailableSections = @($script:failedSections)
Write-JsonFile 'capture' $capture
if ($script:failedSections.Count -gt 0) {
	exit 1
}
