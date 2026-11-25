# Installs a Node.js release from nodejs.org for the current Windows host and puts it on the
# PATH of later pipeline steps. Unlike UseNode@1, which has no per-download deadline, each
# attempt is bounded, so a stalled download is retried instead of using up the job timeout.
# A step timeout would not help: Azure Pipelines never retries a timed-out step.
param(
	[Parameter(Mandatory = $true)][string]$Version,
	[Parameter(Mandatory = $true)][string]$InstallDir
)
$ErrorActionPreference = 'Stop'

$Attempts = if ($env:NODE_DOWNLOAD_ATTEMPTS) { [int]$env:NODE_DOWNLOAD_ATTEMPTS } else { 4 }
$MaxTime = if ($env:NODE_DOWNLOAD_MAX_TIME) { $env:NODE_DOWNLOAD_MAX_TIME } else { '180' }
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$Name = "node-v$Version-win-$Arch"
$BaseUrl = "https://nodejs.org/dist/v$Version"

# A cache restore may already have put the right version in place.
$NodeExe = Join-Path $InstallDir 'node.exe'
if ((Test-Path $NodeExe) -and ((& $NodeExe --version) -eq "v$Version")) {
	Write-Host "Using cached Node.js $Version from $InstallDir"
	Write-Host "##vso[task.prependpath]$InstallDir"
	exit 0
}

$WorkDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid())
New-Item -ItemType Directory -Path $WorkDir | Out-Null

function Get-File([string]$Url, [string]$OutFile) {
	# Abort an attempt that runs too long or makes no real progress for 30 s.
	$ErrorActionPreference = 'Continue'
	& curl.exe -fsSL --connect-timeout 20 --max-time $MaxTime --speed-limit 102400 --speed-time 30 -o $OutFile $Url
	return $LASTEXITCODE -eq 0
}

try {
	$Zip = Join-Path $WorkDir "$Name.zip"
	$Sums = Join-Path $WorkDir 'SHASUMS256.txt'
	for ($Attempt = 1; $Attempt -le $Attempts; $Attempt++) {
		if ((Get-File "$BaseUrl/SHASUMS256.txt" $Sums) -and (Get-File "$BaseUrl/$Name.zip" $Zip)) {
			$Line = Select-String -Path $Sums -Pattern " $([regex]::Escape("$Name.zip"))$" | Select-Object -First 1
			$Expected = if ($Line) { $Line.Line.Split(' ')[0] } else { '' }
			$Actual = (Get-FileHash -Algorithm SHA256 $Zip).Hash.ToLowerInvariant()
			if ($Expected -and $Expected -eq $Actual) {
				break
			}
			Write-Host "##[warning]Checksum mismatch for $Name.zip (expected '$Expected', got '$Actual')"
		} else {
			Write-Host "##[warning]Downloading Node.js $Version failed (attempt $Attempt of $Attempts)"
		}
		if ($Attempt -eq $Attempts) {
			Write-Host "##[error]Could not download Node.js $Version from $BaseUrl after $Attempts attempts"
			exit 1
		}
		Start-Sleep -Seconds ($Attempt * 10)
	}

	if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
	New-Item -ItemType Directory -Path $InstallDir | Out-Null
	& tar.exe -xf $Zip -C $InstallDir --strip-components=1
	if ($LASTEXITCODE -ne 0) { throw "Extracting $Name.zip failed" }
	Write-Host "##vso[task.prependpath]$InstallDir"
	& (Join-Path $InstallDir 'node.exe') --version
} finally {
	Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
}
