param (
	[string]$OutDir = $PSScriptRoot,
	[string]$UpdateServer = "https://vscode-update.azurewebsites.net/api/update",
	[string]$Slackbot,
	[int]$Target = 2000
)

function Write-Slack {
	param([string]$Message, [string]$Url)
	if (!$Slackbot) {
		Write-Host $Message
	}
 else {
		$params = @{"text" = $Message; }
		Invoke-WebRequest -Uri $Url -Method POST -Body ($params|ConvertTo-Json) -ContentType "application/json"
	}
}


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
	Write-Host "Nothing new, nothing to do..."
	# Exit 0
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
	(Get-Content -Tail 1 $timers) -match '^\d+' | Out-Null
	$durLast = [convert]::ToInt32($Matches[0], 10);
	if ($durLast -lt $Target) {
		Write-Slack -Message "SUCCESS - last startup took $($durLast)ms, tried $currentTry times" -Url $Slackbot
		Exit 0
	}
	if ($1 -gt $maxTry) {
		Write-Slack -Message "FAILURE - could not start within $($Target)ms, tried $maxTry-times!" -Url $Slackbot
		Exit 1
	}
	Write-Slack -Message "too slow... took $($durLast)ms, target is $($Target)ms" -Url $Slackbot
	Start-Sleep -s (Get-Random -Minimum 2 -Maximum 10)
	$currentTry += 1;
}
