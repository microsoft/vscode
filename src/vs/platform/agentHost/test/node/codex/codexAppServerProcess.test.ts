/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn, type ChildProcess } from 'child_process';
import { once } from 'events';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { getErrorCode } from '../../../../../base/common/errors.js';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { killTree, shutdownProcessTree } from '../../../../../base/node/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodexAppServerClient, transportFromChildProcess } from '../../../node/codex/codexAppServerClient.js';
import { removeTempDirs } from '../e2e/harness/agentHostE2ETestHarness.js';
import { stopServer } from '../serverIntegrationTestHelpers.js';

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (getErrorCode(error) === 'ESRCH') {
			return false;
		}
		throw error;
	}
}

async function nextMessage(child: ChildProcess): Promise<unknown> {
	return (await once(child, 'message'))[0];
}

function isFixtureMessage(message: unknown): message is { readonly kind?: unknown; readonly descendantPid?: unknown } {
	return typeof message === 'object' && message !== null;
}

suite('Codex app-server owned process shutdown', function () {
	this.timeout(10_000);

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const ownedPids = new Set<number>();
	const directories: string[] = [];

	function createDirectory(): string {
		const directory = mkdtempSync(join(tmpdir(), 'vscode-codex-shutdown-test-'));
		directories.push(directory);
		return directory;
	}

	function own(child: ChildProcess): void {
		if (child.pid !== undefined) {
			ownedPids.add(child.pid);
		}
	}

	async function start(mode: 'delayed' | 'ignore' | 'orphan', descendant = false, graceTimeMs = 2_000) {
		const directory = createDirectory();
		const descendantCode = `
			require('fs').writeFileSync('descendant.txt', String(process.pid));
			process.send({ pid: process.pid });
			process.disconnect();
			setTimeout(() => process.exit(99), 15000);
		`;
		const code = `
			const { spawn } = require('child_process');
			require('fs').writeFileSync('owned.txt', String(process.pid));
			setTimeout(() => process.exit(99), 15000);
			process.stdin.resume();
			process.stdin.once('end', () => {
				process.send({ kind: 'eof' });
				if (${JSON.stringify(mode)} === 'delayed') {
					setTimeout(() => process.exit(0), 200);
				} else if (${JSON.stringify(mode)} === 'orphan') {
					process.exit(0);
				}
			});
			if (${descendant}) {
				const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], {
					detached: true,
					stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
					env: process.env
				});
				child.once('message', message => {
					child.unref();
					process.send({ kind: 'ready', descendantPid: message.pid });
				});
			} else {
				process.send({ kind: 'ready' });
			}
		`;
		const child = spawn(process.execPath, ['-e', code], {
			cwd: directory,
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
		});
		own(child);
		const ready = await nextMessage(child);
		assert.ok(isFixtureMessage(ready) && ready.kind === 'ready');
		if (ready.descendantPid !== undefined) {
			assert.ok(typeof ready.descendantPid === 'number');
			ownedPids.add(ready.descendantPid);
		}
		const client = disposables.add(new CodexAppServerClient(transportFromChildProcess(child), undefined, graceTimeMs));
		return { child, client, directory };
	}

	function assertRemoved(directory: string): void {
		assert.deepStrictEqual([...ownedPids].filter(isRunning), [], 'owned processes must exit before removing the suite home');
		ownedPids.clear();
		rmSync(directory, { recursive: true });
		assert.strictEqual(existsSync(directory), false);
	}

	teardown(async () => {
		const results = await Promise.allSettled([...ownedPids].map(async pid => {
			if (isRunning(pid)) {
				try {
					await killTree(pid, true, 2_000);
				} catch (error) {
					if (isRunning(pid)) {
						throw error;
					}
				}
			}
		}));
		ownedPids.clear();
		const errors: unknown[] = results.filter(result => result.status === 'rejected').map(result => result.reason);
		for (const directory of directories.splice(0)) {
			try {
				rmSync(directory, { recursive: true, force: true });
			} catch (error) {
				errors.push(error);
			}
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, 'Failed to clean up owned process test fixtures');
		}
	});

	test('waits for a delayed EOF exit before removing the home', async () => {
		const { child, client, directory } = await start('delayed');
		const eof = nextMessage(child);
		const started = Date.now();
		const shutdown = client.shutdown();
		assert.strictEqual(await Promise.race([eof.then(() => 'eof'), shutdown.then(() => 'closed')]), 'eof');
		await shutdown;
		assert.ok(Date.now() - started >= 200, 'shutdown returned before the child finished its delayed exit');
		assert.strictEqual(child.exitCode, 0);
		assertRemoved(directory);
	});

	test('uses bounded owned-tree fallback when EOF is ignored', async () => {
		const graceTimeMs = 200;
		const { client, directory } = await start('ignore', true, graceTimeMs);
		const started = Date.now();
		await client.shutdown();
		const elapsed = Date.now() - started;
		assert.ok(elapsed >= graceTimeMs && elapsed < graceTimeMs + 3_000, `shutdown took ${elapsed}ms`);
		assertRemoved(directory);
	});

	test('an EPERM liveness probe still attempts owned-tree termination', async () => {
		const { child, directory } = await start('ignore', true);
		let probes = 0;
		await shutdownProcessTree(child, 0, 2_000, pid => {
			if (probes++ === 0) {
				throw Object.assign(new Error('Cannot query the owned process'), { code: 'EPERM' });
			}
			process.kill(pid, 0);
		});
		assert.ok(probes > 0);
		assertRemoved(directory);
	});

	(isWindows ? test : test.skip)('reaps a detached Windows descendant even when its parent exits cleanly', async () => {
		const { child, client, directory } = await start('orphan', true);
		await client.shutdown();
		assert.strictEqual(child.exitCode, 0);
		assertRemoved(directory);
	});

	(isWindows ? test : test.skip)('server shutdown reaps owned descendants before deleting a suite home', async () => {
		const { child, directory } = await start('orphan', true);
		await stopServer({ process: child, port: 0 });
		assertRemoved(directory);
	});

	test('startup failure preserves errno and executable path without hanging shutdown', async () => {
		const directory = createDirectory();
		const executable = join(directory, 'missing-codex-executable');
		const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] });
		const client = disposables.add(new CodexAppServerClient(transportFromChildProcess(child)));
		const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
		await assert.rejects(
			client.request('initialize', { clientInfo: { name: 'shutdown-test', version: '1', title: null }, capabilities: null }),
			{ code: 'ENOENT', path: executable },
		);
		await closed;
		await client.shutdown();
		assert.strictEqual(child.pid, undefined);
		assertRemoved(directory);
	});

	test('repeated dispose and shutdown share one bounded forced cleanup', async () => {
		const { client, directory } = await start('ignore', true);
		client.dispose();
		const shutdown = client.shutdown();
		client.dispose();
		assert.strictEqual(client.shutdown(), shutdown);
		await shutdown;
		client.dispose();
		assert.strictEqual(client.shutdown(), shutdown);
		assertRemoved(directory);
	});

	test('two sequential client lifetimes leave no processes or directories', async () => {
		for (let lifetime = 0; lifetime < 2; lifetime++) {
			const { client, directory } = await start('delayed');
			await client.shutdown();
			assertRemoved(directory);
		}
	});

	(isWindows ? test : test.skip)('retains nested filesystem diagnostics for a held Windows file', async () => {
		const directory = createDirectory();
		const command = [
			'$stream = [System.IO.File]::Open($env:CODEX_SHUTDOWN_TEST_FILE, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::Read)',
			'[Console]::Out.WriteLine(\'ready\')',
			'[Console]::Out.Flush()',
			'[Console]::In.ReadToEnd() | Out-Null',
			'[System.Threading.Thread]::Sleep(200)',
			'$stream.Dispose()',
		].join('; ');
		// Keep cwd outside the home so the failing path identifies the held file rather than cwd.
		const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
			env: { ...process.env, CODEX_SHUTDOWN_TEST_FILE: join(directory, 'state.sqlite') },
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		own(child);
		assert.ok(child.stdout);
		await once(child.stdout, 'data');
		const client = disposables.add(new CodexAppServerClient(transportFromChildProcess(child)));
		await assert.rejects(removeTempDirs([directory], 0), error => {
			assert.ok(error instanceof AggregateError);
			const cause: NodeJS.ErrnoException = error.errors[0];
			assert.ok(cause instanceof Error && typeof cause.code === 'string' && error.message.includes(cause.code));
			assert.strictEqual(cause.path, join(directory, 'state.sqlite'));
			assert.ok(typeof cause.errno === 'number' && error.message.includes(String(cause.errno)) && error.message.includes('state.sqlite'));
			return true;
		});
		await client.shutdown();
		assertRemoved(directory);
	});

	test('still removes read-only files from the suite home', async () => {
		const directory = createDirectory();
		const file = join(directory, 'read-only');
		writeFileSync(file, 'owned test file');
		chmodSync(file, 0o444);
		await removeTempDirs([directory]);
		assert.strictEqual(existsSync(directory), false);
	});
});
