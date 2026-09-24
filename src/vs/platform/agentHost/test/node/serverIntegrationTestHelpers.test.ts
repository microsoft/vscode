/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { once } from 'events';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise, Promises, raceTimeout, retry } from '../../../../base/common/async.js';
import { getErrorCode } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collectServerDescendants, killServer, stopServer } from './serverIntegrationTestHelpers.js';

suite('Agent Host test server cleanup', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function runDescendantKillFailureTest(isSameProcessRunningResults: readonly boolean[], killFails = true): Promise<{ error: Error | undefined; calls: string[] }> {
		const descendant = { pid: 123, name: 'node.exe', commandLine: 'node child.js' };
		const server = spawn(process.execPath, ['-e', `
			process.stdin.resume();
			process.stdout.write('ready');
			process.stdin.once('end', () => process.exit(0));
			setTimeout(() => process.exit(99), 30000);
		`], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		const calls: string[] = [];
		const killError = new Error('process kill failed');
		let identityCheckIndex = 0;
		try {
			assert.ok(await raceTimeout(once(server.stdout, 'data'), 5_000), 'Server did not start');
			const error = await stopServer({ process: server, port: 0 }, async () => [descendant], 5_000, {
				killTree: async (pid, forceful) => {
					throw new Error(`Unexpected server tree kill: ${pid}:${forceful}`);
				},
				killProcess: pid => {
					calls.push(`kill:${pid}`);
					if (killFails) {
						throw killError;
					}
				},
				isSameProcessRunning: async process => {
					calls.push(`isSameProcessRunning:${process.pid}:${process.name}:${process.commandLine}`);
					const result = isSameProcessRunningResults[identityCheckIndex++];
					if (result === undefined) {
						throw new Error('Unexpected process identity check');
					}
					return result;
				},
			}).then(
				() => undefined,
				(error: Error) => error,
			);
			return { error, calls };
		} finally {
			await killServer({ process: server, port: 0 });
		}
	}

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
		const snapshot = new DeferredPromise<[]>();
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

	test('prunes unreadable stale-PPID branches from the descendant snapshot', () => {
		assert.deepStrictEqual(collectServerDescendants(100, [
			{ pid: 100, ppid: 1, name: 'node.exe', commandLine: 'node server.js' },
			{ pid: 200, ppid: 100, name: 'node.exe', commandLine: 'node child.js' },
			{ pid: 201, ppid: 200, name: 'node.exe', commandLine: 'node grandchild.js' },
			{ pid: 300, ppid: 100, name: 'critical.exe' },
			{ pid: 301, ppid: 300, name: 'unrelated.exe', commandLine: 'unrelated.exe' },
		]), [
			{ pid: 200, name: 'node.exe', commandLine: 'node child.js' },
			{ pid: 201, name: 'node.exe', commandLine: 'node grandchild.js' },
		]);
	});

	test('ignores a failed descendant kill when the process identity is no longer present', async function () {
		this.timeout(15_000);
		const result = await runDescendantKillFailureTest([false]);

		assert.deepStrictEqual(result, {
			error: undefined,
			calls: ['isSameProcessRunning:123:node.exe:node child.js'],
		});
	});

	test('ignores a failed descendant kill when the process exits during termination', async function () {
		this.timeout(15_000);
		const result = await runDescendantKillFailureTest([true, false]);

		assert.deepStrictEqual(result, {
			error: undefined,
			calls: [
				'isSameProcessRunning:123:node.exe:node child.js',
				'kill:123',
				'isSameProcessRunning:123:node.exe:node child.js',
			],
		});
	});

	test('ignores a failed descendant kill after the process list catches up', async function () {
		this.timeout(15_000);
		const result = await runDescendantKillFailureTest([true, true, false]);

		assert.deepStrictEqual(result, {
			error: undefined,
			calls: [
				'isSameProcessRunning:123:node.exe:node child.js',
				'kill:123',
				'isSameProcessRunning:123:node.exe:node child.js',
				'isSameProcessRunning:123:node.exe:node child.js',
			],
		});
	});

	test('waits for a descendant to exit after a successful kill', async function () {
		this.timeout(15_000);
		const result = await runDescendantKillFailureTest([true, true, true, false], false);

		assert.deepStrictEqual(result, {
			error: undefined,
			calls: [
				'isSameProcessRunning:123:node.exe:node child.js',
				'kill:123',
				'isSameProcessRunning:123:node.exe:node child.js',
				'isSameProcessRunning:123:node.exe:node child.js',
				'isSameProcessRunning:123:node.exe:node child.js',
			],
		});
	});

	test('preserves a failed descendant kill when the same process identity is still present', async function () {
		this.timeout(15_000);
		const result = await runDescendantKillFailureTest([true, true, true, true, true, true]);

		assert.deepStrictEqual({
			error: result.error?.message,
			calls: result.calls,
		}, {
			error: 'process kill failed',
			calls: [
				'isSameProcessRunning:123:node.exe:node child.js',
				'kill:123',
				'isSameProcessRunning:123:node.exe:node child.js',
				'isSameProcessRunning:123:node.exe:node child.js',
				'isSameProcessRunning:123:node.exe:node child.js',
				'isSameProcessRunning:123:node.exe:node child.js',
				'isSameProcessRunning:123:node.exe:node child.js',
			],
		});
	});

	test('rechecks failed descendant kills after all concurrent kills finish', async function () {
		this.timeout(15_000);
		const server = spawn(process.execPath, ['-e', `
			process.stdin.resume();
			process.stdout.write('ready');
			process.stdin.once('end', () => process.exit(0));
			setTimeout(() => process.exit(99), 30000);
		`], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		const descendants = [
			{ pid: 123, name: 'node.exe', commandLine: 'node child.js' },
			{ pid: 124, name: 'node.exe', commandLine: 'node grandchild.js' },
		];
		const calls: string[] = [];
		let concurrentKillFinished = false;
		try {
			assert.ok(await raceTimeout(once(server.stdout, 'data'), 5_000), 'Server did not start');
			const error = await stopServer({ process: server, port: 0 }, async () => descendants, 5_000, {
				killTree: async pid => {
					throw new Error(`Unexpected server tree kill: ${pid}`);
				},
				killProcess: pid => {
					calls.push(`kill:${pid}`);
					if (pid === 123) {
						throw new Error('process kill failed');
					}
					concurrentKillFinished = true;
					calls.push(`killed:${pid}`);
				},
				isSameProcessRunning: async process => {
					calls.push(`isSameProcessRunning:${process.pid}`);
					return !concurrentKillFinished;
				},
			}).then(
				() => undefined,
				(error: Error) => error,
			);
			assert.deepStrictEqual({ error: error?.message, calls }, {
				error: undefined,
				calls: [
					'isSameProcessRunning:123',
					'isSameProcessRunning:124',
					'kill:123',
					'kill:124',
					'killed:124',
					'isSameProcessRunning:123',
					'isSameProcessRunning:124',
				],
			});
		} finally {
			await killServer({ process: server, port: 0 });
		}
	});

	test('ignores a failed server tree kill when the server exits during taskkill', async function () {
		this.timeout(15_000);
		const server = spawn(process.execPath, ['-e', `
			process.stdout.write('ready');
			process.stdin.resume();
			setTimeout(() => process.exit(99), 30000);
		`], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		try {
			assert.ok(await raceTimeout(once(server.stdout, 'data'), 5_000), 'Server did not start');
			await stopServer({ process: server, port: 0 }, async () => [], 1_000, {
				killTree: async () => {
					server.kill();
					throw new Error('taskkill failed after the server exited');
				},
				killProcess: () => { throw new Error('Unexpected descendant kill'); },
				isSameProcessRunning: async () => false,
			});
			assert.deepStrictEqual(server.exitCode !== null || server.signalCode !== null, true);
		} finally {
			await killServer({ process: server, port: 0 });
		}
	});

	test('preserves a failed server tree kill when the server is still running', async function () {
		this.timeout(15_000);
		const server = spawn(process.execPath, ['-e', `
			process.stdout.write('ready');
			process.stdin.resume();
			setTimeout(() => process.exit(99), 30000);
		`], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		try {
			assert.ok(await raceTimeout(once(server.stdout, 'data'), 5_000), 'Server did not start');
			const error = await stopServer({ process: server, port: 0 }, async () => [], 1_000, {
				killTree: async () => {
					throw new Error('taskkill failed while server was running');
				},
				killProcess: () => { throw new Error('Unexpected descendant kill'); },
				isSameProcessRunning: async () => false,
			}).then(
				() => undefined,
				(error: Error) => error,
			);
			assert.deepStrictEqual(error?.message, 'taskkill failed while server was running');
		} finally {
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
			await rm(directory, { recursive: true, maxRetries: 10, retryDelay: 100 });
		} finally {
			await Promises.settled([
				killServer({ process: server, port: 0 }),
				(async () => {
					const pid = descendantPid;
					if (pid === undefined) {
						return;
					}
					try {
						process.kill(pid);
					} catch (error) {
						if (getErrorCode(error) !== 'ESRCH') {
							throw error;
						}
						return;
					}
					await retry(async () => {
						try {
							process.kill(pid, 0);
						} catch (error) {
							if (getErrorCode(error) === 'ESRCH') {
								return;
							}
							throw error;
						}
						throw new Error(`Agent Host test server descendant ${pid} did not exit after termination`);
					}, 50, 100);
				})(),
			]);
			await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
		}
	});
});
