Requirements for build environment:
===================================

1. Windows Installer XML (WiX) toolset, 3.11 or later, http://wixtoolset.org/

How to upgrade to a new VSCode Version:
========================================

1. Open "Build.cmd" with an Editor and change below version lines:

  - SET ProductMajorVersion=1
  - SET ProductMinorVersion=17
  - SET ProductMaintenanceVersion=2

2. Save latest version to a folder like:

  - "SourceDir\[ProductMajorVersion.ProductMinorVersion.ProductMaintenanceVersion]\x64"
  - "SourceDir\[ProductMajorVersion.ProductMinorVersion.ProductMaintenanceVersion]\x86"
  
  or 
  
  - Change "ReproDir" variable in build.cmd

3. Run "Build.cmd" to create the MSI setup in "ReleaseDir"
