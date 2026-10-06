/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import { ensureElectronTypes } from './electronTypes.ts';
import { root, isUpToDate, forceInstallMessage } from './installStateHash.ts';
import { prepareCloudSandbox, finishCloudSandbox } from './cloudSandbox.ts';

const cloudSandbox = prepareCloudSandbox();

if (!process.argv.includes('--force') && isUpToDate()) {
	// Mirror postinstall.ts, which restores the
	// Electron typings even when dependencies are
	// up to date.
	await ensureElectronTypes();
	finishCloudSandbox();

	console.log(`\x1b[32mAll dependencies up to date.\x1b[0m ${forceInstallMessage}`);
	process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (cloudSandbox) {
	// npm may build native dependencies before root preinstall. Prepare their headers first.
	child_process.execFileSync(process.execPath, ['build/npm/preinstall.ts'], {
		cwd: root,
		stdio: 'inherit',
		env: { ...process.env, npm_command: 'ci', VSCODE_FORCE_INSTALL: '1' },
	});
}
const result = child_process.spawnSync(npm, ['install'], {
	cwd: root,
	stdio: 'inherit',
	shell: true,
	env: { ...process.env, VSCODE_FORCE_INSTALL: '1' },
});

process.exit(result.status ?? 1);
