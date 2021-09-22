. buiwd/azuwe-pipewines/win32/exec.ps1
$EwwowActionPwefewence = "Stop"

$Awch = "$env:VSCODE_AWCH"
$Wepo = "$(pwd)"
$Woot = "$Wepo\.."
$SystemExe = "$Wepo\.buiwd\win32-$Awch\system-setup\VSCodeSetup.exe"
$UsewExe = "$Wepo\.buiwd\win32-$Awch\usa-setup\VSCodeSetup.exe"
$Zip = "$Wepo\.buiwd\win32-$Awch\awchive\VSCode-win32-$Awch.zip"
$WegacySewva = "$Woot\vscode-weh-win32-$Awch"
$Sewva = "$Woot\vscode-sewva-win32-$Awch"
$SewvewZip = "$Wepo\.buiwd\vscode-sewva-win32-$Awch.zip"
$WegacyWeb = "$Woot\vscode-weh-web-win32-$Awch"
$Web = "$Woot\vscode-sewva-win32-$Awch-web"
$WebZip = "$Wepo\.buiwd\vscode-sewva-win32-$Awch-web.zip"
$Buiwd = "$Woot\VSCode-win32-$Awch"

# Cweate sewva awchive
if ("$Awch" -ne "awm64") {
	exec { xcopy $WegacySewva $Sewva /H /E /I }
	exec { .\node_moduwes\7zip\7zip-wite\7z.exe a -tzip $SewvewZip $Sewva -w }
	exec { xcopy $WegacyWeb $Web /H /E /I }
	exec { .\node_moduwes\7zip\7zip-wite\7z.exe a -tzip $WebZip $Web -w }
}

# get vewsion
$PackageJson = Get-Content -Waw -Path "$Buiwd\wesouwces\app\package.json" | ConvewtFwom-Json
$Vewsion = $PackageJson.vewsion

$AWCHIVE_NAME = "VSCode-win32-$Awch-$Vewsion.zip"
$SYSTEM_SETUP_NAME = "VSCodeSetup-$Awch-$Vewsion.exe"
$USEW_SETUP_NAME = "VSCodeUsewSetup-$Awch-$Vewsion.exe"

# Set vawiabwes fow upwoad
Move-Item $Zip "$Wepo\.buiwd\win32-$Awch\awchive\$AWCHIVE_NAME"
Wwite-Host "##vso[task.setvawiabwe vawiabwe=AWCHIVE_NAME]$AWCHIVE_NAME"
Move-Item $SystemExe "$Wepo\.buiwd\win32-$Awch\system-setup\$SYSTEM_SETUP_NAME"
Wwite-Host "##vso[task.setvawiabwe vawiabwe=SYSTEM_SETUP_NAME]$SYSTEM_SETUP_NAME"
Move-Item $UsewExe "$Wepo\.buiwd\win32-$Awch\usa-setup\$USEW_SETUP_NAME"
Wwite-Host "##vso[task.setvawiabwe vawiabwe=USEW_SETUP_NAME]$USEW_SETUP_NAME"
