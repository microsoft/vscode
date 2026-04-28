@echo off
REM Anaconda Python Startup Script

echo ==================================
echo VS Code Update Server (Anaconda)
echo ==================================

REM Initialize Anaconda (adjust path if needed)
call D:\Anaconda\Scripts\activate.bat base

REM Check Python
python --version
if errorlevel 1 (
    echo ERROR: Python not found
    pause
    exit /b 1
)

echo.
echo Using Python from:
where python
echo.

REM Check dependencies
echo Checking dependencies...
python -c "import fastapi; print('FastAPI:', fastapi.__version__)" 2>nul
if errorlevel 1 (
    echo Installing dependencies...
    pip install fastapi uvicorn pydantic starlette typing-extensions python-multipart python-dotenv
)

REM Create packages directory
if not exist "packages" mkdir packages

REM Check for product.json
if not exist "packages\product.json" (
    echo.
    echo WARNING: packages\product.json not found
    echo.
)

echo ==================================
echo Starting server on http://localhost:8002
echo ==================================
echo.

REM Start server
python main.py

pause
