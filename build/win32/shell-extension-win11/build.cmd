@echo off
:: build the handler dll and sparse package needed for context menu extension

:: Visual Studio 2019 Windows Desktop Development tools are required

set ARCH=X64
:: call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

:: set ARCH=X86
:: call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars32.bat"

mkdir Release
mkdir Release\sparse-pkg

:: replace placeholders with real values

powershell -Command "(gc handler\menuhandler.cpp) -replace '@@ROOT_KEY@@', '*\\shell\\VSCode' | Out-File -encoding ASCII Release\menuhandler.cpp"

powershell -Command "(gc sparse-pkg\AppxManifest.xml) -replace '@@NAME@@', 'code-oss' -replace '@@APPNAME@@', 'Code - OSS' | Out-File -encoding ASCII Release\sparse-pkg\AppxManifest.xml"

:: dependency preparation

powershell -Command "iwr https://www.nuget.org/api/v2/package/Microsoft.Windows.ImplementationLibrary/1.0.201120.3 -OutFile Release\wil.zip; Expand-Archive -Force -LiteralPath Release\wil.zip Release\WilUnzipped; cp -Force -r Release\WilUnzipped\include\wil Release"

copy ..\..\..\resources\win32\code_150x150.png Release\sparse-pkg\code.png

:: Command lines as called by msbuild.exe in building the SparsePackages/PhotoStoreContextMenu demo

cl.exe /c /Zi /nologo /W3 /WX- /diagnostics:column /sdl /Oi /GL /O2 /Oy- /D WIN32 /D NDEBUG /D _WINDOWS /D _USRDLL /D _WINDLL /D _UNICODE /D UNICODE /Gm- /EHsc /MD /GS /Gy /fp:precise /Zc:wchar_t /Zc:forScope /Zc:inline /permissive- /Fp"Release\menuhandler.pch" /Fo"Release\\" /Fd"Release\vc142.pdb" /external:W3 /Gd /TP /analyze- /FC /errorReport:queue "Release\menuhandler.cpp"

link.exe /ERRORREPORT:QUEUE /OUT:"Release\menuhandler.dll" /INCREMENTAL:NO /NOLOGO runtimeobject.lib kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib shlwapi.lib /DEF:"handler\Source.def" /MANIFEST /MANIFESTUAC:NO /manifest:embed /PDB:"Release\menuhandler.pdb" /SUBSYSTEM:WINDOWS /OPT:REF /OPT:ICF /LTCG:incremental /LTCGOUT:"Release\menuhandler.iobj" /TLBID:1 /DYNAMICBASE /NXCOMPAT /IMPLIB:"Release\menuhandler.lib" /MACHINE:%ARCH% /DLL "Release\menuhandler.obj"

MakeAppx.exe pack /d "Release\\sparse-pkg\\" /p "Release\code-sparse.appx" /nv

:: Sign the sparse package

MakeCert.exe /n "CN=localhost" /r /h 0 /eku "1.3.6.1.5.5.7.3.3,1.3.6.1.4.1.311.10.3.13" /e "12/31/2099" /sv "Release\Key.pvk" "Release\Key.cer"

Pvk2Pfx.exe /pvk "Release\Key.pvk" /spc "Release\Key.cer" /pfx "Release\Key.pfx"

SignTool.exe sign /fd SHA256 /a /f "Release\Key.pfx" "Release\code-sparse.appx"

:: These built files need to be copied to the installation package for setup.ps1 to use:
:: Release\menuhandler.dll, Release\Key.cer, Release\code-sparse.appx