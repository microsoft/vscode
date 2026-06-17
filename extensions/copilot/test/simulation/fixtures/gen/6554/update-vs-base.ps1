# Clean up old runs
if (Test-Path -Path "src/vs/temp") {
  Remove-Item -Recurse -Force "src/vs/temp"
}

# Clone full vscode repo
$null = New-Item -ItemType Directory -Path "src/vs/temp" -Force
git clone https://github.com/microsoft/vscode src/vs/temp

# Delete old base
Remove-Item -Recurse -Force "src/vs/base"

# Copy base
