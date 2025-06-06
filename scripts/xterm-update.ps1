$scriptPath = Join-Path $PSScriptRoot "xterm-update.js"
node $scriptPath (Get-Location)
