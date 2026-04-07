#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#---------------------------------------------------------------------------------------------

function Show-Help {
    Write-Host "Usage: copilot-debug [--print] [--no-cache] [--save] [--help] <args...>"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  --print     Print the generated configuration without running it"
    Write-Host "  --no-cache  Generate a new configuration without checking the cache."
    Write-Host "  --save      Save the configuration to your launch.json."
    Write-Host "  --once      Exit after the debug session ends."
    Write-Host "  --help      Print this help."
}

$flagConfig = @{
    "--print" = $false
    "--no-cache" = $false
    "--help" = $false
    "--save" = $false
    "--once" = $false
}

$cmdArgs = $args
while ($cmdArgs.Length -gt 0 -and $flagConfig.ContainsKey($cmdArgs[0])) {
    $flagConfig[$cmdArgs[0]] = $true
    $cmdArgs = $cmdArgs[1..$cmdArgs.Length]
}

if ($cmdArgs.Length -eq 0 -or $flagConfig["--help"]) {
    Show-Help
    exit $([int]$flagConfig["--help"])
}

$pipeName = "copilot-dbg.$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$([System.Guid]::NewGuid().ToString('N')).sock"
$callbackUrl = "__CALLBACK_URL_PLACEHOLDER__"
$remoteCommand = "__REMOTE_COMMAND_PLACEHOLDER__"

$listener = [System.IO.Pipes.NamedPipeServerStream]::new($pipeName, [System.IO.Pipes.PipeDirection]::InOut, 1, [System.IO.Pipes.PipeTransmissionMode]::Byte, [System.IO.Pipes.PipeOptions]::Asynchronous)

function Watch-Client {
    param (
        [System.IO.Pipes.NamedPipeServerStream]$pipe,
        [string[]]$cmdArgs
    )

    $reader = [System.IO.StreamReader]::new($pipe)
    $writer = [System.IO.StreamWriter]::new($pipe)
    $writer.AutoFlush = $true

    $request = @{
        id = 0
        method = "start"
        params = @{
          cwd = (Get-Location).Path
          args = $cmdArgs
          forceNew = $flagConfig["--no-cache"]
          printOnly = $flagConfig["--print"]
          save = $flagConfig["--save"]
          once = $flagConfig["--once"]
      }
    }
    $writer.WriteLine((ConvertTo-Json -Compress $request))

    while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line) { break }

        try {
            $request = ConvertFrom-Json $line
        } catch {
            Write-Error "Failed to parse line: $line"
            continue
        }

        switch ($request.method) {
            "output" {
                $category = $request.params.category
                $output = $request.params.output
                if ($category -eq 'stderr') {
                    [Console]::Error.Write($output)
                } elseif ($category -eq 'stdout') {
                    [Console]::Out.Write($output)
                } elseif ($category -ne 'telemetry' -and $output) {
                    Write-Host $output
                }
                $response = @{
                    id = $request.id
                    result = $null
                }
                $writer.WriteLine((ConvertTo-Json -Compress $response))
            }
            "question" {
                $defaultValue = $request.params.defaultValue
                $message = $request.params.message
                if ($request.params.singleKey) {
                    Write-Host $message
                    $answer = [Console]::ReadKey($true).Key.ToString()
                } else {
                    $answer = Read-Host "$message$(if ($defaultValue) { " [$defaultValue]" } else { '' }) "
                }
                $response = @{
                    id = $request.id
                    result = $answer
                }
                $writer.WriteLine((ConvertTo-Json -Compress $response))
            }
            "confirm" {
                $message = $request.params.message
                $defaultValue = $request.params.defaultValue
                $answer = Read-Host "$message [$(if ($defaultValue) { 'Y/n' } else { 'y/N' })] "
                $response = @{
                    id = $request.id
                    result = if ($answer -eq '') { $defaultValue } else { $answer.ToLower().Substring(0, 1) -eq 'y' }
                }
                $writer.WriteLine((ConvertTo-Json -Compress $response))
            }
            "exit" {
              $code = $request.params.code
              $err = $request.params.error
              if ($err) {
                Write-Host "$err"
              }

              $response = @{
                id = $request.id
                result = $null
              }
              $writer.WriteLine((ConvertTo-Json -Compress $response))

              Exit $code
            }
        }
    }
}


if ($remoteCommand -eq "") {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c start `"`" `"$callbackUrl/$pipeName`"" -NoNewWindow
} else {
    $fullCommand = "$remoteCommand`"$callbackUrl/$pipeName`""
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $fullCommand" -NoNewWindow
}

$listener.WaitForConnection()
Watch-Client -pipe $listener -cmdArgs $cmdArgs
