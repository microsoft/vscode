#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const extensionRoot = __dirname;

function validateExtension() {
    console.log('🔍 Validating Hello World Extension...\n');

    // Check package.json
    const packageJsonPath = path.join(extensionRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        console.error('❌ package.json not found');
        return false;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log('✅ package.json found');
    console.log(`   - Name: ${packageJson.name}`);
    console.log(`   - Display Name: ${packageJson.displayName}`);
    console.log(`   - Version: ${packageJson.version}`);

    // Check activation events
    if (packageJson.activationEvents && packageJson.activationEvents.includes('onCommand:helloWorld.hello')) {
        console.log('✅ Activation event configured');
    } else {
        console.error('❌ Missing activation event');
        return false;
    }

    // Check commands
    if (packageJson.contributes && packageJson.contributes.commands) {
        const helloCommand = packageJson.contributes.commands.find(cmd => cmd.command === 'helloWorld.hello');
        if (helloCommand) {
            console.log('✅ Hello World command configured');
            console.log(`   - Command: ${helloCommand.command}`);
            console.log(`   - Title: ${helloCommand.title}`);
        } else {
            console.error('❌ Hello World command not found');
            return false;
        }
    } else {
        console.error('❌ No commands configured');
        return false;
    }

    // Check source file
    const mainSrcPath = path.join(extensionRoot, 'src', 'extension.ts');
    if (!fs.existsSync(mainSrcPath)) {
        console.error('❌ src/extension.ts not found');
        return false;
    }
    console.log('✅ Source file exists');

    // Check compiled output
    const mainOutPath = path.join(extensionRoot, 'out', 'extension.js');
    if (!fs.existsSync(mainOutPath)) {
        console.error('❌ Compiled output not found (run: npx tsc)');
        return false;
    }
    console.log('✅ Compiled output exists');

    // Check that compiled output contains the expected function
    const compiledContent = fs.readFileSync(mainOutPath, 'utf8');
    if (compiledContent.includes('helloWorld.hello') && compiledContent.includes('Hello World from VS Code!')) {
        console.log('✅ Compiled extension contains expected command and message');
    } else {
        console.error('❌ Compiled extension missing expected content');
        return false;
    }

    console.log('\n🎉 Hello World Extension validation passed!');
    console.log('\nTo test the extension:');
    console.log('1. Open VS Code development host');
    console.log('2. Open Command Palette (Ctrl+Shift+P)');
    console.log('3. Type "Hello World" and execute the command');
    console.log('4. You should see: "Hello World from VS Code!" message');

    return true;
}

if (require.main === module) {
    const success = validateExtension();
    process.exit(success ? 0 : 1);
}

module.exports = validateExtension;