#!/bin/bash

#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

echo "🔨 Building Hello World Extension..."

cd "$(dirname "$0")"

# Compile TypeScript
echo "📝 Compiling TypeScript..."
tsc src/extension.ts --outDir out --target es2020 --module commonjs --esModuleInterop --typeRoots ../../src/vscode-dts

if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
    
    # Run validation
    echo "🔍 Running validation..."
    node validate.js
    
    if [ $? -eq 0 ]; then
        echo "🎉 Build completed successfully!"
        echo ""
        echo "To test the extension:"
        echo "1. Open VS Code in the repository root"
        echo "2. Go to the Debug view (Ctrl+Shift+D / Cmd+Shift+D)"
        echo "3. Select 'Launch Hello World Extension' from the dropdown"
        echo "4. Press F5 to start debugging"
    else
        echo "❌ Validation failed"
        exit 1
    fi
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi