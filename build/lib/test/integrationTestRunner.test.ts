/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { suite, test, type TestContext } from 'node:test';

const scriptDirectory = path.resolve(import.meta.dirname, '../../../scripts');

interface ITestCall {
	readonly phase: 'node' | 'extension';
	readonly args: readonly string[];
}

function runIntegrationScript(t: TestContext, options: {
	args?: readonly string[];
	parallel?: boolean;
	skipE2E?: boolean;
	failNode?: boolean;
}) {
	const root = mkdtempSync(path.join(tmpdir(), 'vscode-integration-runner-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const scripts = path.join(root, 'scripts');
	const temporaryDirectory = path.join(root, 'tmp');
	const callsDirectory = path.join(root, 'calls');
	for (const directory of [scripts, temporaryDirectory, callsDirectory, path.join(root, 'node_modules')]) {
		mkdirSync(directory);
	}
	for (const file of ['package.json', 'test-agent-host-e2e.ts', 'test-agent-host-e2e-child.ps1', 'test-integration.bat', 'test-integration.sh']) {
		copyFileSync(path.join(scriptDirectory, file), path.join(scripts, file));
	}
	chmodSync(path.join(scripts, 'test-integration.sh'), 0o755);
	writeFileSync(path.join(scripts, 'runner-fixture.cjs'), `
const fs = require('fs');
const path = require('path');
const phase = process.argv[2];
const args = process.argv.slice(3);
fs.writeFileSync(path.join(__dirname, '..', 'calls', process.pid + '.json'), JSON.stringify({ phase, args }));
process.exit(phase === 'extension' ? 23 : process.env.FAIL_NODE === '1' && args.includes('--runGlob') ? 17 : 0);
`);
	for (const [name, phase] of [['test', 'node'], ['code', 'extension']]) {
		writeFileSync(path.join(scripts, `${name}.bat`), `@echo off\r\nnode "%~dp0runner-fixture.cjs" ${phase} %*\r\nexit /b %errorlevel%\r\n`);
		writeFileSync(path.join(scripts, `${name}.sh`), `#!/usr/bin/env bash\nexec node "$(dirname "$0")/runner-fixture.cjs" ${phase} "$@"\n`, { mode: 0o755 });
	}
	const env: NodeJS.ProcessEnv = {
		...process.env,
		TEMP: temporaryDirectory,
		TMP: temporaryDirectory,
		TMPDIR: temporaryDirectory,
		VSCODE_SKIP_PRELAUNCH: '1',
		VSCODE_PARALLEL_NODE_INTEGRATION_TESTS: options.parallel === false ? '0' : '1',
		VSCODE_SKIP_AGENT_HOST_E2E: options.skipE2E ? '1' : '0',
		AGENT_HOST_E2E_JOBS: '4',
		FAIL_NODE: options.failNode ? '1' : '0',
		INTEGRATION_TEST_ELECTRON_PATH: '',
	};
	for (const name of [
		'ELECTRON_RUN_AS_NODE',
		'AGENT_HOST_REPLAY_RECORD',
		'AGENT_HOST_UPDATE_AHP_SNAPSHOTS',
		'AGENT_HOST_UPDATE_SNAPSHOTS',
		'AGENT_HOST_RECORD_PROTOCOL_SURFACE',
		'AGENT_HOST_PROTOCOL_SURFACE_OUT',
		'AGENT_HOST_E2E_COVERAGE',
	]) {
		delete env[name];
	}
	const args = options.args ?? ['--tfs', 'Integration Tests', '--grep', 'test with spaces'];
	const script = path.join(scripts, process.platform === 'win32' ? 'test-integration.bat' : 'test-integration.sh');
	const result = process.platform === 'win32'
		? spawnSync(path.join(process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
			'-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
			'-File', path.join(scripts, 'test-agent-host-e2e-child.ps1'), script, ...args,
		], {
			cwd: root, env, encoding: 'utf8', timeout: 30_000,
		})
		: spawnSync(script, args, { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
	assert.ifError(result.error);
	const calls: ITestCall[] = readdirSync(callsDirectory).map(file => JSON.parse(readFileSync(path.join(callsDirectory, file), 'utf8')));
	return { ...result, calls, temporaryDirectories: readdirSync(temporaryDirectory) };
}

suite('Integration test entrypoint', () => {
	test('runs all five node groups before starting extension host tests', t => {
		const result = runIntegrationScript(t, {});
		const nodeCalls = result.calls.filter(call => call.phase === 'node');
		const remaining = nodeCalls.find(call => call.args.includes('--runGlob'));
		assert.deepStrictEqual({
			status: result.status,
			e2eCount: nodeCalls.filter(call => call.args.includes('--run')).length,
			nodeCount: nodeCalls.filter(call => call.args.includes('--runGlob')).length,
			extensionCount: result.calls.filter(call => call.phase === 'extension').length,
			remainingArgs: remaining?.args,
		}, {
			status: 23,
			e2eCount: 4,
			nodeCount: 1,
			extensionCount: 1,
			remainingArgs: [
				'--runGlob', '**/*.integrationTest.js',
				'--excludeRunGlob', '**/agentHost/test/node/e2e/{providers/*AgentHostE2E,conformance/*}.integrationTest.js',
				'--tfs', 'Integration Tests', '--grep', 'test with spaces',
			],
		}, result.stdout + result.stderr);
	});

	test('does not start extension host tests after the remaining node group fails', t => {
		const result = runIntegrationScript(t, { failNode: true });
		assert.deepStrictEqual({
			status: result.status,
			nodeCount: result.calls.filter(call => call.phase === 'node').length,
			extensionCount: result.calls.filter(call => call.phase === 'extension').length,
			cleanedUp: process.platform !== 'win32' || result.temporaryDirectories.length === 0,
		}, { status: 1, nodeCount: 5, extensionCount: 0, cleanedUp: true }, result.stdout + result.stderr);
	});

	test('preserves the unaffected-E2E skip without skipping other tests', t => {
		const result = runIntegrationScript(t, { skipE2E: true });
		assert.deepStrictEqual({
			status: result.status,
			nodeSelections: result.calls.filter(call => call.phase === 'node').map(call => call.args[0]),
			extensionCount: result.calls.filter(call => call.phase === 'extension').length,
		}, { status: 23, nodeSelections: ['--runGlob'], extensionCount: 1 }, result.stdout + result.stderr);
	});

	test('keeps the serial node phase for callers without the opt-in', t => {
		const result = runIntegrationScript(t, { parallel: false });
		assert.deepStrictEqual({
			status: result.status,
			e2eCount: result.calls.filter(call => call.args.includes('--run')).length,
			nodeCount: result.calls.filter(call => call.args.includes('--runGlob')).length,
			extensionCount: result.calls.filter(call => call.phase === 'extension').length,
		}, { status: 23, e2eCount: 4, nodeCount: 1, extensionCount: 1 }, result.stdout + result.stderr);
	});

	for (const args of [
		['--run', 'src/example.integrationTest.ts', '--grep', 'test with spaces'],
		['--runGlob', '**/*.integrationTest.js'],
		['--glob', '**/*.integrationTest.js'],
		['--runGrep', '**/*.integrationTest.js'],
	]) {
		test(`preserves file filtering with ${args[0]}`, t => {
			const result = runIntegrationScript(t, { args });
			assert.deepStrictEqual({ status: result.status, calls: result.calls }, {
				status: 0,
				calls: [{ phase: 'node', args }],
			}, result.stdout + result.stderr);
		});
	}

	test('does not run node tests for an extension suite filter', t => {
		const result = runIntegrationScript(t, { args: ['--suite', 'api-folder'] });
		assert.deepStrictEqual({
			status: result.status,
			phases: result.calls.map(call => call.phase),
		}, { status: 23, phases: ['extension'] }, result.stdout + result.stderr);
	});
});
