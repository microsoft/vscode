/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile, fork, spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { raceTimeout, retry } from '../../../../../../base/common/async.js';
import { dirname, join } from '../../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { WorkbenchClientProfileResult } from './workbenchClientProfileWatchdog.js';

suite('Workbench client profile cleanup', function () {
	this.timeout(30_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	// Windows still uses taskkill in the live parent's finally block, not a POSIX process group.
	const posixTest = process.platform === 'win32' ? test.skip : test;
	const repositoryRoot = fileURLToPath(new URL('../../../../../../../../', import.meta.url));
	const captureModule = new URL('./workbenchClientProfile.js', import.meta.url).href;

	function quote(value: string): string {
		return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
	}

	function stopGroup(pid: number): void {
		try {
			process.kill(-pid, 'SIGKILL');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
				throw error;
			}
		}
	}

	async function processStates(pids: number[]): Promise<{ pid: number; group: number; state: string }[]> {
		try {
			const { stdout } = await promisify(execFile)('ps', ['-o', 'pid=,pgid=,stat=', '-p', pids.join(',')]);
			return stdout.trim().split('\n').filter(Boolean).map(line => {
				const [pid, group, state] = line.trim().split(/\s+/);
				return { pid: Number(pid), group: Number(group), state };
			});
		} catch (error) {
			if ((error as { code?: number }).code === 1) {
				return [];
			}
			throw error;
		}
	}

	async function capture(mode: 'hang' | 'success' | 'failure'): Promise<{ code: number | null; stdout: string; stderr: string }> {
		await mkdir(join(repositoryRoot, '.build'), { recursive: true });
		const directory = await mkdtemp(join(repositoryRoot, '.build', 'cp-cleanup-'));
		const executableDirectory = process.platform === 'darwin' ? join(directory, 'Contents', 'MacOS') : directory;
		const extensionDirectory = join(directory, ...(process.platform === 'darwin' ? ['Contents', 'Resources'] : ['resources']), 'app', 'extensions', 'copilot');
		const executable = join(executableDirectory, 'fake-code');
		const record = join(directory, 'pids');
		await Promise.all([mkdir(executableDirectory, { recursive: true }), mkdir(extensionDirectory, { recursive: true })]);
		await writeFile(join(extensionDirectory, 'package.json'), JSON.stringify({ publisher: 'GitHub', name: 'copilot-chat' }));
		await writeFile(executable, `#!/bin/sh
if [ -n "$GITHUB_TOKEN" ] || [ -n "$ELECTRON_RUN_AS_NODE" ]; then
	echo "Capture environment was not isolated" >&2
	exit 9
fi
/bin/sleep 120 &
printf '%s\\n' "$$" "$PPID" "$!" "$AGENT_HOST_CLIENT_PROFILE_OUTPUT" > ${quote(record)}
${mode === 'hang' ? 'wait' : mode === 'failure' ? 'echo "fake workbench failure" >&2\nexit 7' : `printf '%s' '{"tools":[{"name":"z"},{"name":"a"}]}' > "$AGENT_HOST_CLIENT_PROFILE_OUTPUT"\nexit 0`}
`, { mode: 0o700 });

		const parent = spawn(process.execPath, ['--input-type=module', '--eval', `
			import { collectWorkbenchClientTools } from ${JSON.stringify(captureModule)};
			try {
				console.log(JSON.stringify(await collectWorkbenchClientTools()));
			} catch (error) {
				console.error(error.message);
				process.exitCode = 1;
			}
		`], {
			cwd: repositoryRoot,
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', GITHUB_TOKEN: 'cleanup-test-sentinel', INTEGRATION_TEST_ELECTRON_PATH: executable },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		parent.stdout.on('data', data => stdout += data.toString());
		parent.stderr.on('data', data => stderr += data.toString());
		const closed = new Promise<number | null>((resolve, reject) => {
			parent.once('error', reject);
			parent.once('close', resolve);
		});
		let pids: number[] = [];
		let captureDirectory: string | undefined;
		try {
			await retry(async () => {
				const lines = (await readFile(record, 'utf8')).trim().split('\n');
				assert.strictEqual(lines.length, 4);
				pids = lines.slice(0, 3).map(Number);
				captureDirectory = dirname(lines[3]);
			}, 25, 200);
			if (mode === 'hang') {
				const states = await processStates(pids);
				assert.deepStrictEqual(states.map(({ pid, group }) => ({ pid, group })).sort((a, b) => a.pid - b.pid),
					pids.map(pid => ({ pid, group: pids[1] })).sort((a, b) => a.pid - b.pid));
				parent.kill('SIGKILL');
			}
			const code = await raceTimeout(closed, 10_000);
			if (code === undefined) {
				throw new Error(`Capture parent did not exit: ${stderr}`);
			}
			await retry(async () => {
				// A killed orphan may remain a zombie until the OS reaps it; it must not still be running.
				assert.deepStrictEqual((await processStates(pids)).filter(({ state }) => !state.startsWith('Z')), []);
			}, 25, 200);
			if (mode !== 'hang') {
				assert.strictEqual(existsSync(captureDirectory!), false, 'normal teardown removes the isolated profile');
			}
			return { code, stdout, stderr };
		} finally {
			if (parent.exitCode === null && parent.signalCode === null) {
				parent.kill('SIGKILL');
			}
			await closed;
			if (pids.length) {
				stopGroup(pids[1]);
			}
			if (captureDirectory) {
				await rm(captureDirectory, { recursive: true, force: true });
			}
			await rm(directory, { recursive: true, force: true });
		}
	}

	posixTest('kills the actual workbench, its helper, and watchdog when the test parent is SIGKILLed', async () => {
		const result = await capture('hang');
		assert.deepStrictEqual(result, { code: null, stdout: '', stderr: '' });
	});

	posixTest('leaves no watchdog or workbench helpers after a successful capture', async () => {
		const result = await capture('success');
		assert.deepStrictEqual(result, { code: 0, stdout: '[{"name":"a"},{"name":"z"}]\n', stderr: '' });
	});

	posixTest('preserves capture errors and diagnostics while stopping the whole group', async () => {
		const result = await capture('failure');
		assert.strictEqual(result.code, 1);
		assert.match(result.stderr, /Workbench exited with code 7 without writing a client profile/);
		assert.match(result.stderr, /fake workbench failure/);
	});

	posixTest('reports spawn failures and exits when its IPC parent disconnects', async () => {
		const watchdog = fork(new URL('./workbenchClientProfileWatchdog.js', import.meta.url), [join(repositoryRoot, 'nonexistent-workbench-executable')], {
			env: { ELECTRON_RUN_AS_NODE: '1' }, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], detached: true
		});
		const exited = new Promise<void>(resolve => watchdog.once('exit', () => resolve()));
		try {
			const result = await raceTimeout(new Promise<WorkbenchClientProfileResult>((resolve, reject) => {
				watchdog.once('error', reject);
				watchdog.once('message', resolve);
			}), 5_000);
			assert.strictEqual(result?.type, 'error');
			if (result?.type === 'error') {
				assert.match(result.message, /ENOENT/);
			}
			watchdog.disconnect();
			assert.strictEqual(await raceTimeout(exited.then(() => true), 5_000), true);
			assert.deepStrictEqual(await processStates([watchdog.pid!]), []);
		} finally {
			if (watchdog.pid && watchdog.exitCode === null && watchdog.signalCode === null) {
				stopGroup(watchdog.pid);
			}
			await exited;
		}
	});
});
