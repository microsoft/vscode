/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';

/**
 * A temporary repository with the Agent Host E2E runner, an integration test script that passes every suite, and a
 * prepared Electron runtime whose `electron` script records each preparation in `.build/preparations`.
 */
interface IRunnerRepository {
	/** The Electron executable, relative to the repository. */
	readonly executable: string;
	/** Runs the Agent Host E2E runner in the repository and returns its output; throws when it fails. */
	run(extra?: NodeJS.ProcessEnv, args?: readonly string[]): string;
}

async function createRunnerRepository(repoRoot: string): Promise<IRunnerRepository> {
	const sourceRoot = path.resolve(import.meta.dirname, '../..');
	for (const directory of ['scripts', 'test/integration/agentHost', 'build/lib', 'node_modules', '.build/electron']) {
		await fs.mkdir(path.join(repoRoot, directory), { recursive: true });
	}
	for (const file of [
		'test/integration/agentHost/runner.ts',
		'test/integration/agentHost/child.ps1',
		'build/lib/electronVersion.ts',
		'src/vs/platform/agentHost/test/node/agentHostTestProfile.ts',
	]) {
		await fs.mkdir(path.dirname(path.join(repoRoot, file)), { recursive: true });
		await fs.copyFile(path.join(sourceRoot, file), path.join(repoRoot, file));
	}
	await fs.writeFile(path.join(repoRoot, 'test/integration/agentHost/package.json'), '{"type":"commonjs"}');
	await fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({
		type: 'module', scripts: { electron: 'node setup-electron.ts' },
	}));
	await fs.writeFile(path.join(repoRoot, '.npmrc'), 'target="42.9.3"\nms_build_id="test"\n');
	await fs.writeFile(path.join(repoRoot, 'product.json'), JSON.stringify({
		nameLong: 'Code - OSS', nameShort: 'Code - OSS', applicationName: 'code-oss',
	}));
	const executable = process.platform === 'darwin'
		? '.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS'
		: process.platform === 'win32' ? '.build/electron/Code - OSS.exe' : '.build/electron/code-oss';
	await fs.mkdir(path.dirname(path.join(repoRoot, executable)), { recursive: true });
	await fs.writeFile(path.join(repoRoot, executable), 'runtime', { mode: 0o755 });
	await fs.writeFile(path.join(repoRoot, '.build/electron/version'), '42.9.3');
	await fs.writeFile(path.join(repoRoot, 'setup-electron.ts'), `
		import { appendFileSync, writeFileSync } from 'node:fs';
		appendFileSync('.build/preparations', 'prepared\\n');
		writeFileSync(${JSON.stringify(executable)}, 'runtime', { mode: 0o755 });
		writeFileSync('.build/electron/version', '42.9.3');
	`);
	const testScript = process.platform === 'win32' ? 'scripts/test-integration.bat' : 'scripts/test-integration.sh';
	await fs.writeFile(path.join(repoRoot, testScript), process.platform === 'win32'
		? '@echo off\r\necho 1 passing\r\nexit /b 0\r\n'
		: '#!/usr/bin/env bash\necho "1 passing"\n', { mode: 0o755 });
	const environment: NodeJS.ProcessEnv = {
		...process.env,
		AGENT_HOST_REPLAY_RECORD: '',
		AGENT_HOST_UPDATE_AHP_SNAPSHOTS: '',
		AGENT_HOST_UPDATE_SNAPSHOTS: '',
		AGENT_HOST_PROTOCOL_SURFACE_OUT: '',
		AGENT_HOST_TEST_PROFILE: undefined,
		AGENT_HOST_TEST_PROFILE_REASON: undefined,
		VSCODE_SKIP_PRELAUNCH: '',
		VSCODE_FORCE_PRELAUNCH: '',
		ELECTRON_RUN_AS_NODE: '',
	};
	return {
		executable,
		run: (extra = {}, args = []) => execFileSync(process.execPath, ['test/integration/agentHost/runner.ts', '--storage', 'disk', '--jobs', '1', ...args], {
			cwd: repoRoot, env: { ...environment, ...extra }, encoding: 'utf8',
		}),
	};
}

async function exists(file: string): Promise<boolean> {
	try {
		await fs.stat(file);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
		return false;
	}
}

test('Agent Host E2E startup reuses, repairs, forces and explicitly skips Electron preparation', async () => {
	const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-e2e-startup-'));
	try {
		const { executable, run } = await createRunnerRepository(repoRoot);
		const firstRun = run();
		const firstPreparationMissing = !await exists(path.join(repoRoot, '.build/preparations'));
		await fs.rm(path.join(repoRoot, executable));
		run();
		run({ VSCODE_FORCE_PRELAUNCH: '1' });
		run({ VSCODE_SKIP_PRELAUNCH: '1', VSCODE_FORCE_PRELAUNCH: '1' });
		const prRun = run({ AGENT_HOST_TEST_PROFILE: 'pr', VSCODE_SKIP_PRELAUNCH: '1' });
		assert.deepStrictEqual({
			reused: firstPreparationMissing,
			suitesPassed: (firstRun.match(/PASS /g) ?? []).length,
			defaultFullProfile: firstRun.includes('Agent Host test profile: full (default)'),
			prProfile: prRun.includes('Agent Host test profile: pr (default)'),
			preparations: await fs.readFile(path.join(repoRoot, '.build/preparations'), 'utf8'),
		}, { reused: true, suitesPassed: 6, defaultFullProfile: true, prProfile: true, preparations: 'prepared\nprepared\n' });
	} finally {
		await fs.rm(repoRoot, { recursive: true, force: true });
	}
});

test('Agent Host E2E runs only the suites that a --runList file lists, and prepares nothing when it lists none', async () => {
	const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-e2e-run-list-'));
	try {
		const { executable, run } = await createRunnerRepository(repoRoot);
		// The test plan lists the files as `src/` paths; also with Windows line endings and separators, empty lines
		// and unit test files.
		await fs.writeFile(path.join(repoRoot, 'two.txt'), [
			'src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts',
			'src\\vs\\platform\\agentHost\\test\\node\\e2e\\conformance\\agentHostConformance.integrationTest.ts',
			'',
			'src/vs/base/test/common/strings.test.ts',
		].join('\r\n'));
		await fs.writeFile(path.join(repoRoot, 'none.txt'), 'src/vs/platform/agentHost/test/node/protocol/handshake.integrationTest.ts\n');
		const twoListed = run({}, ['--runList', 'two.txt']);
		// Without the runtime, a run that prepares it records a preparation.
		await fs.rm(path.join(repoRoot, executable));
		const noneListed = run({}, ['--runList=none.txt']);
		assert.deepStrictEqual({
			suitesPassed: [...twoListed.matchAll(/^ {2}PASS (?<suite>[^:]+):/gm)].map(match => match.groups!.suite),
			noneListed: noneListed.includes('None of the 6 Agent Host E2E suites is listed in'),
			prepared: await exists(path.join(repoRoot, '.build/preparations')),
		}, { suitesPassed: ['Conformance', 'Claude'], noneListed: true, prepared: false });
	} finally {
		await fs.rm(repoRoot, { recursive: true, force: true });
	}
});

test('Agent Host E2E shards take the listed suites in turn, and a shard without suites prepares nothing', async () => {
	const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-e2e-shard-'));
	try {
		const { executable, run } = await createRunnerRepository(repoRoot);
		await fs.writeFile(path.join(repoRoot, 'three.txt'), [
			'src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts',
			'src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts',
			'src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts',
		].join('\n'));
		await fs.writeFile(path.join(repoRoot, 'one.txt'), 'src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts\n');
		const passed = (output: string) => [...output.matchAll(/^ {2}PASS (?<suite>[^:]+):/gm)].map(match => match.groups!.suite);
		const everySuite = run({}, ['--shard', '2/2']);
		const firstListed = run({}, ['--shard', '1/2', '--runList', 'three.txt']);
		const secondListed = run({}, ['--shard=2/2', '--runList', 'three.txt']);
		// Without the runtime, a run that prepares it records a preparation.
		await fs.rm(path.join(repoRoot, executable));
		const emptyShard = run({}, ['--shard', '2/2', '--runList', 'one.txt']);
		assert.deepStrictEqual({
			everySuite: passed(everySuite),
			firstListed: passed(firstListed),
			secondListed: passed(secondListed),
			emptyShard: emptyShard.includes('Agent Host E2E shard 2/2 has none of the 1 selected suites.'),
			prepared: await exists(path.join(repoRoot, '.build/preparations')),
		}, {
			everySuite: ['Claude', 'Copilot', 'Copilot managed settings'],
			firstListed: ['Conformance', 'Copilot'],
			secondListed: ['Claude'],
			emptyShard: true,
			prepared: false,
		});
	} finally {
		await fs.rm(repoRoot, { recursive: true, force: true });
	}
});
