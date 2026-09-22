/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { once } from 'events';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise, Promises, raceTimeout } from '../../../../base/common/async.js';
import { getErrorCode } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { killTree } from '../../../../base/node/processes.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { killServer, stopServer } from './serverIntegrationTestHelpers.js';

class TestServerProcess extends ChildProcess {
	override readonly pid = process.pid + 1;
	override exitCode: number | null = null;
	override signalCode: NodeJS.Signals | null = null;

	exit(): void {
		this.exitCode = 0;
		this.emit('exit', 0, null);
	}
}

suite('Agent Host test server cleanup', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const { name, cleanup } of [
		{
			name: 'graceful shutdown fallback',
			cleanup: (process: ChildProcess, killProcessTree: typeof killTree) => stopServer({ process, port: 0 }, async () => [], 0, killProcessTree),
		},
		{
			name: 'forceful shutdown',
			cleanup: (process: ChildProcess, killProcessTree: typeof killTree) => killServer({ process, port: 0 }, killProcessTree),
		},
	]) {
		for (const queued of [false, true]) {
			test(`${name} accepts only an observed ${queued ? 'queued' : 'synchronous'} server exit after taskkill fails`, () => runWithFakedTimers({}, async () => {
				const server = new TestServerProcess();
				const calls: { pid: number; forceful: boolean | undefined }[] = [];
				await cleanup(server, async (pid, forceful) => {
					calls.push({ pid, forceful });
					if (queued) {
						setTimeout(() => server.exit(), 1);
					} else {
						server.exit();
					}
					throw new Error(`taskkill exited with code 128: ERROR: The process "${pid}" not found.`);
				});

				assert.deepStrictEqual({
					calls,
					exitCode: server.exitCode,
					exitListeners: server.listenerCount('exit'),
				}, {
					calls: [{ pid: server.pid, forceful: true }],
					exitCode: 0,
					exitListeners: 0,
				});
			}));
		}

		for (const message of ['taskkill exited with code 128: process not found', 'taskkill access denied']) {
			test(`${name} preserves ${message} when the server has not exited`, () => runWithFakedTimers({}, async () => {
				const server = new TestServerProcess();
				const error = new Error(message);
				const startTime = Date.now();
				let attempts = 0;
				await assert.rejects(cleanup(server, async () => {
					attempts++;
					throw error;
				}), actual => actual === error);

				assert.deepStrictEqual({
					attempts,
					exitCode: server.exitCode,
					exitListeners: server.listenerCount('exit'),
					elapsedMs: Date.now() - startTime,
				}, {
					attempts: 1,
					exitCode: null,
					exitListeners: 0,
					elapsedMs: 5_000,
				});
			}));
		}

		test(`${name} does not kill a server whose exit is already observed`, async () => {
			const server = new TestServerProcess();
			server.exit();
			await cleanup(server, async () => assert.fail('Must not kill an exited server PID'));
			assert.strictEqual(server.listenerCount('exit'), 0);
		});

		test(`${name} releases exit listeners after repeated failed cleanup`, () => runWithFakedTimers({}, async () => {
			const server = new TestServerProcess();
			const error = new Error('taskkill access denied');
			const listenerCounts: number[] = [];
			for (let attempt = 0; attempt < 3; attempt++) {
				await assert.rejects(cleanup(server, async () => { throw error; }), actual => actual === error);
				listenerCounts.push(server.listenerCount('exit'));
			}
			assert.deepStrictEqual(listenerCounts, [0, 0, 0]);
		}));
	}

	test('a confirmed server exit does not hide a descendant cleanup failure', () => runWithFakedTimers({}, async () => {
		const server = new TestServerProcess();
		const descendantPid = process.pid;
		const error = new Error('descendant access denied');
		const killedPids: number[] = [];
		await assert.rejects(stopServer({ process: server, port: 0 }, async () => [descendantPid], 0, async pid => {
			killedPids.push(pid);
			if (pid === server.pid) {
				server.exit();
				return;
			}
			throw error;
		}), actual => actual === error);

		assert.deepStrictEqual({
			killedPids,
			exitListeners: server.listenerCount('exit'),
		}, {
			killedPids: [server.pid, descendantPid],
			exitListeners: 0,
		});
	}));

	test('a stalled descendant snapshot still sends EOF and reaches forced shutdown', async function () {
		this.timeout(15_000);
		const server = spawn(process.execPath, ['-e', `
			process.stdin.resume();
			process.stdout.write('ready');
			setTimeout(() => process.exit(99), 30000);
		`], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		const snapshot = new DeferredPromise<number[]>();
		let stopped: Promise<Error | undefined> | undefined;
		try {
			assert.ok(await raceTimeout(once(server.stdout, 'data'), 5_000), 'Server did not start');
			stopped = stopServer({ process: server, port: 0 }, () => snapshot.p, 0).then(
				() => undefined,
				(error: Error) => error,
			);
			const error = await raceTimeout(stopped, 5_000);
			assert.deepStrictEqual({
				message: error?.message,
				cause: error?.cause instanceof Error ? error.cause.message : undefined,
				eof: server.stdin.writableEnded,
				exited: server.exitCode !== null || server.signalCode !== null,
			}, {
				message: 'Failed to capture Agent Host test server descendants',
				cause: 'Timed out capturing Agent Host test server descendants',
				eof: true,
				exited: true,
			});
		} finally {
			snapshot.complete([]);
			await stopped;
			await killServer({ process: server, port: 0 });
		}
	});

	(isWindows ? test : test.skip)('stops owned descendants after the server exits gracefully', async function () {
		this.timeout(30_000);
		const directory = await mkdtemp(join(tmpdir(), 'vscode-test-server-cleanup-'));
		const descendantCode = `
			require('fs').writeFileSync('owned.txt', String(process.pid));
			process.send(process.pid);
			process.disconnect();
			setTimeout(() => process.exit(99), 30000);
		`;
		const server = spawn(process.execPath, ['-e', `
			const { spawn } = require('child_process');
			const holder = spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], {
				detached: true,
				windowsHide: true,
				stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
				env: process.env,
			});
			holder.once('message', pid => {
				holder.unref();
				process.send(pid);
			});
			process.stdin.resume();
			process.stdin.once('end', () => process.exit(0));
			setTimeout(() => process.exit(99), 30000);
		`], {
			cwd: directory,
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
			windowsHide: true,
		});
		let stderr = '';
		server.stderr?.on('data', chunk => stderr += chunk.toString());
		let descendantPid: number | undefined;
		try {
			const ready = await raceTimeout(once(server, 'message'), 5_000);
			assert.ok(ready, `Descendant did not start: ${stderr}`);
			const message: unknown = ready[0];
			assert.ok(typeof message === 'number');
			descendantPid = message;
			await stopServer({ process: server, port: 0 });

			assert.strictEqual(server.exitCode, 0);
			assert.throws(() => process.kill(message, 0), { code: 'ESRCH' });
			await rm(directory, { recursive: true });
		} finally {
			await Promises.settled([server.pid, descendantPid].map(async pid => {
				if (pid === undefined) {
					return;
				}
				try {
					process.kill(pid, 0);
				} catch (error) {
					if (getErrorCode(error) === 'ESRCH') {
						return;
					}
					throw error;
				}
				await killTree(pid, true);
			}));
			await rm(directory, { recursive: true, force: true });
		}
	});
});
