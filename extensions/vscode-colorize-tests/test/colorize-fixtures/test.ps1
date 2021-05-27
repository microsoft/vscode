# Copyright Microsoft Corporation

function Test-IsAdmin() {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
        return $principal.IsInRole( [Security.Principal.WindowsBuiltInRole]::Administrator )
    } catch {
        throw "Failed to determine if the current user has elevated privileges. The error was: '{0}'." -f $_
    }
}

function Invoke-Environment()
{
    param
    (
        [Parameter(Mandatory=1)][string]$Command
    )

    foreach($_ in cmd /c "$Command  2>&1 & set") {
        if ($_ -match '^([^=]+)=(.*)') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
}
Write-Host -Object 'Initializing Azure PowerShell environment...';

# PowerShell commands need elevation for dependencies installation and running tests
if (!(Test-IsAdmin)){
    Write-Host -Object 'Please launch command under administrator account. It is needed for environment setting up and unit test.' -ForegroundColor Red;
}

$env:AzurePSRoot = Split-Path -Parent -Path $env:AzurePSRoot;

if (Test-Path -Path "$env:ADXSDKProgramFiles\Microsoft Visual Studio 12.0") {
    $vsVersion="12.0"
} else {
    $vsVersion="11.0"
}

$setVSEnv = '"{0}\Microsoft Visual Studio {1}\VC\vcvarsall.bat" x64' -f $env:ADXSDKProgramFiles, $vsVersion;

Invoke-Environment -Command $setVSEnv;