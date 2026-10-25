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

	function kill(process: ChildProcess | undefined): void {
		if (process?.pid && process.exitCode === null) {
			try {
				process.kill();
			} catch {
				// already exited
			}
		}
	}

	/**
	 * Quits a process while a fake installer runs, relaunches in the background once the process
	 * exited, and returns whether it launched before `install` was called and how it launched.
	 */
	async function relaunch(commit: string | undefined, install: (productJsonPath: string, installer: ChildProcess) => Promise<void>): Promise<{ launchedWhileInstalling: boolean; openArgs: string[]; bundlePath: string }> {
		const root = await fs.mkdtemp(join(tmpdir(), 'vscode-relaunch-'));
		const bundleIdentifier = `com.example.relaunch${process.pid}${Date.now()}`;
		let installer: ChildProcess | undefined;
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

			// Like ShipIt, which launchd runs as `<path>/ShipIt <bundle identifier>.ShipIt <state path>`
			// (`; true` keeps the shell from replacing itself, and its command line, with `sleep`)
			installer = spawn('/bin/sh', ['-c', 'sleep 30; true', join(root, 'Squirrel.framework', 'Resources', 'ShipIt'), `${bundleIdentifier}.ShipIt`, join(root, 'ShipItState.plist')]);

			const quitting = spawn('/bin/sh', ['-c', 'sleep 0.5']);
			const quit = new Promise(resolve => quitting.once('exit', resolve));
			const currentRelauncher = relauncher = relaunchInBackground({ pid: quitting.pid!, commit, appRoot, bundleIdentifier, openCommand, installerGoneSeconds: 1 });
			const relaunched = new Promise(resolve => currentRelauncher.once('exit', resolve)); // the script runs `open` with `exec`

			await quit;
			await timeout(2000);
			const launchedWhileInstalling = currentRelauncher.exitCode !== null || await exists(openArgsPath);

			await install(productJsonPath, installer);
			await relaunched;

			return { launchedWhileInstalling, openArgs: (await fs.readFile(openArgsPath, 'utf8')).trim().split('\n'), bundlePath };
		} finally {
			kill(relauncher);
			kill(installer);
			await fs.rm(root, { recursive: true, force: true });
		}
	}

	test('launches without activating once the update is installed', async function () {
		this.timeout(20000);

		const { bundlePath, ...result } = await relaunch(newCommit, productJsonPath => fs.writeFile(productJsonPath, JSON.stringify({ commit: newCommit })));

		assert.deepStrictEqual(result, { launchedWhileInstalling: false, openArgs: ['-g', '-a', bundlePath] });
	});

	test('launches without activating once the installer is gone, if the update is unknown', async function () {
		this.timeout(20000);

		const { bundlePath, ...result } = await relaunch(undefined, async (_productJsonPath, installer) => {
			const exited = new Promise(resolve => installer.once('exit', resolve));
			installer.kill();
			await exited;
		});

		assert.deepStrictEqual(result, { launchedWhileInstalling: false, openArgs: ['-g', '-a', bundlePath] });
	});

	test('isCommit', () => {
		assert.deepStrictEqual([newCommit, 'abc1234', 'ABCDEF0', 'unknown', '', undefined, 'abc', `${newCommit}0`].map(isCommit), [true, true, true, false, false, false, false, false]);
	});
});
