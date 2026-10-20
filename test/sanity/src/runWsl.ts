/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Runs wsl.exe with a timeout so a hung WSL call cannot block the sanity test job until it is killed
// without logs. Exits with 0 on success and 1 on failure or timeout, since wsl.exe can exit with -1,
// which "if errorlevel 1" in batch files does not detect. Used by scripts/run-win32.cmd.
// Usage: node out/runWsl.js <wsl arguments...>

import { spawnSync } from 'child_process';

const timeoutMs = 5 * 60 * 1000;
const args = process.argv.slice(2);

const result = spawnSync('wsl.exe', args, { stdio: 'inherit', timeout: timeoutMs });
if (result.error) {
	console.error(`ERROR: wsl.exe ${args.join(' ')} failed: ${result.error.message}`);
	process.exit(1);
}

if (result.status !== 0) {
	console.error(`ERROR: wsl.exe ${args.join(' ')} exited with code ${result.status}`);
	process.exit(1);
}
