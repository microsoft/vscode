# Ask the user if they want to continue
$response = Read-Host "Do you want to continue? (y/n)"

if ($response -match '^(y|Y)$') {
    Write-Output "Continuing..."
    # Place logic here for what should happen if yes
}
elseif ($response -match '^(n|N)$') {
    Write-Output "Exiting..."
    # Place logic here for what should happen if no
}
else {
    Write-Output "Invalid input. Please run the script again and enter y or n."
}
