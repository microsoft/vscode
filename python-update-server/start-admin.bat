@echo off
chcp 65001 >nul
echo ========================================
echo   VS Code 更新服务 - 管理后台
echo ========================================
echo.
echo 正在启动服务...
echo.

cd /d "%~dp0"

python main.py

if errorlevel 1 (
    echo.
    echo [错误] 启动失败，请检查：
    echo   1. Python 是否已安装
    echo   2. 依赖是否已安装 (pip install -r requirements.txt)
    echo.
    pause
)
