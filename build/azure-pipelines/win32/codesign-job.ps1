$ErrorActionPreference = "Stop"

# Find ESRP CLI
$EsrpCodeSigningTool = (gci -directory -filter EsrpCodeSigning_* $(Agent.RootDirectory)\_tasks | Select-Object -last 1).FullName
$Version = (gci -directory $EsrpCodeSigningTool | Select-Object -last 1).FullName
$EsrpCliDllPath = "$Version\net6.0\esrpcli.dll"

# Codesign executables and shared libraries
node build\azure-pipelines\common\sign $EsrpCliDllPath sign-windows $(CodeSigningFolderPath) '*.dll,*.exe,*.node'

# Codesign Powershell scripts
node build\azure-pipelines\common\sign $EsrpCliDllPath sign-windows-appx $(CodeSigningFolderPath) '*.ps1'
