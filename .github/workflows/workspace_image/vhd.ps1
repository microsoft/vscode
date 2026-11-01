# Attaches the VHDX of a workspace image and mounts its volume at a folder, or creates one (see
# README.md).
#
#   vhd.ps1 -Path C:\a\_temp\workspace-image.vhdx -Prepare [-WaitFor C:\a\_temp\workspace-image.vhdx.ready -MountFolder C:\a\vscode [-CachedIo] [-Trust]]
#   vhd.ps1 -Path C:\a\_temp\workspace-image.vhdx -MountFolder C:\a\vscode [-CachedIo] [-Trust]
#   vhd.ps1 -Path C:\a\_temp\workspace-image.vhdx -Create -MountFolder C:\a\vscode [-MaximumSizeGB 200] [-BlockSizeMB 1]
#   vhd.ps1 -Path C:\a\_temp\workspace-image.vhdx -MountFolder C:\a\vscode -Detach
#
# -Prepare creates the empty file that image.ts restores a VHDX into, as a temporary file, whose data
# Windows keeps in memory while it has enough instead of writing it to the disk. With -WaitFor, the
# same process then compiles the virtual disk API while image.ts restores the VHDX, and attaches it
# when image.ts creates the file that -WaitFor names, so that neither takes time of the job.
# Without another switch, attaches the VHDX with the virtual disk API (see Vhd.cs), and mounts its
# volume at the empty folder. -CachedIo opens the VHDX through the file system cache, so that the
# data of the temporary file is read from memory. -Trust trusts the Dev Drive of the VHDX on this
# machine, like a Dev Drive that it formats.
# -Create creates a Dev Drive in a new dynamic VHDX with blocks of 1 MB, and mounts it at the empty
# folder. -Detach flushes its volume, removes its mount point, which would be left dangling, and
# detaches it.
param(
	[Parameter(Mandatory = $true)]
	[string] $Path,
	[string] $MountFolder,
	[switch] $Prepare,
	[string] $WaitFor,
	[switch] $CachedIo,
	[switch] $Trust,
	[switch] $Create,
	[switch] $Detach,
	[int] $MaximumSizeGB = 200,
	[int] $BlockSizeMB = 1
)

$ErrorActionPreference = 'Stop'
$watch = [Diagnostics.Stopwatch]::StartNew()
function Step([string] $name) {
	Write-Output ("{0,8:N3}s  {1}" -f $watch.Elapsed.TotalSeconds, $name)
}

function Import-Vhd {
	$source = Join-Path $PSScriptRoot 'Vhd.cs'
	$hash = (Get-FileHash -Algorithm SHA256 $source).Hash.Substring(0, 16)
	$dll = Join-Path ([IO.Path]::GetTempPath()) "workspace-image-vhd-$hash.dll"
	if (-not (Test-Path $dll)) {
		$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
		& $csc /nologo /target:library /optimize+ "/out:$dll" $source | Out-Host
		if ($LASTEXITCODE -ne 0) { throw "csc exited with $LASTEXITCODE" }
		Step 'compiled Vhd.cs'
	}
	Add-Type -Path $dll
	Step 'loaded the virtual disk API'
}

if ($Prepare) {
	# Created under another name, so that the file appears with its attribute
	New-Item -ItemType File -Path "$Path.new" -Force | Out-Null
	(Get-Item "$Path.new").Attributes = 'Temporary'
	Move-Item -Force "$Path.new" $Path
	Step "prepared $Path"
	if (-not $WaitFor) { return }
}

if ($Detach) {
	Get-DiskImage -ImagePath $Path | Get-Disk | Get-Partition | Get-Volume | Write-VolumeCache
	Step 'flushed the volume'
	if ($MountFolder) {
		mountvol "$($MountFolder.TrimEnd('\'))\" /D
		if ($LASTEXITCODE -ne 0) { throw "mountvol exited with $LASTEXITCODE" }
		Step "unmounted $MountFolder"
	}
	Dismount-DiskImage -ImagePath $Path | Out-Null
	Step "detached $Path"
	return
}

if (-not $MountFolder) { throw 'Missing -MountFolder' }
$folder = "$($MountFolder.TrimEnd('\'))\"
Import-Vhd

if ($Create) {
	[WorkspaceImageVhd]::Create($Path, [uint64]$MaximumSizeGB * 1GB, [uint32]$BlockSizeMB * 1MB)
	Step "created $Path, $MaximumSizeGB GB in blocks of $BlockSizeMB MB"
	$script = Join-Path ([IO.Path]::GetTempPath()) 'workspace-image-diskpart.txt'
	@("select vdisk file=`"$Path`"", 'attach vdisk', 'create partition primary', 'assign letter=W') | Set-Content $script
	diskpart /s $script | Out-Host
	if ($LASTEXITCODE -ne 0) { throw "diskpart exited with $LASTEXITCODE" }
	Format-Volume -DriveLetter W -DevDrive -Confirm:$false -Force | Out-Host
	Add-PartitionAccessPath -DriveLetter W -AccessPath $folder
	# Without a drive letter, the native realpath of the files stays under the folder
	Remove-PartitionAccessPath -DriveLetter W -AccessPath 'W:\'
	Step "formatted a Dev Drive and mounted it at $MountFolder"
	fsutil devdrv query $MountFolder | Out-Host
	return
}

if ($WaitFor) {
	$deadline = (Get-Date).AddMinutes(10)
	while (-not (Test-Path $WaitFor)) {
		if ((Get-Date) -gt $deadline) { throw "No $WaitFor" }
		Start-Sleep -Milliseconds 20
	}
	Step "found $WaitFor"
}

# OPEN_VIRTUAL_DISK_FLAG_CACHED_IO, then without it
$attempts = @()
if ($CachedIo) { $attempts += 0x8 }
$attempts += 0x0
$disk = -1
foreach ($flags in $attempts) {
	$result = [WorkspaceImageVhd]::TryAttach($Path, [uint32]$flags, [ref]$disk)
	Step ("open flags 0x{0:x}: {1}" -f $flags, $(if ($result -eq 0) { "attached as disk $disk" } else { "error $result" }))
	if ($result -eq 0) { break }
}
if ($disk -lt 0) { throw 'The VHDX did not attach' }
$volume = [WorkspaceImageVhd]::WaitForVolume($disk, 60000)
Step "found volume $volume"
[WorkspaceImageVhd]::Mount($folder, $volume)
Step "mounted it at $MountFolder"
if ($Trust) {
	fsutil devdrv trust $MountFolder | Out-Host
	Step 'trusted the Dev Drive'
}
