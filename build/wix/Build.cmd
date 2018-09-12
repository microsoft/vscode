@ECHO OFF

REM Change version numbers here:
SET PRODUCT_MAJOR_VERSION=1
SET PRODUCT_MINOR_VERSION=18
SET PRODUCT_MAINTENANCE_VERSION=0

REM Configure available SDK version:
SET WIN_SDK_VERSION=8.1

REM
REM Nothing below this line need to be changed normally.
REM

SET PRODUCT_SKU=code
SET PRODUCT_VERSION=%PRODUCT_MAJOR_VERSION%.%PRODUCT_MINOR_VERSION%.%PRODUCT_MAINTENANCE_VERSION%

REM Generate one ID per release. But do NOT use * as we need to keep the same number for all languages and platforms.
SETLOCAL ENABLEDELAYEDEXPANSION
FOR /F %%G IN ('POWERSHELL -COMMAND "$([guid]::NewGuid().ToString('b').ToUpper())"') DO ( 
  SET PRODUCT_ID=%%G
)

REM Generate platform specific builds
FOR %%G IN (x64,x86) DO (
  ECHO Generate vscode setup for "%%G" platform
  ECHO ****************************************
  REM Cultures: https://msdn.microsoft.com/de-de/library/ee825488(v=cs.20).aspx
  SET CULTURE=en-us
  SET LANGIDS=1033
  SET PLATFORM=%%G
  SET SETUP_RESOURCES_DIR=.\Resources
  SET REPRO_DIR=.\SourceDir\!PRODUCT_VERSION!\!PLATFORM!
  SET OUTPUT_BASE_FILENAME=VSCodeSetup-!PLATFORM!-!PRODUCT_VERSION!
  
  "!WIX!bin\heat.exe" dir "!REPRO_DIR!" -out Files-!OUTPUT_BASE_FILENAME!.wxs -t code.xsl -gg -sfrag -scom -sreg -srd -ke -cg "AppFiles" -var var.ProductMajorVersion -var var.ProductMinorVersion -var var.ProductMaintenanceVersion -var var.ReproDir -dr APPLICATIONFOLDER -platform !PLATFORM!
  "!WIX!bin\candle.exe" -arch !PLATFORM! code.wxs Files-!OUTPUT_BASE_FILENAME!.wxs -ext WixUIExtension -ext WixUtilExtension -dProductMajorVersion="!PRODUCT_MAJOR_VERSION!" -dProductMinorVersion="!PRODUCT_MINOR_VERSION!" -dProductMaintenanceVersion="!PRODUCT_MAINTENANCE_VERSION!" -dProductId="!PRODUCT_ID!" -dReproDir="!REPRO_DIR!" -dSetupResourcesDir="!SETUP_RESOURCES_DIR!" -dCulture="!CULTURE!"
  "!WIX!bin\light.exe" code.wixobj Files-!OUTPUT_BASE_FILENAME!.wixobj -ext WixUIExtension -ext WixUtilExtension -out "ReleaseDir\!OUTPUT_BASE_FILENAME!.msi" -loc "Lang\!PRODUCT_SKU!.!CULTURE!.wxl" -dWixUILicenseRtf="!SETUP_RESOURCES_DIR!\licenses\license.!CULTURE!.rtf" -cultures:!CULTURE! -sice:ICE60 -sice:ICE69

  REM Generate setup translations
  CALL BuildSetupTranslationTransform.cmd de-de 1031
  CALL BuildSetupTranslationTransform.cmd es-es 3082
  CALL BuildSetupTranslationTransform.cmd fr-fr 1036
  CALL BuildSetupTranslationTransform.cmd it-it 1040
  CALL BuildSetupTranslationTransform.cmd ja-jp 1041
  CALL BuildSetupTranslationTransform.cmd ko-kr 1042
  CALL BuildSetupTranslationTransform.cmd ru-ru 1049
  CALL BuildSetupTranslationTransform.cmd zh-cn 2052
  CALL BuildSetupTranslationTransform.cmd zh-tw 1028

  REM Add all supported languages to MSI Package attribute
  CSCRIPT "%ProgramFiles(x86)%\Windows Kits\%WIN_SDK_VERSION%\bin\x64\WiLangId.vbs" ReleaseDir\!OUTPUT_BASE_FILENAME!.msi Package !LANGIDS!

  REM SIGN the MSI with digital signature
  REM signtool sign /sha1 CertificateHash "ReleaseDir\!OUTPUT_BASE_FILENAME!.msi"
)
ENDLOCAL

REM Cleanup variables
SET CULTURE=
SET LANGIDS=
SET PRODUCT_SKU=
SET WIN_SDK_VERSION=
SET PRODUCT_MAJOR_VERSION=
SET PRODUCT_MINOR_VERSION=
SET PRODUCT_MAINTENANCE_VERSION=
SET PRODUCT_ID=
SET PRODUCT_VERSION=
SET PLATFORM=
SET SETUP_RESOURCES_DIR=
SET REPRO_DIR=
SET OUTPUT_BASE_FILENAME=
