function PSConsoleHostReadLine
{
    [System.Diagnostics.DebuggerHidden()]
    param()

    ## Get the execution status of the last accepted user input.
    ## This needs to be done as the first thing because any script run will flush $?.
    $lastRunStatus = $?
    Microsoft.PowerShell.Core\Set-StrictMode -Off
    [Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($host.Runspace, $ExecutionContext, $lastRunStatus)
}

