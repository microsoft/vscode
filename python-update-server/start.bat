@echo off
REM Windows Startup Script for VS Code Update Server
REM Python 3.7 Compatible with SSL Workaround

echo ==================================
echo VS Code Update Server
echo ==================================

REM Check Python
python --version 2>nul
if errorlevel 1 (
    echo ERROR: Python not found
    echo Please install Python 3.7+ from https://www.python.org/
    pause
    exit /b 1
)

REM Show which Python is being used
echo.
echo Using Python from:
where python
echo.

REM Check if dependencies are installed
echo Checking dependencies...
python -c "import fastapi; print('FastAPI:', fastapi.__version__)" 2>nul
if errorlevel 1 (
    echo.
    echo FastAPI not found. Installing dependencies...
    echo This may take a few minutes...
    echo.

    REM For Python 3.7 with SSL issues, use trusted hosts
    echo Installing with SSL workaround for Python 3.7...
    pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org -r requirements.txt

    if errorlevel 1 (
        echo.
        echo ========================================
        echo Automatic installation failed!
        echo ========================================
        echo.
        echo Your Python 3.7 has SSL issues.
        echo.
        echo Please run the manual installer:
        echo   install-python37.bat
        echo.
        echo Or upgrade to Python 3.8+ for better support.
        echo.
        pause
        exit /b 1
    )

    echo.
    echo Dependencies installed successfully!
    echo.
) else (
    echo Dependencies OK
)

REM Create packages directory
if not exist "packages" mkdir packages

REM Check for product.json
if not exist "packages\product.json" (
    echo.
    echo WARNING: packages\product.json not found
    echo Please copy product.json to the packages directory
    echo.
)

echo ==================================
echo Starting server...
echo Server will run on http://localhost:8002
echo ==================================
echo.

REM Start server
python main.py

pause
