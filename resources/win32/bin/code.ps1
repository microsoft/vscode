$env:VSCODE_DEV = ''
$env:ELECTRON_RUN_AS_NODE = '1'
& "$PSScriptRoot\..\@@NAME@@.exe" "$PSScriptRoot\..\resources\app\out\cli.js" @args | Write-Output