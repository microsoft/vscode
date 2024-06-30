# Function to create the symbolic link
function Connect-Locations {
    param(
        [string]$targetPath,
        [string]$linkPath
    )

    if (Test-Path $linkPath -PathType Any) {
        Write-Host "Removing existing Symbolic link at '$linkPath', before creating new one."
        cmd /c rmdir /s /q $linkPath
    }

    Start-Sleep 1

    Write-Host "Creating symbolic link '$targetPath' -> '$linkPath'"
    New-Item -ItemType SymbolicLink -Path $linkPath -Target $targetPath
}

# Get the target and link paths from script parameters
$targetPath = $args[0]
$linkPath = $args[1]

# Call the function to create the symbolic link
Connect-Locations -targetPath $targetPath -linkPath $linkPath
