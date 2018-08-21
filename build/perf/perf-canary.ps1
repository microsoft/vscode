param (
    [string]$OutDir = $PSScriptRoot,
    [string]$UpdateServer = "https://vscode-update.azurewebsites.net/api/update",
    [int]$Target = 2000
)

if ($IsMacOS) {
    $uri = "$UpdateServer/darwin/insider/unknown"
}
elseif ($IsWindows) {
    $uri = "$UpdateServer/win32-x64-archive/insider/unknown"
}
else {
    Write-Error "unsupported platform"
    Exit 100;
}

$request = Invoke-WebRequest -Uri $uri
$data = ConvertFrom-Json -InputObject $request.Content

$appdir = "$OutDir/versions/$($data.version)"
if (Test-Path -Path $appdir) {
    Write-Host "🌴 Nothing new, nothing to do..."
    Exit 0
}
else {
    # create foler, download, and unzip
    # * Expand-Archive breaks executable bits
    New-Item -ItemType Directory -Force -Path $appdir | Out-Null
    $zipfile = "$OutDir/$($data.version).zip";
    Invoke-WebRequest -Uri $data.url -OutFile $zipfile
    if ($IsWindows) {
        Expand-Archive -Path $zipfile -Force -DestinationPath $appdir
    }
    else {
        unzip -q $zipfile -d $appdir
    }
    Remove-Item -Path $zipfile
}

# lauch, read timer, and repeat
$currentTry = 1;
$maxTry = 100;
$timers = "$OutDir/startupInfo.txt"
$userdata = "$OutDir/userData";

while ($true) {
    if ($IsMacOS) {
        open "$appdir/Visual Studio Code - Insiders.app" -n -W --args --prof-append-timers $timers --user-data-dir $userdata --skip-getting-started --skip-release-notes --disable-extensions
    }
    elseif ($IsWindows) {
        Start-Process -FilePath "$appdir/Code - Insiders.exe" -ArgumentList "--prof-append-timers $timers --user-data-dir $userdata --skip-getting-started --skip-release-notes --disable-extensions" -Wait | Out-Null
    }
    else {
        Exit 100;
    }
    $line = Get-Content -Tail 1 $timers 
    $durLast = $line.Substring(0, 5);
    if ($durLast -lt $Target) {
        Write-Host "👍 good - last startup took $($durLast)ms, tried $currentTry times"
        Write-Host $line
        Exit 0
    }
    if ($1 -gt $maxTry) {
        Write-Host "💥 FAILURE - could not start within $($Target)ms, tried $maxTry-times!"
        Exit 1
    }
    Write-Host "🐌 too slow... took $($durLast)ms, target is $($Target)ms"
    Start-Sleep -s (Get-Random -Minimum 2 -Maximum 10)
    $currentTry += 1;
}
