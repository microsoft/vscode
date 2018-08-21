#


$quality = "stable"
$app = "Visual Studio Code.app"

$uri
if ($IsMacOS) {
    $uri = "https://vscode-update.azurewebsites.net/api/update/darwin/$quality/unknown"
}
elseif ($IsWindows) {
    $uri = "https://vscode-update.azurewebsites.net/api/update/win32-x64-archive/$quality/unknown"
}
else {
    Write-Error "unsupported platform"
    Exit 100;
}

$request = Invoke-WebRequest -Uri $uri
$data = ConvertFrom-Json -InputObject $request.Content

$appdir = "$PSScriptRoot/versions/$($data.version)"
if (Test-Path -Path $appdir) {
    Write-Host "🌴 Nothing new, nothing to do..."
    Exit 0
}
else {
    # create foler, download, and unzip
    # * Expand-Archive breaks executable bits
    New-Item -ItemType Directory -Force -Path $appdir | Out-Null
    $zipfile = "$PSScriptRoot/$($data.version).zip";
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
$durTarget = 1700;
$timers = "$PSScriptRoot/startupInfo.txt"
while ($true) {
    if ($IsMacOS) {
        open "$appdir/$app" -W --args --prof-append-timers $timers
    }
    elseif($IsWindows) {
        Start-Process -FilePath "$appdir/Code.exe" -ArgumentList "--prof-append-timers $timers" -Wait
    }
    else {
        Exit 100;
    }
    $line = Get-Content -Tail 1 $timers
    $durLast = $line.Substring(60, 4);
    # $durLast = $line.Substring(0, 5);
    if ($durLast -lt $durTarget) {
        Write-Host "👍 good - last startup took $($durLast)ms, tried $currentTry times"
        Write-Host $line
        Exit 0
    }
    if ($1 -gt $maxTry) {
        Write-Host "💥 FAILURE - could not start within $($durTarget)ms, tried $maxTry-times!"
        Exit 1
    }
    Write-Host "🐌 too slow... took $($durLast)ms, target is $($durTarget)ms"
    Start-Sleep -s (Get-Random -Minimum 2 -Maximum 10)
    $currentTry += 1;
}
