/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import { homedir } from 'os';
import { PassThrough } from 'stream';
import * as sinon from 'sinon';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CodeTunnelCli, CodeTunnelCliOutput, CodeTunnelSpawn, resolveTunnelCommandLocation } from '../../node/codeTunnelCliProcess.js';

interface TestChildProcess {
	readonly child: ChildProcess;
	readonly stdout: PassThrough;
	readonly stderr: PassThrough;
	readonly kill: sinon.SinonSpy;
}

interface SpawnCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: SpawnOptions;
	readonly process: TestChildProcess;
}

function createTestChildProcess(pid = 123): TestChildProcess {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const kill = sinon.spy();
	const child = Object.assign(new EventEmitter(), { pid, stdout, stderr, kill }) as unknown as ChildProcess;
	return { child, stdout, stderr, kill };
}

function createTestCli(isBuilt: boolean, appRoot = join('installation', 'resources', 'app')): { cli: CodeTunnelCli; spawnCalls: SpawnCall[] } {
	const spawnCalls: SpawnCall[] = [];
	const spawn: CodeTunnelSpawn = (command, args, options) => {
		const process = createTestChildProcess();
		spawnCalls.push({ command, args, options, process });
		return process.child;
	};
	return { cli: new CodeTunnelCli({ appRoot, isBuilt, tunnelApplicationName: 'code-tunnel', win32VersionedUpdate: false, spawn }), spawnCalls };
}

suite('CodeTunnelCli', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('resolves command locations for supported installation layouts', () => {
		const macAppRoot = join('installation', 'mac', 'Contents', 'Resources', 'app');
		const windowsAppRoot = join('installation', 'windows', 'resources', 'app');
		const versionedWindowsAppRoot = join('installation', 'versioned-windows', '1.0.0', 'resources', 'app');
		const linuxAppRoot = join('installation', 'linux', 'resources', 'app');

		assert.deepStrictEqual([
			resolveTunnelCommandLocation(macAppRoot, 'darwin', 'code-tunnel', false),
			resolveTunnelCommandLocation(windowsAppRoot, 'win32', 'code-tunnel', false),
			resolveTunnelCommandLocation(versionedWindowsAppRoot, 'win32', 'code-tunnel', true),
			resolveTunnelCommandLocation(linuxAppRoot, 'linux', 'code-tunnel', false),
		], [
			join(macAppRoot, 'bin', 'code-tunnel'),
			join('installation', 'windows', 'bin', 'code-tunnel.exe'),
			join('installation', 'versioned-windows', 'bin', 'code-tunnel.exe'),
			join('installation', 'linux', 'bin', 'code-tunnel'),
		]);
	});

	test('uses built and source CLI invocation locations', async () => {
		const appRoot = join('installation', 'resources', 'app');
		const built = createTestCli(true, appRoot);
		const source = createTestCli(false, appRoot);
		const builtRun = built.cli.run('built', ['tunnel', '--name', 'host'], () => { });
		const sourceRun = source.cli.run('source', ['tunnel', '--name', 'host'], () => { });

		built.spawnCalls[0].process.child.emit('exit', 0);
		source.spawnCalls[0].process.child.emit('exit', 0);
		await Promise.all([builtRun.result, sourceRun.result]);

		assert.deepStrictEqual([
			{
				command: built.spawnCalls[0].command,
				args: built.spawnCalls[0].args,
				cwd: built.spawnCalls[0].options.cwd,
			},
			{
				command: source.spawnCalls[0].command,
				args: source.spawnCalls[0].args,
				cwd: source.spawnCalls[0].options.cwd,
			},
		], [
			{
				command: built.cli.commandLocation,
				args: ['tunnel', '--name', 'host'],
				cwd: homedir(),
			},
			{
				command: 'cargo',
				args: ['run', '--', 'tunnel', '--name', 'host'],
				cwd: join(appRoot, 'cli'),
			},
		]);
	});

	test('splits standard output and error output into lines', async () => {
		const { cli, spawnCalls } = createTestCli(true);
		const output: { message: string; isError: boolean }[] = [];
		const onOutput: CodeTunnelCliOutput = (message, isError) => output.push({ message, isError });
		const run = cli.run('serve', ['tunnel', '--name', 'host'], onOutput);
		const process = spawnCalls[0].process;

		process.stdout.write('standard one\nstandard two\n');
		process.stderr.write('error one\nerror two\n');
		process.child.emit('exit', 7);

		assert.deepStrictEqual({ result: await run.result, output }, {
			result: 7,
			output: [
				{ message: 'Running tunnel CLI\n', isError: false },
				{ message: `serve Spawning: ${cli.commandLocation} tunnel --name host\n`, isError: false },
				{ message: 'standard one\n', isError: false },
				{ message: 'standard two\n', isError: false },
				{ message: 'error one\n', isError: true },
				{ message: 'error two\n', isError: true },
				{ message: 'serve exit(123): + 7 ', isError: false },
			],
		});
	});

	test('rejects with the underlying spawn error', async () => {
		const { cli, spawnCalls } = createTestCli(true);
		const run = cli.run('serve', ['tunnel', '--name', 'host'], () => { });
		const spawnError = new Error('spawn code-tunnel ENOENT');

		spawnCalls[0].process.child.emit('error', spawnError);

		// An undefined rejection loses the actionable cause, such as a missing
		// or non-executable tunnel binary.
		await assert.rejects(run.result, (error: unknown) => error === spawnError);
	});

	test('kills the CLI process when cancelled', async () => {
		const logs: string[] = [];
		const spawnCalls: SpawnCall[] = [];
		const spawn: CodeTunnelSpawn = (command, args, options) => {
			const process = createTestChildProcess();
			spawnCalls.push({ command, args, options, process });
			return process.child;
		};
		const cli = new CodeTunnelCli({ appRoot: join('installation', 'resources', 'app'), isBuilt: true, tunnelApplicationName: 'code-tunnel', win32VersionedUpdate: false, spawn, onLog: message => logs.push(message) });
		const run = cli.run('serve', ['tunnel'], () => { });

		run.result.cancel();
		await assert.rejects(run.result);
		spawnCalls[0].process.child.emit('exit', null);

		assert.deepStrictEqual({ killCalls: spawnCalls[0].process.kill.callCount, logs }, {
			killCalls: 1,
			logs: ['serve terminating(123)'],
		});
	});

	test('waits for actual process exit when stopped', async () => {
		const { cli, spawnCalls } = createTestCli(true);
		const run = cli.run('serve', ['tunnel'], () => { });
		let stopped = false;
		const stop = run.stop().then(() => stopped = true);

		assert.deepStrictEqual({ killCalls: spawnCalls[0].process.kill.callCount, stopped }, { killCalls: 1, stopped: false });
		spawnCalls[0].process.child.emit('exit', null);
		await stop;
		assert.strictEqual(stopped, true);
	});
});
