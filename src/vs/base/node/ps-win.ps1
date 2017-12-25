################################################################################################
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
################################################################################################

Param(
    [string]$ProcessName = "code.exe",
	[int]$MaxSamples = 10
)

$processLength = "process(".Length

function Get-MachineInfo {
	$model = (Get-WmiObject -Class Win32_Processor).Name
	$memory = (Get-WmiObject -Class Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum / 1MB
	$wmi_cs = Get-WmiObject -Class Win32_ComputerSystem
	return @{
		"type" = "machineInfo"
		"model" = $model
		"processors" = $wmi_cs.NumberOfProcessors
		"logicalProcessors" = $wmi_cs.NumberOfLogicalProcessors
		"totalMemory" = $memory

	}
}
$machineInfo = Get-MachineInfo

function Get-MachineState {
	$proc = Get-WmiObject Win32_Processor
	$os = Get-WmiObject win32_OperatingSystem
	return @{
		"type" = 'machineState'
		"cpuLoad" = $proc.LoadPercentage
		"handles" = (Get-Process | Measure-Object Handles -Sum).Sum
		"memory" = @{
			"total" = $os.TotalVisibleMemorySize
			"free" = $os.FreePhysicalMemory
			"swapTotal" = $os.TotalVirtualMemorySize
			"swapFree" = $os.FreeVirtualMemory
		}
	}
}
$machineState = Get-MachineState

$processId2CpuLoad = @{}
function Get-PerformanceCounters ($logicalProcessors) {
	$counterError
	# In a first round we get the performance counters and the process ids.
	$counters =  (Get-Counter ("\Process(*)\% Processor Time", "\Process(*)\ID Process") -ErrorAction SilentlyContinue).CounterSamples
	$processKey2Id = @{}
	foreach ($counter in $counters) {
		if ($counter.Status -ne 0) {
			continue
		}
		$path = $counter.path;
		$segments = $path.Split("\");
		$kind = $segments[4];
		$processKey = $segments[3].Substring($processLength, $segments[3].Length - $processLength - 1)
		if ($kind -eq "id process") {
			$processKey2Id[$processKey] = [uint32]$counter.CookedValue
		}
	}
	foreach ($counter in $counters) {
		if ($counter.Status -ne 0) {
			continue
		}
		$path = $counter.path;
		$segments = $path.Split("\");
		$kind = $segments[4];
		$processKey = $segments[3].Substring($processLength, $segments[3].Length - $processLength - 1)
		if ($kind -eq "% processor time") {
			$array = New-Object double[] ($MaxSamples + 1)
			$array[0] = ($counter.CookedValue / $logicalProcessors)
			$processId = $processKey2Id[$processKey]
			if ($processId) {
				$processId2CpuLoad[$processId] = $array
			}
		}
	}
	# Now lets sample another 10 times but only the processor time
	$samples = Get-Counter "\Process(*)\% Processor Time" -SampleInterval 1 -MaxSamples $MaxSamples -ErrorAction SilentlyContinue
	for ($s = 0; $s -lt $samples.Count; $s++) {
		$counters = $samples[$s].CounterSamples;
		foreach ($counter in $counters) {
			if ($counter.Status -ne 0) {
				continue
			}
			$path = $counter.path;
			$segments = $path.Split("\");
			$processKey = $segments[3].Substring($processLength, $segments[3].Length - $processLength - 1)
			$processKey = $processKey2Id[$processKey];
			if ($processKey) {
				$processId2CpuLoad[$processKey][$s + 1] = ($counter.CookedValue / $logicalProcessors)
			}
		}
	}
}
Get-PerformanceCounters -logicalProcessors $machineInfo.logicalProcessors

$topElements = New-Object PSObject[] $processId2CpuLoad.Keys.Count;
$index = 0;
foreach ($key in $processId2CpuLoad.Keys) {
	$obj = [PSCustomObject]@{
		ProcessId = $key
		Load = ($processId2CpuLoad[$key] | Measure-Object -Sum).Sum / ($MaxSamples + 1)
	}
	$topElements[$index] = $obj
	$index++
}
$topElements = $topElements | Sort-Object Load -Descending

# Get all code processes
$codeProcesses = @{}
foreach ($item in Get-WmiObject Win32_Process -Filter "name = '$ProcessName'") {
	$codeProcesses[$item.ProcessId] = $item
}
foreach ($item in Get-WmiObject Win32_Process -Filter "name = 'codeHelper.exe'") {
	$codeProcesses[$item.ProcessId] = $item
}
$otherProcesses = @{}
foreach ($item in Get-WmiObject Win32_Process -Filter "name Like '%'") {
	if (!($codeProcesses.Contains($item.ProcessId))) {
		$otherProcesses[$item.ProcessId] = $item
	}
}
$modified = $false
do {
	$toDelete = @()
	$modified = $false
	foreach ($item in $otherProcesses.Values) {
		if ($codeProcesses.Contains([uint32]$item.ParentProcessId)) {
			$codeProcesses[$item.ProcessId] = $item;
			$toDelete += $item
		}
	}
	foreach ($item in $toDelete) {
		$otherProcesses.Remove([uint32]$item.ProcessId)
		$modified = $true
	}
} while ($modified)

$result = New-Object PSObject[] (2 + [math]::Min(5, $topElements.Count) + $codeProcesses.Count)
$result[0] = $machineInfo
$result[1] = $machineState
$index = 2;
for($i = 0; $i -lt 5 -and $i -lt $topElements.Count; $i++) {
	$element = $topElements[$i]
	$item = $codeProcesses[[uint32]$element.ProcessId]
	if (!$item) {
		$item = $otherProcesses[[uint32]$element.ProcessId]
	}
	if ($item) {
		$cpuLoad = $processId2CpuLoad[[uint32]$item.ProcessId] | % { [pscustomobject] $_ }
		$result[$index] = [pscustomobject]@{
			"type" = "topProcess"
			"name"            = $item.Name
			"processId"       = $item.ProcessId
			"parentProcessId" = $item.ParentProcessId
			"commandLine"     = $item.CommandLine
			"handles"         = $item.HandleCount
			"cpuLoad"         = $cpuLoad
			"workingSetSize"  = $item.WorkingSetSize
		}
		$index++
	}
}
foreach ($item in $codeProcesses.Values) {
	# we need to convert this otherwise to JSON with create a value, count object and not an inline array
	$cpuLoad = $processId2CpuLoad[[uint32]$item.ProcessId] | % { [pscustomobject] $_ }
	$result[$index] = [pscustomobject]@{
		"type"            = "processInfo"
		"name"            = $item.Name
		"processId"       = $item.ProcessId
		"parentProcessId" = $item.ParentProcessId
		"commandLine"     = $item.CommandLine
		"handles"         = $item.HandleCount
		"cpuLoad"         = $cpuLoad
		"workingSetSize"  = $item.WorkingSetSize
	}
	$index++
}

$result | ConvertTo-Json -Depth 99
