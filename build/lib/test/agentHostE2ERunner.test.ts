/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { stripTypeScriptTypes } from 'module';
import path from 'path';
import { PassThrough } from 'stream';
import { suite, test } from 'node:test';
import { setImmediate } from 'timers/promises';
import { runInNewContext } from 'vm';

const scriptDirectory = path.resolve(import.meta.dirname, '../../../scripts');
const runnerSource = stripTypeScriptTypes(readFileSync(path.join(scriptDirectory, 'test-agent-host-e2e.ts'), 'utf8'));
const e2eFiles = [
	'src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts',
	'src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts',
	'src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts',
	'src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts',
];
const nodeArguments = [
	'--runGlob', '**/*.integrationTest.js',
	'--excludeRunGlob', '**/agentHost/test/node/e2e/{providers/*AgentHostE2E,conformance/*}.integrationTest.js',
];

class TestChildProcess extends EventEmitter {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly command: string;
	readonly args: readonly string[];
	readonly env: NodeJS.ProcessEnv;
	readonly testArgs: readonly string[];
	closed = false;

	constructor(
		command: string,
		args: readonly string[],
		env: NodeJS.ProcessEnv,
		testArgs: readonly string[],
	) {
		super();
		this.command = command;
		this.args = args;
		this.env = env;
		this.testArgs = testArgs;
	}

	complete(code = 0, output = ''): void {
		assert(!this.closed);
		this.closed = true;
		this.stdout.end(output);
		this.stderr.end();
		this.emit('close', code, null);
	}
}

function runRunner(options: {
	args?: readonly string[];
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	parallelism?: number;
} = {}) {
	const children: TestChildProcess[] = [];
	const output: string[] = [];
	const files = new Map<string, string>();
	const platform = options.platform ?? 'linux';
	const state = {
		argv: ['node', path.join(scriptDirectory, 'test-agent-host-e2e.ts'), ...options.args ?? []],
		env: { VSCODE_SKIP_PRELAUNCH: '1', ...options.env },
		platform,
		hrtime: process.hrtime,
		exitCode: 0,
		stdout: { write: (value: string) => output.push(value) },
	};
	let active = 0;
	let maxActive = 0;

	const modules = new Map<string, object>([
		['child_process', {
			spawn: (command: string, args: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
				const testArgs = platform === 'win32' ? args.slice(args.indexOf('-File') + 3) : args;
				const child = new TestChildProcess(command, [...args], { ...options.env }, [...testArgs]);
				children.push(child);
				maxActive = Math.max(maxActive, ++active);
				child.once('close', () => active--);
				return child;
			},
			spawnSync: () => {
				throw new Error('Unexpected dependency installation or Electron download');
			},
		}],
		['fs', {
			existsSync: (file: string) => file.endsWith('node_modules') || files.has(file),
			mkdirSync: () => { },
			rmSync: (file: string) => files.delete(file),
			readFileSync: (file: string) => {
				const value = files.get(file);
				assert.notStrictEqual(value, undefined);
				return value;
			},
			writeFileSync: (file: string, value: string) => files.set(file, value),
		}],
		['os', {
			availableParallelism: () => options.parallelism ?? 8,
			cpus: () => Array.from({ length: options.parallelism ?? 8 }),
		}],
		['path', path],
	]);

	// Isolate the CommonJS CLI's dependencies without patching the test process's globals.
	const completion: Promise<void> = runInNewContext(runnerSource, {
		__dirname: scriptDirectory,
		require: (name: string) => {
			assert(modules.has(name), `Unexpected module: ${name}`);
			return modules.get(name);
		},
		process: state,
		console: {
			log: (...args: (string | Error)[]) => output.push(args.map(String).join(' ')),
			error: (...args: (string | Error)[]) => output.push(args.map(String).join(' ')),
		},
	});

	return {
		children,
		output,
		files,
		state,
		completion,
		get active() { return active; },
		get maxActive() { return maxActive; },
		async finish() {
			for (let index = 0; index < children.length; index++) {
				if (!children[index].closed) {
					children[index].complete();
				}
				await setImmediate();
			}
			await completion;
		},
	};
}

suite('Agent Host E2E runner', () => {
	for (const platform of ['linux', 'darwin', 'win32'] as const) {
		test(`fills the first freed worker with remaining node tests on ${platform}`, async t => {
			const runner = runRunner({
				platform,
				args: ['--include-node-tests', '--tfs', 'Integration Tests', '--grep', 'test with spaces', '--timeout', '12000'],
				env: { ELECTRON_RUN_AS_NODE: '1' },
			});
			t.after(() => runner.finish());

			const initialFiles = runner.children.map(child => child.testArgs[1]);
			await setImmediate();
			assert.strictEqual(runner.children.length, 4);
			runner.children[2].complete();
			await setImmediate();

			assert.deepStrictEqual({
				initialFiles,
				active: runner.active,
				maxActive: runner.maxActive,
				started: runner.children.length,
				remainingArgs: runner.children[4].testArgs,
				reportNames: runner.children.map(child => child.testArgs[child.testArgs.indexOf('--tfs') + 1]),
				childEnvironment: runner.children.map(child => [child.env.VSCODE_SKIP_PRELAUNCH, child.env.ELECTRON_RUN_AS_NODE]),
				windowsWrappers: runner.children.every(child => platform !== 'win32' || (
					child.command.endsWith('powershell.exe')
					&& child.args.includes(path.join(scriptDirectory, 'test-agent-host-e2e-child.ps1'))
					&& child.args.includes(path.join(scriptDirectory, child.testArgs[0] === '--runGlob' ? 'test.bat' : 'test-integration.bat'))
				)),
			}, {
				initialFiles: e2eFiles,
				active: 4,
				maxActive: 4,
				started: 5,
				remainingArgs: [...nodeArguments, '--tfs', 'Integration Tests', '--grep', 'test with spaces', '--timeout', '12000'],
				reportNames: ['Integration Tests Conformance', 'Integration Tests Claude', 'Integration Tests Codex', 'Integration Tests Copilot', 'Integration Tests'],
				childEnvironment: Array.from({ length: 5 }, () => ['1', undefined]),
				windowsWrappers: true,
			});

			await runner.finish();
			assert.strictEqual(runner.state.exitCode, 0);
		});
	}

	for (const { args, env, parallelism, workers } of [
		{ args: ['--jobs=99'], env: {}, parallelism: 16, workers: 4 },
		{ args: [], env: {}, parallelism: 2, workers: 2 },
		{ args: ['--jobs', '1'], env: { AGENT_HOST_E2E_JOBS: '3' }, parallelism: 8, workers: 1 },
		{ args: [], env: { AGENT_HOST_E2E_JOBS: '3' }, parallelism: 8, workers: 3 },
	]) {
		test(`keeps the requested worker bound (${workers}, ${JSON.stringify(args)})`, async t => {
			const runner = runRunner({ args: ['--include-node-tests', ...args], env, parallelism });
			t.after(() => runner.finish());
			const initialCount = runner.children.length;
			await runner.finish();
			assert.deepStrictEqual({
				initialCount,
				maxActive: runner.maxActive,
				selections: runner.children.map(child => child.testArgs.slice(0, 2)),
				exitCode: runner.state.exitCode,
			}, {
				initialCount: workers,
				maxActive: workers,
				selections: [...e2eFiles.map(file => ['--run', file]), nodeArguments.slice(0, 2)],
				exitCode: 0,
			});
		});
	}

	test('keeps standalone E2E invocation unchanged', async t => {
		const runner = runRunner({ env: { VSCODE_SKIP_AGENT_HOST_E2E: '1' } });
		t.after(() => runner.finish());
		await runner.finish();
		assert.deepStrictEqual({
			files: runner.children.map(child => child.testArgs[1]),
			exitCode: runner.state.exitCode,
			summary: runner.output.some(line => line.includes('Agent Host E2E suites completed')),
		}, { files: e2eFiles, exitCode: 0, summary: true });
	});

	test('runs only the remaining node tests when E2E tests are unaffected', async t => {
		const runner = runRunner({
			args: ['--include-node-tests', '--tfs', 'Integration Tests'],
			env: { VSCODE_SKIP_AGENT_HOST_E2E: '1' },
		});
		t.after(() => runner.finish());
		await runner.finish();
		assert.deepStrictEqual({
			args: runner.children.map(child => child.testArgs),
			maxActive: runner.maxActive,
			exitCode: runner.state.exitCode,
			skipped: runner.output.some(line => line.includes('Skipping Agent Host E2E tests')),
		}, {
			args: [[...nodeArguments, '--tfs', 'Integration Tests']],
			maxActive: 1,
			exitCode: 0,
			skipped: true,
		});
	});

	for (const failingGroup of ['e2e', 'node']) {
		test(`waits for all groups and reports a ${failingGroup} failure`, async t => {
			const runner = runRunner({ args: ['--include-node-tests'] });
			t.after(() => runner.finish());
			runner.children[0].complete(failingGroup === 'e2e' ? 17 : 0, failingGroup === 'e2e' ? '1 failing\nE2E failure\n' : '');
			await setImmediate();
			runner.children[4].complete(failingGroup === 'node' ? 17 : 0, failingGroup === 'node' ? '1 failing\nNode failure\n' : '');
			await setImmediate();
			const beforeJoining = { active: runner.active, exitCode: runner.state.exitCode };
			await runner.finish();
			assert.deepStrictEqual({
				beforeJoining,
				groups: runner.children.length,
				exitCode: runner.state.exitCode,
				failureSummary: runner.output.some(line => line.includes('failure details:')),
				exitStatus: runner.output.some(line => line.includes('failed with code 17')),
			}, {
				beforeJoining: { active: 3, exitCode: 0 },
				groups: 5,
				exitCode: 1,
				failureSummary: true,
				exitStatus: true,
			});
		});
	}

	test('propagates a child spawn failure', async t => {
		const runner = runRunner({ args: ['--include-node-tests'] });
		t.after(() => runner.finish());
		runner.children[0].emit('error', new Error('Unable to spawn test process'));
		runner.children[0].complete(1);
		await runner.finish();
		assert.deepStrictEqual({
			groups: runner.children.length,
			exitCode: runner.state.exitCode,
			spawnError: runner.output.some(line => line.includes('Unable to spawn test process')),
		}, { groups: 5, exitCode: 1, spawnError: true });
	});

	test('keeps protocol surface output scoped to the E2E entrypoints', async t => {
		const combinedOutput = path.join(scriptDirectory, 'observed.json');
		const runner = runRunner({
			args: ['--include-node-tests'],
			env: {
				AGENT_HOST_RECORD_PROTOCOL_SURFACE: '1',
				AGENT_HOST_PROTOCOL_SURFACE_OUT: combinedOutput,
				AGENT_HOST_E2E_COVERAGE: '1',
			},
		});
		t.after(() => runner.finish());
		for (const [index, child] of runner.children.entries()) {
			const output = child.env.AGENT_HOST_PROTOCOL_SURFACE_OUT;
			assert(output);
			runner.files.set(output, JSON.stringify({ commands: [`command-${index}`], notifications: [], actions: [] }));
		}
		runner.children[2].complete();
		await setImmediate();
		const remaining = runner.children[4];
		await runner.finish();
		assert.deepStrictEqual({
			remainingSurfaceEnvironment: [remaining.env.AGENT_HOST_RECORD_PROTOCOL_SURFACE, remaining.env.AGENT_HOST_PROTOCOL_SURFACE_OUT],
			files: [...runner.files.keys()],
			combined: JSON.parse(runner.files.get(combinedOutput)!),
			exitCode: runner.state.exitCode,
		}, {
			remainingSurfaceEnvironment: [undefined, undefined],
			files: [combinedOutput],
			combined: { commands: ['command-0', 'command-1', 'command-2', 'command-3'], notifications: [], actions: [] },
			exitCode: 0,
		});
	});

	for (const args of [['--jobs', '0'], ['--jobs=-1'], ['--jobs=1.5'], ['--jobs=invalid'], ['--jobs'], ['--run', 'test.ts'], ['--testSplit', '1/2']]) {
		test(`rejects invalid scheduler arguments: ${args.join(' ')}`, async () => {
			const runner = runRunner({ args: ['--include-node-tests', ...args] });
			await runner.completion;
			assert.deepStrictEqual({ children: runner.children.length, exitCode: runner.state.exitCode }, { children: 0, exitCode: 1 });
		});
	}

	for (const flag of ['AGENT_HOST_REPLAY_RECORD', 'AGENT_HOST_UPDATE_AHP_SNAPSHOTS', 'AGENT_HOST_UPDATE_SNAPSHOTS']) {
		test(`rejects recording mode: ${flag}`, async () => {
			const runner = runRunner({ args: ['--include-node-tests'], env: { [flag]: '1' } });
			await runner.completion;
			assert.deepStrictEqual({
				children: runner.children.length,
				exitCode: runner.state.exitCode,
				diagnostic: runner.output.some(line => line.includes(`unset ${flag}`)),
			}, { children: 0, exitCode: 1, diagnostic: true });
		});
	}
});
