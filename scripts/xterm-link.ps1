<#
.SYNOPSIS
    Symlinks ./node_modules/xterm to provided $XtermFolder.
#>

Param(
	[Parameter(Mandatory=$True)]
	$XtermFolder
)

$TargetFolder = "./node_modules/xterm"

if (Test-Path $TargetFolder -PathType Container)
{
	Write-Host "Deleting $TargetFolder"
	Remove-Item -Path $TargetFolder
}

if (Test-Path $XtermFolder -PathType Container)
{
	Write-Host "Creating symlink $TargetFolder -> $XtermFolder"
	New-Item -Path $TargetFolder -ItemType SymbolicLink -Value $XtermFolder
}
else
{
	Write-Host "$XtermFolder is not a valid folder"
}
