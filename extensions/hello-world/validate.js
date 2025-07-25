#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Hello World Extension...');

const extensionDir = path.join(__dirname);
const packageJsonPath = path.join(extensionDir, 'package.json');
const outDir = path.join(extensionDir, 'out');
const extensionJsPath = path.join(outDir, 'extension.js');

// Check if package.json exists and is valid
try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log('✅ package.json is valid');
    console.log(`   - Name: ${packageJson.name}`);
    console.log(`   - Version: ${packageJson.version}`);
    console.log(`   - Commands: ${packageJson.contributes?.commands?.length || 0}`);
} catch (error) {
    console.log('❌ package.json is invalid:', error.message);
    process.exit(1);
}

// Check if compiled output exists
if (fs.existsSync(extensionJsPath)) {
    console.log('✅ extension.js compiled successfully');
    
    // Basic validation of the compiled JavaScript
    const jsContent = fs.readFileSync(extensionJsPath, 'utf8');
    if (jsContent.includes('activate') && jsContent.includes('deactivate')) {
        console.log('✅ extension.js contains required activate/deactivate functions');
    } else {
        console.log('❌ extension.js missing required functions');
        process.exit(1);
    }
    
    if (jsContent.includes('hello-world.helloWorld') && jsContent.includes('hello-world.showWorkspaceInfo')) {
        console.log('✅ extension.js contains expected commands');
    } else {
        console.log('❌ extension.js missing expected commands');
        process.exit(1);
    }
} else {
    console.log('❌ extension.js not found - compilation may have failed');
    process.exit(1);
}

console.log('🎉 Hello World Extension validation passed!');
console.log('');
console.log('To use this extension in VS Code development:');
console.log('1. Open VS Code from the repository root');
console.log('2. Press F5 to launch Extension Development Host');
console.log('3. In the new window, press Ctrl+Shift+P (Cmd+Shift+P on Mac)');
console.log('4. Type "Hello" to see the commands');
console.log('5. Try "Hello: Hello World" or "Hello: Show Workspace Info"');