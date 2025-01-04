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

    Create-SymLink

    Set-Location .\extensions\pearai-submodule

    # Checkout main - because submodule update leaves detached head.
    Write-Host "`nSetting the submodule directory to match origin/main's latest changes..." -ForegroundColor White
    Invoke-CMD -Command "git reset origin/main" -ErrorMessage "Failed to git reset to origin/main"
    Invoke-CMD -Command "git reset --hard" -ErrorMessage "Failed to reset --hard"
    Write-Host "`nChecking out the 'main' branch in submodule..." -ForegroundColor White
    Invoke-CMD -Command "git checkout main" -ErrorMessage "Failed to checkout the 'main' branch in the submodule"
    Invoke-CMD -Command "git fetch origin" -ErrorMessage "Failed to fetch latest changes from origin"
    Invoke-CMD -Command "git pull origin main" -ErrorMessage "Failed to pull latest changes from origin/main"


	$script = Join-Path -Path $modulePath -ChildPath 'scripts\install-and-build.ps1'
    Invoke-CMD -Command "powershell.exe -ExecutionPolicy Bypass -File $script" -ErrorMessage "Failed to install dependencies for the submodule"

    # Discard the package.json and package-lock.json version update changes     
    Invoke-CMD -Command "git reset --hard" -ErrorMessage "Failed to reset --hard after submodule dependencies install"

    Set-Location $currentDir

    Write-Host "`nSetting up root application..." -ForegroundColor White
    Invoke-CMD -Command "yarn install" -ErrorMessage "Failed to install dependencies with yarn"
}

function Create-SymLink {
    Write-Host "`nCreating symbolic link 'extensions\pearai-ref' -> 'extensions\pearai-submodule\extensions\vscode'" -ForegroundColor White
    Start-Process powershell.exe -Verb RunAs -ArgumentList ("-ExecutionPolicy Bypass ", "-Command", "powershell.exe -ExecutionPolicy Bypass -File '$createLinkScript' '$targetPath' '$linkPath'")
    Start-Sleep 1
}

# Setup all necessary paths for this script
$currentDir = Get-Location
$modulePath = Join-Path -Path $currentDir -ChildPath 'extensions\pearai-submodule'
$targetPath = Join-Path -Path $modulePath -ChildPath 'extensions\vscode'
$linkPath = Join-Path -Path $currentDir -ChildPath 'extensions\pearai-ref'
$createLinkScript = Join-Path -Path (Get-Item $MyInvocation.MyCommand.Path).Directory -ChildPath 'create-symlink.ps1'

# Run the base functionality
Initialize-BaseFunctionality
