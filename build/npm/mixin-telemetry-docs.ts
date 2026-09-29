/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { existsSync, rmSync } from 'fs';

const rootPath = resolve(import.meta.dirname, '..', '..');
const telemetryDocsPath = join(rootPath, 'vscode-telemetry-docs');
const repoUrl = 'https://github.com/microsoft/vscode-telemetry-docs';

console.log('Cloning vscode-telemetry-docs repository...');

// Remove existing directory if it exists
if (existsSync(telemetryDocsPath)) {
	console.log('Removing existing vscode-telemetry-docs directory...');
	rmSync(telemetryDocsPath, { recursive: true, force: true });
}

try {
	// Clone the repository (shallow clone of main branch only)
	console.log(`Cloning ${repoUrl} to ${telemetryDocsPath}...`);
	execSync(`git clone --depth 1 --branch main --single-branch ${repoUrl} vscode-telemetry-docs`, {
		cwd: rootPath,
		stdio: 'inherit'
	});

	console.log('Successfully cloned vscode-telemetry-docs repository.');
} catch (error) {
	console.error('Failed to clone vscode-telemetry-docs repository:', (error as Error).message);
	process.exit(1);
}
