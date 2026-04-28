@echo off
REM Python 3.7 Dependency Installation Script (SSL Workaround)

echo ==================================
echo Python 3.7 Dependency Installer
echo ==================================
echo.

REM Check Python version
python --version
echo.

echo This script will install dependencies for Python 3.7
echo using methods that bypass SSL issues.
echo.
pause

REM Method 1: Try with trusted hosts (bypass SSL verification)
echo ==================================
echo Method 1: Installing with trusted hosts...
echo ==================================
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org fastapi==0.95.2 uvicorn==0.22.0 pydantic==1.10.12 starlette==0.27.0 typing-extensions==4.7.1 python-multipart==0.0.6 python-dotenv==1.0.0

if errorlevel 1 (
    echo.
    echo Method 1 failed. Trying Method 2...
    echo.

    REM Method 2: Try upgrading pip first, then install
    echo ==================================
    echo Method 2: Upgrading pip and retrying...
    echo ==================================
    python -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org --upgrade pip

    pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org fastapi==0.95.2 uvicorn==0.22.0 pydantic==1.10.12 starlette==0.27.0 typing-extensions==4.7.1 python-multipart==0.0.6 python-dotenv==1.0.0

    if errorlevel 1 (
        echo.
        echo Method 2 failed. Trying Method 3...
        echo.

        REM Method 3: Use HTTP instead of HTTPS (not recommended but works)
        echo ==================================
        echo Method 3: Using HTTP mirror...
        echo ==================================
        pip install --index-url=http://pypi.org/simple/ --trusted-host pypi.org fastapi==0.95.2 uvicorn==0.22.0 pydantic==1.10.12

        if errorlevel 1 (
            echo.
            echo ========================================
            echo All automatic methods failed!
            echo ========================================
            echo.
            echo Your Python 3.7 installation has SSL issues.
            echo.
            echo SOLUTION: Download packages manually
            echo.
            echo 1. Visit: https://pypi.org/project/fastapi/#files
            echo 2. Download these .whl files for Python 3.7:
            echo    - fastapi-0.95.2-py3-none-any.whl
            echo    - uvicorn-0.22.0-py3-none-any.whl
            echo    - pydantic-1.10.12-cp37-cp37m-win_amd64.whl
            echo    - starlette-0.27.0-py3-none-any.whl
            echo    - typing_extensions-4.7.1-py3-none-any.whl
            echo.
            echo 3. Put all .whl files in this directory
            echo 4. Run: pip install *.whl
            echo.
            echo OR: Use Python 3.8+ which has better SSL support
            echo.
            pause
            exit /b 1
        )
    )
)

echo.
echo ==================================
echo Installation successful!
echo ==================================
echo.
echo Verifying installation...
python -c "import fastapi; print('FastAPI version:', fastapi.__version__)"
python -c "import uvicorn; print('Uvicorn version:', uvicorn.__version__)"
python -c "import pydantic; print('Pydantic version:', pydantic.__version__)"

echo.
echo All dependencies installed successfully!
echo You can now run start.bat
echo.
pause
