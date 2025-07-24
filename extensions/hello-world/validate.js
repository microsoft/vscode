#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Simple validation script to check if the Hello World extension can be loaded
 */

const fs = require('fs');
const path = require('path');

// Check if the extension files exist
const extensionRoot = __dirname;
const packageJsonPath = path.join(extensionRoot, 'package.json');
const extensionJsPath = path.join(extensionRoot, 'out', 'extension.js');

console.log('Validating Hello World Extension...');

// Check package.json
if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ package.json not found');
    process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
console.log('✅ package.json exists');
console.log('   Name:', packageJson.name);
console.log('   Display Name:', packageJson.displayName);
console.log('   Version:', packageJson.version);

// Check compiled extension
if (!fs.existsSync(extensionJsPath)) {
    console.error('❌ Compiled extension not found at:', extensionJsPath);
    console.log('   Run "tsc" to compile the extension');
    process.exit(1);
}

console.log('✅ Compiled extension exists');

// Validate package.json structure
const requiredFields = ['name', 'displayName', 'version', 'engines', 'activationEvents', 'main', 'contributes'];
for (const field of requiredFields) {
    if (!packageJson[field]) {
        console.error(`❌ Missing required field in package.json: ${field}`);
        process.exit(1);
    }
}

console.log('✅ package.json has required fields');

// Check activation events
if (!packageJson.activationEvents.includes('onCommand:helloWorld.sayHello')) {
    console.error('❌ Missing expected activation event: onCommand:helloWorld.sayHello');
    process.exit(1);
}

console.log('✅ Activation events configured correctly');

// Check commands
const commands = packageJson.contributes.commands;
if (!commands || !Array.isArray(commands)) {
    console.error('❌ No commands defined in contributes section');
    process.exit(1);
}

const helloCommand = commands.find(cmd => cmd.command === 'helloWorld.sayHello');
if (!helloCommand) {
    console.error('❌ Hello World command not found in contributes.commands');
    process.exit(1);
}

console.log('✅ Commands configured correctly');
console.log('   Command:', helloCommand.command);
console.log('   Title:', helloCommand.title);

// Try to check the compiled extension structure (basic syntax check)
try {
    const extensionCode = fs.readFileSync(extensionJsPath, 'utf8');
    
    // Check if the code contains the expected exports
    if (!extensionCode.includes('exports.activate')) {
        console.error('❌ Extension does not export activate function');
        process.exit(1);
    }
    if (!extensionCode.includes('exports.deactivate')) {
        console.error('❌ Extension does not export deactivate function');
        process.exit(1);
    }
    
    // Check if it contains the expected VS Code API calls
    if (!extensionCode.includes('vscode.commands.registerCommand')) {
        console.error('❌ Extension does not register commands');
        process.exit(1);
    }
    if (!extensionCode.includes('vscode.window.showInformationMessage')) {
        console.error('❌ Extension does not show information message');
        process.exit(1);
    }
    
    console.log('✅ Extension exports activate and deactivate functions');
    console.log('✅ Extension registers commands and shows messages');
} catch (error) {
    console.error('❌ Error reading compiled extension:', error.message);
    process.exit(1);
}

console.log('\n🎉 Hello World Extension validation completed successfully!');
console.log('\nThe extension is ready to be loaded in VS Code.');
console.log('Use the Command Palette and run "Hello World" to test it.');