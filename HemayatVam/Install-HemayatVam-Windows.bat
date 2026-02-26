@echo off
setlocal

cd /d "%~dp0"

echo ======================================
echo HemayatVam One-Click Windows Installer
echo ======================================

echo Running PowerShell installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\install-hemayatvam.ps1"

if errorlevel 1 (
  echo.
  echo Installation failed. Check the error message above.
  pause
  exit /b 1
)

echo.
echo Installation completed successfully.
pause
