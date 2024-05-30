# Function to execute a command and check its status
function Invoke-CMD {
    param (
        [Parameter(Mandatory=$true)]
        [string]$Command,
        [Parameter(Mandatory=$true)]
        [string]$ErrorMessage
    )

    & cmd /c $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Setup | $ErrorMessage" -ForegroundColor Red
        exit 1
    }
}

# Base functionality
function Initialize-BaseFunctionality {
    Write-Host "`nInitializing sub-modules..." -ForegroundColor White
    Invoke-CMD -Command "git submodule update --init --recursive" -ErrorMessage "Failed to initialize git submodules"

    Set-Location .\extensions\pearai-submodule

    Invoke-CMD -Command "git fetch origin" -ErrorMessage "Failed to fetch latest changes from origin"
    Invoke-CMD -Command "git pull origin main" -ErrorMessage "Failed to pull latest changes from origin/main"
    Invoke-CMD -Command "git checkout main" -ErrorMessage "Failed to checkout main branch"

	$script = Join-Path -Path $modulePath -ChildPath 'scripts\install-dependencies.ps1'
    Invoke-CMD -Command "powershell.exe -File $script" -ErrorMessage "Failed to install dependencies for the submodule"

    Set-Location $currentDir

    Write-Host "`nSetting up root application..." -ForegroundColor White
    Invoke-CMD -Command "yarn install" -ErrorMessage "Failed to install dependencies with yarn"
}

# Setup all necessary paths for this script
$currentDir = Get-Location
$modulePath = Join-Path -Path $currentDir -ChildPath 'extensions\pearai-submodule'
$targetPath = Join-Path -Path $modulePath -ChildPath 'extensions\vscode'
$linkPath = Join-Path -Path $currentDir -ChildPath 'extensions\pearai-ref'
$createLinkScript = Join-Path -Path (Get-Item $MyInvocation.MyCommand.Path).Directory -ChildPath 'create-symlink.ps1'

# Check if the symbolic link exists

if (-not (Test-Path $linkPath -PathType Any)) {
    Write-Host "`nCreating symbolic link 'extensions\pearai-submodule\extensions\vscode' -> 'extensions\pearai-extension'" -ForegroundColor White
    Start-Process powershell.exe -Verb RunAs -ArgumentList ("-Command", "powershell.exe -File '$createLinkScript' '$targetPath' '$linkPath'")
	Start-Sleep 1
}

# Run the base functionality
Initialize-BaseFunctionality
