Requirements for build environment:
===================================

1. Windows Installer XML (WiX) toolset, 3.11 or later, http://wixtoolset.org/releases/
2. Install "Windows SDK for Desktop C++ amd64 Apps" feature from Windows SDK 10 (https://developer.microsoft.com/en-us/windows/downloads/windows-10-sdk) for building multi-lingual setups.
3. Digital signature service if the MSI should be signed (optional). If you plan to sign the MSI, you need to install the Windows SDK 10 feature "Windows SDK Signing Tools for Desktops Apps".
4. For reviewing the MSI setup or creating custom MST transforms you can install feature "MSI Tools" from Windows SDK 10 (optional).


How to upgrade to a new VSCode Version:
========================================

1. Download latest per system ZIP packages named

  - VSCode-win32-ia32-[VERSION].zip
  - VSCode-win32-x64-[VERSION].zip

2. Extract the setup content.

  - "SourceDir\[PRODUCT_MAJOR_VERSION.PRODUCT_MINOR_VERSION.PRODUCT_MAINTENANCE_VERSION]\x64"
  - "SourceDir\[PRODUCT_MAJOR_VERSION.PRODUCT_MINOR_VERSION.PRODUCT_MAINTENANCE_VERSION]\x86"

  or 
  
  Use ".\ExtractSetups.ps1" to extract all setups found in SourceDir folder.

3. Edit Build.cmd and change below version lines:

  Example:
  SET PRODUCT_MAJOR_VERSION=1
  SET PRODUCT_MINOR_VERSION=28
  SET PRODUCT_MAINTENANCE_VERSION=2

  Configure available SDK version:
  SET WIN_SDK_MAJOR_VERSION=10
  SET WIN_SDK_FULL_VERSION=10.0.17763.0

4. Run "Build.cmd" to create the MSI setup in "ReleaseDir".

5. Deploy via Active Directory GPO.
