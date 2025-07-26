@echo off
REM Copyright (c) Microsoft Corporation. All rights reserved.
REM Licensed under the MIT License. See License.txt in the project root for license information.

echo 🔨 Building Hello World Extension...

cd /d "%~dp0"

echo 📝 Compiling TypeScript...
tsc src/extension.ts --outDir out --target es2020 --module commonjs --esModuleInterop --typeRoots ../../src/vscode-dts

if %errorlevel% equ 0 (
    echo ✅ TypeScript compilation successful
    
    echo 🔍 Running validation...
    node validate.js
    
    if %errorlevel% equ 0 (
        echo 🎉 Build completed successfully!
        echo.
        echo To test the extension:
        echo 1. Open VS Code in the repository root
        echo 2. Go to the Debug view (Ctrl+Shift+D)
        echo 3. Select 'Launch Hello World Extension' from the dropdown
        echo 4. Press F5 to start debugging
    ) else (
        echo ❌ Validation failed
        exit /b 1
    )
) else (
    echo ❌ TypeScript compilation failed
    exit /b 1
)