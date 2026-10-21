# [experiment] DO NOT MERGE. Samples CPU, memory and disk usage every 2 seconds into
# <Directory>/counters.csv until the process is stopped.
param(
	[Parameter(Mandatory = $true)]
	[string]$Directory
)

$counters = @(
	'\Processor(_Total)\% Processor Time',
	'\System\Processor Queue Length',
	'\Memory\Available MBytes',
	'\PhysicalDisk(_Total)\% Idle Time',
	'\PhysicalDisk(_Total)\Avg. Disk Queue Length',
	'\PhysicalDisk(_Total)\Disk Bytes/sec'
)
$file = Join-Path $Directory 'counters.csv'

while ($true) {
	try {
		$samples = (Get-Counter -Counter $counters -SampleInterval 2 -MaxSamples 1 -ErrorAction Stop).CounterSamples
		$values = $samples | ForEach-Object { "$($_.Path.Split('\')[-1])=$([math]::Round($_.CookedValue, 1))" }
		"$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()),$($values -join ',')" | Add-Content $file
	} catch {
		"$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()),error=$($_.Exception.Message)" | Add-Content $file
		Start-Sleep -Seconds 2
	}
}
