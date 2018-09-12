@ECHO OFF
REM
REM Do not run this file at it's own. The Build.cmd in the same folder will call this file.
REM

IF EXIST "%1" = "" goto failed
IF EXIST "%2" = "" goto failed

SET CULTURE=%1
SET LANGID=%2

SET LANGIDS=%LANGIDS%,%LANGID%

ECHO Building setup translation for culture "%1" with LangID "%2"...
REM -dWixUILicenseRtf overrides the license file to current language.
"%WIX%bin\light.exe" code.wixobj Files-!OUTPUT_BASE_FILENAME!.wixobj -ext WixUIExtension -ext WixUtilExtension -spdb -out "ReleaseDir\!OUTPUT_BASE_FILENAME!.!CULTURE!.msi" -loc "Lang\%PRODUCT_SKU%.!CULTURE!.wxl" -dWixUILicenseRtf="!SETUP_RESOURCES_DIR!\licenses\license.!CULTURE!.rtf" -cultures:!CULTURE! -sice:ICE60 -sice:ICE69
cscript "%ProgramFiles(x86)%\Windows Kits\%WIN_SDK_VERSION%\bin\x64\WiLangId.vbs" ReleaseDir\!OUTPUT_BASE_FILENAME!.!CULTURE!.msi Product %LANGID%
"%ProgramFiles(x86)%\Windows Kits\%WIN_SDK_VERSION%\bin\x86\msitran" -g "ReleaseDir\!OUTPUT_BASE_FILENAME!.msi" "ReleaseDir\!OUTPUT_BASE_FILENAME!.!CULTURE!.msi" "ReleaseDir\!CULTURE!.mst"
cscript "%ProgramFiles(x86)%\Windows Kits\%WIN_SDK_VERSION%\bin\x64\wisubstg.vbs" ReleaseDir\!OUTPUT_BASE_FILENAME!.msi ReleaseDir\!CULTURE!.mst %LANGID%
cscript "%ProgramFiles(x86)%\Windows Kits\%WIN_SDK_VERSION%\bin\x64\wisubstg.vbs" ReleaseDir\!OUTPUT_BASE_FILENAME!.msi

del /Q "ReleaseDir\!OUTPUT_BASE_FILENAME!.!CULTURE!.msi"
del /Q "ReleaseDir\!CULTURE!.mst"
goto exit

:failed
ECHO Failed to generate setup translation of culture "%1" with LangID "%2".

:exit