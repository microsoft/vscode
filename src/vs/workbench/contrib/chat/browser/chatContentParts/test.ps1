Write-Host "Need to install the following packages:`n ts-node@10.9.1 `n Ok to proceed? (y/n)"
$answer = Read-Host
if ($answer -eq 'y') {
	Write-Host "Installing..."
}
