/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, promises as fs } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as path from 'node:path';
import { test } from 'node:test';

const launcher = path.join(import.meta.dirname, 'launch.ts');
const cleanup = path.join(import.meta.dirname, 'cleanup', 'cleanup.ts');

interface IReadiness {
	readonly pid: number;
	readonly runDir: string;
	readonly userDataDir: string;
	readonly sharedDataDir: string;
	readonly extensionsDir: string;
	readonly cdpPort: number;
}

interface ILaunch {
	readonly child: ChildProcess;
	readonly exited: Promise<number | null>;
	readonly ready: Promise<IReadiness>;
	readonly startedFile: string;
	readonly readyFile: string;
	readonly exitFile: string;
	readonly stdout: () => string;
	readonly stderr: () => string;
}

test('managed launcher readiness, lifetime, isolation, forwarding and exact-run cleanup', { timeout: 120_000 }, async t => {
	const root = await fs.mkdtemp(path.join(import.meta.dirname, '.managed-test-'));
	const repo = path.join(root, 'repo');
	const source = path.join(root, 'source');
	const shared = path.join(root, 'shared');
	const runRoot = path.join(root, 'runs');
	const env: NodeJS.ProcessEnv = { ...process.env, CODE_OSS_DEV_RUN_ROOT: runRoot, CODE_OSS_DEV_AUTHED_SHARED_DATA_DIR: shared, CODE_OSS_DEV_REUSE: '0' };
	delete env.CODE_OSS_DEV_SCRIPT_ARGS;
	delete env.CODE_OSS_DEV_STDOUT_FILE;
	delete env.CODE_OSS_DEV_STDERR_FILE;
	const launches: ILaunch[] = [];

	async function start(name: string, extra: string[] = []): Promise<ILaunch> {
		const startedFile = path.join(root, `${name}.started.json`);
		const readyFile = path.join(root, `${name}.ready`);
		const exitFile = path.join(root, `${name}.exit`);
		const child = spawn(process.execPath, [launcher, '--repo', repo, '--wait', '--skip-prelaunch', '--session-title', 'Managed $ test', '--disable-workspace-trust', '--source-user-data-dir', source, '--',
			`--fixture-started=${startedFile}`, `--fixture-ready=${readyFile}`, `--fixture-exit=${exitFile}`, ...extra, '--extensionDevelopmentPath=extension & 100% with spaces', 'workspace with spaces'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stderr!.on('data', chunk => { stderr += chunk; });
		const exited = once(child, 'exit').then(([code]) => code as number | null);
		const ready = new Promise<IReadiness>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`Readiness timed out: ${stderr}`)), 30_000);
			timer.unref();
			child.once('error', reject);
			child.stdout!.on('data', chunk => {
				stdout += chunk;
				if (stdout.includes('\n')) {
					clearTimeout(timer);
					try {
						resolve(JSON.parse(stdout.trim()));
					} catch (error) {
						reject(error);
					}
				}
			});
			void exited.then(code => {
				clearTimeout(timer);
				if (!stdout.includes('\n')) {
					reject(new Error(`Launcher exited ${code} before readiness: ${stderr}`));
				}
			});
		});
		// Failures before readiness are asserted by the individual test below.
		void ready.catch(() => { });
		const launch = { child, exited, ready, startedFile, readyFile, exitFile, stdout: () => stdout, stderr: () => stderr };
		launches.push(launch);
		return launch;
	}

	async function stop(runDir: string): Promise<{ removed: boolean }> {
		const child = spawn(process.execPath, [cleanup, runDir], { env, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout!.on('data', chunk => { stdout += chunk; });
		child.stderr!.on('data', chunk => { stderr += chunk; });
		const [code] = await once(child, 'exit');
		assert.equal(code, 0, stderr);
		return JSON.parse(stdout);
	}

	try {
		await fs.mkdir(path.join(repo, 'scripts'), { recursive: true });
		await fs.writeFile(path.join(repo, 'product.json'), JSON.stringify({ nameShort: 'Code', sharedDataFolderName: '.unused' }));
		await fs.writeFile(path.join(repo, 'index.js'), stripTypeScriptTypes(
			await fs.readFile(path.join(import.meta.dirname, 'fixtures', 'fakeCode.ts'), 'utf8'),
		));
		if (process.platform === 'win32') {
			await fs.mkdir(path.join(repo, '.build', 'electron'), { recursive: true });
			await fs.writeFile(path.join(repo, 'scripts', 'code.bat'), '');
			await fs.copyFile(process.execPath, path.join(repo, '.build', 'electron', 'Code.exe'));
		} else {
			const quote = (value: string) => `'${value.replaceAll('\'', '\'\\\'\'')}'`;
			await fs.writeFile(path.join(repo, 'scripts', 'code.sh'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(repo, 'index.js'))} "$@"\n`, { mode: 0o755 });
		}
		for (const [relative, content] of Object.entries({
			'User/settings.json': '{"editor.fontSize": 14}',
			'User/globalStorage/state.vscdb': 'synthetic auth state',
			'Local State': 'synthetic encryption state',
			'machineid': 'synthetic machine',
			'Network/Cookies': 'synthetic cookie',
			'logs/old.log': 'excluded',
		})) {
			await fs.mkdir(path.dirname(path.join(source, relative)), { recursive: true });
			await fs.writeFile(path.join(source, relative), content);
		}
		await fs.mkdir(shared, { recursive: true });
		await fs.writeFile(path.join(shared, 'seed'), 'synthetic shared state');

		await t.test('emits one readiness record only after CDP and waits for the application exit code', async () => {
			const launch = await start('lifetime');
			await waitUntil(() => existsSync(launch.startedFile));
			assert.equal(launch.stdout(), '');
			assert.equal(launch.child.exitCode, null);
			await fs.writeFile(launch.readyFile, '');
			const record = await launch.ready;
			assert.notEqual(record.userDataDir, source);
			assert.equal(path.dirname(record.runDir), runRoot);
			assert.equal(await fs.readFile(path.join(record.userDataDir, 'Network', 'Cookies'), 'utf8'), 'synthetic cookie');
			assert.equal(existsSync(path.join(record.userDataDir, 'logs', 'old.log')), false);
			assert.equal(await fs.readFile(path.join(source, 'User', 'settings.json'), 'utf8'), '{"editor.fontSize": 14}');
			const settings = JSON.parse(await fs.readFile(path.join(record.userDataDir, 'User', 'settings.json'), 'utf8'));
			assert.equal(settings['files.simpleDialog.enable'], true);
			assert.equal(settings['window.title'], 'Managed ＄ test${separator}${rootName}${separator}${appName}');
			const args: string[] = JSON.parse(await fs.readFile(launch.startedFile, 'utf8'));
			assert.ok(args.includes('--disable-workspace-trust'));
			assert.ok(args.includes('--extensionDevelopmentPath=extension & 100% with spaces'));
			assert.equal(args.at(-1), 'workspace with spaces');
			assert.equal(launch.child.exitCode, null);
			assert.equal(launch.stdout().trim().split('\n').length, 1);
			if (process.platform === 'win32') {
				assert.equal(await fs.readFile(path.join(record.sharedDataDir, 'seed'), 'utf8'), 'synthetic shared state');
			}
			await fs.writeFile(launch.exitFile, '');
			assert.equal(await launch.exited, 23, launch.stderr());
			assert.deepStrictEqual(await stop(record.runDir), { runDir: record.runDir, stopped: false, removed: true });
			assert.equal(existsSync(record.runDir), false);
		});

		await t.test('cleanup stops only the named run while another managed launch remains alive', async () => {
			const first = await start('first');
			const second = await start('second');
			await fs.writeFile(first.readyFile, '');
			await fs.writeFile(second.readyFile, '');
			const [firstRecord, secondRecord] = await Promise.all([first.ready, second.ready]);
			await stop(firstRecord.runDir);
			await first.exited;
			assert.equal(second.child.exitCode, null);
			process.kill(secondRecord.pid, 0);
			assert.equal(existsSync(secondRecord.userDataDir), true);
			await stop(secondRecord.runDir);
			await second.exited;
		});

		await t.test('early application exit fails without emitting readiness JSON', async () => {
			const launch = await start('early', ['--fixture-exit-before-ready']);
			await assert.rejects(launch.ready, /before readiness/);
			assert.equal(await launch.exited, 1);
			assert.equal(launch.stdout(), '');
		});

		await t.test('does not permit forwarded arguments to override run isolation', async () => {
			const launch = await start('override', ['--user-data-dir=somewhere-else']);
			await assert.rejects(launch.ready, /launcher owns --user-data-dir/);
			assert.equal(await launch.exited, 2);
			assert.equal(existsSync(launch.startedFile), false);
		});

		await t.test('cleanup refuses an unrelated directory even inside the run root', async () => {
			const unrelated = path.join(runRoot, 'unrelated');
			await fs.mkdir(unrelated, { recursive: true });
			await fs.writeFile(path.join(unrelated, 'keep'), 'not launcher-owned');
			const child = spawn(process.execPath, [cleanup, unrelated], { env, stdio: ['ignore', 'pipe', 'pipe'] });
			child.stdout!.resume();
			child.stderr!.resume();
			const [code] = await once(child, 'exit');
			assert.equal(code, 2);
			assert.equal(await fs.readFile(path.join(unrelated, 'keep'), 'utf8'), 'not launcher-owned');
		});
	} finally {
		for (const launch of launches) {
			await fs.writeFile(launch.exitFile, '');
		}
		for (const launch of launches) {
			await Promise.race([launch.exited, new Promise(resolve => setTimeout(resolve, 3000))]);
			if (launch.child.exitCode === null && launch.child.signalCode === null) {
				launch.child.kill();
			}
		}
		await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
	}
});

async function waitUntil(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 20_000;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, 'Timed out waiting for fake Code OSS to start');
		await new Promise(resolve => setTimeout(resolve, 25));
	}
}
