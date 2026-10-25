/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { timeout } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isCommit, relaunchInBackground } from '../../electron-main/relaunchInBackground.js';

(isWindows ? suite.skip : suite)('relaunchInBackground', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const oldCommit = '1111111111111111111111111111111111111111';
	const newCommit = '2222222222222222222222222222222222222222';

	async function exists(path: string): Promise<boolean> {
		try {
			await fs.access(path);
			return true;
		} catch {
			return false;
		}
	}

	test('launches the updated application without activating it once the process exited and the update is installed', async function () {
		this.timeout(20000);

		const root = await fs.mkdtemp(join(tmpdir(), 'vscode-relaunch-'));
		let relauncher: ChildProcess | undefined;
		try {
			const bundlePath = join(root, 'Code.app');
			const appRoot = join(bundlePath, 'Contents', 'Resources', 'app');
			const productJsonPath = join(appRoot, 'product.json');
			const openArgsPath = join(root, 'open-args');
			const openCommand = join(root, 'open');
			await fs.mkdir(appRoot, { recursive: true });
			await fs.writeFile(productJsonPath, JSON.stringify({ commit: oldCommit }));
			await fs.writeFile(openCommand, `#!/bin/sh\nprintf '%s\\n' "$@" > '${openArgsPath}'\n`, { mode: 0o755 });

			const quitting = spawn('/bin/sh', ['-c', 'sleep 0.5']);
			const quit = new Promise(resolve => quitting.once('exit', resolve));
			const currentRelauncher = relauncher = relaunchInBackground({ pid: quitting.pid!, commit: newCommit, appRoot, openCommand });
			const relaunched = new Promise(resolve => currentRelauncher.once('exit', resolve)); // the script runs `open` with `exec`

			await quit;
			await timeout(1500);
			const launchedBeforeInstall = currentRelauncher.exitCode !== null || await exists(openArgsPath);

			await fs.writeFile(productJsonPath, JSON.stringify({ commit: newCommit }));
			await relaunched;

			assert.deepStrictEqual({
				launchedBeforeInstall,
				openArgs: (await fs.readFile(openArgsPath, 'utf8')).trim().split('\n'),
			}, {
				launchedBeforeInstall: false,
				openArgs: ['-g', '-a', bundlePath, '--args', '--open-in-background'],
			});
		} finally {
			if (relauncher?.pid && relauncher.exitCode === null) {
				try {
					process.kill(relauncher.pid);
				} catch {
					// already exited
				}
			}
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('isCommit', () => {
		assert.deepStrictEqual([newCommit, 'abc1234', 'ABCDEF0', 'unknown', '', undefined, 'abc', `${newCommit}0`].map(isCommit), [true, true, true, false, false, false, false, false]);
	});
});
