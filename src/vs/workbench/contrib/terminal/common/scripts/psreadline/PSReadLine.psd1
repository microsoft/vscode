@{
RootModule = 'PSReadLine.psm1'
NestedModules = @("Microsoft.PowerShell.PSReadLine.dll")
ModuleVersion = '2.4.3'
GUID = '5714753b-2afd-4492-a5fd-01d9e2cff8b5'
Author = 'Microsoft Corporation'
CompanyName = 'Microsoft Corporation'
Copyright = '(c) Microsoft Corporation. All rights reserved.'
Description = 'Great command line editing in the PowerShell console host'
PowerShellVersion = '5.1'
FormatsToProcess = 'PSReadLine.format.ps1xml'
AliasesToExport = @()
FunctionsToExport = 'PSConsoleHostReadLine'
CmdletsToExport = 'Get-PSReadLineKeyHandler','Set-PSReadLineKeyHandler','Remove-PSReadLineKeyHandler',
                  'Get-PSReadLineOption','Set-PSReadLineOption'
HelpInfoURI = 'https://aka.ms/powershell75-help'
PrivateData = @{ PSData = @{ Prerelease = 'beta3'; ProjectUri = 'https://github.com/PowerShell/PSReadLine' } }
}

