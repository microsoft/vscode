/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This script installs the kernel-bridge from an adjacent directory,
 * following the same pattern as Positron's kallichore installation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

async function main() {
    console.log('Installing kernel-bridge...');

    // Look for kernel-bridge in adjacent directory (like Positron does with kallichore)
    // Path: extensions/erdos-supervisor/scripts -> extensions -> vscode -> GitHub -> kernel-bridge
    const extensionRoot = path.resolve(__dirname, '..');
    const extensionsRoot = path.resolve(extensionRoot, '..');
    const vscodeRoot = path.resolve(extensionsRoot, '..');
    const githubRoot = path.resolve(vscodeRoot, '..');
    const kernelBridgeDir = path.join(githubRoot, 'kernel-bridge');
    
    if (!fs.existsSync(kernelBridgeDir)) {
        throw new Error(`Kernel-bridge not found at ${kernelBridgeDir}. Please ensure kernel-bridge is in the same parent directory as vscode.`);
    }

    console.log(`Found kernel-bridge at ${kernelBridgeDir}`);

    // Build the kernel-bridge
    console.log('Building kernel-bridge...');
    execSync('npm install && npm run build', { 
        cwd: kernelBridgeDir, 
        stdio: 'inherit' 
    });

    // Create resources directory
    const resourcesDir = path.join(extensionRoot, 'resources', 'kernel-bridge');
    fs.mkdirSync(resourcesDir, { recursive: true });

    // Copy the built application
    const distSource = path.join(kernelBridgeDir, 'dist');
    const distTarget = path.join(resourcesDir, 'dist');
    
    // Remove existing dist directory if it exists
    if (fs.existsSync(distTarget)) {
        execSync(`rm -rf "${distTarget}"`, { stdio: 'inherit' });
    }
    
    execSync(`cp -r "${distSource}" "${distTarget}"`, { stdio: 'inherit' });

    // Copy package.json
    const packageSource = path.join(kernelBridgeDir, 'package.json');
    const packageTarget = path.join(resourcesDir, 'package.json');
    execSync(`cp "${packageSource}" "${packageTarget}"`, { stdio: 'inherit' });

    // Install production dependencies
    console.log('Installing production dependencies...');
    execSync('npm install --omit=dev', { 
        cwd: resourcesDir, 
        stdio: 'inherit' 
    });

    // Write version file
    const versionFile = path.join(resourcesDir, 'VERSION');
    fs.writeFileSync(versionFile, new Date().toISOString());

    console.log('Kernel-bridge installation completed successfully.');
}

main().catch((error) => {
    console.error('An error occurred:', error);
    process.exit(1);
});