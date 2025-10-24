@echo off
echo VSCode AI App Setup Script
echo ==========================

echo.
echo This script will help you set up the VSCode AI App.
echo.

echo Checking prerequisites...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js is installed
node --version

REM Check if npm is available
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not available
    pause
    exit /b 1
)

echo ✓ npm is available
npm --version

echo.
echo Installing dependencies...
echo This may take several minutes...
echo.

REM Install dependencies
npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies
    echo.
    echo This is likely due to missing Visual Studio Build Tools.
    echo Please install Visual Studio Build Tools from:
    echo https://visualstudio.microsoft.com/downloads/
    echo.
    echo Make sure to install the "Desktop development with C++" workload.
    echo.
    pause
    exit /b 1
)

echo.
echo ✓ Dependencies installed successfully
echo.

echo Compiling the project...
npm run compile
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to compile the project
    echo Please check the error messages above
    pause
    exit /b 1
)

echo.
echo ✓ Project compiled successfully
echo.

echo Setup completed successfully!
echo.
echo To run the AI App:
echo   npm run watch
echo.
echo To run in development mode:
echo   npm run watch-client
echo.
echo Don't forget to:
echo 1. Get an OpenAI API key from https://platform.openai.com/api-keys
echo 2. Enter it in the chat interface when you first run the app
echo.
pause
