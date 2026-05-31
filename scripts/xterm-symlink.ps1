<#
.SYNOPSIS
    Symlinks ./node_modules/xterm to provided $XtermFolder.
#>

Param(
	[Parameter(Mandatory=$True)]
	$XtermFolder
)

$TargetFolder = "./node_modules/@xterm/xterm"

if (Test-Path $TargetFolder -PathType Container)
{
	Write-Host -ForegroundColor Green ":: Deleting $TargetFolder`n"
	Remove-Item -Path $TargetFolder
}

if (Test-Path $XtermFolder -PathType Container)
{
	Write-Host -ForegroundColor Green "`n:: Creating symlink $TargetFolder -> $XtermFolder`n"
	New-Item -Path $TargetFolder -ItemType SymbolicLink -Value $XtermFolder

	Write-Host -ForegroundColor Green "`n:: Packaging xterm.js`n"
	Set-Location $TargetFolder
	yarn package -- --mode development
	Set-Location -

	Write-Host -ForegroundColor Green "`n:: Finished! To watch changes, open the VS Code terminal in the xterm.js repo and run:`n`n    yarn package -- --mode development --watch"
}
else
{
	Write-Error -ForegroundColor Red "`n:: $XtermFolder is not a valid folder"
}
