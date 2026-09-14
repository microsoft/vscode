/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, test } from 'node:test';
import { ApplicationOptions } from '../application';
import { EMPTY_WORKBENCH_COLD_START_STORY, runEmptyWorkbenchColdStart, validateEmptyWorkbenchColdStartRequest } from './emptyWorkbenchColdStart';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const path of temporaryDirectories.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

test('validates the v1 request and preserves ordered launch arguments', () => {
	const root = createAppRoot();
	const request = validateEmptyWorkbenchColdStartRequest({
		schemaVersion: 1,
		story: EMPTY_WORKBENCH_COLD_START_STORY,
		runId: 'run-1',
		appRoot: root,
		electronExecutable: join(root, 'electron.exe'),
		userDataDir: join(root, 'profile'),
		extensionsDir: join(root, 'extensions'),
		artifactsDir: join(root, 'artifacts'),
		timeoutMs: 30_000,
		env: { BENCHMARK: '1' },
		launchArgs: ['--trace-startup-file=trace.json', '--js-flags=--logfile=v8.log']
	});

	assert.deepStrictEqual(request.launchArgs, ['--trace-startup-file=trace.json', '--js-flags=--logfile=v8.log']);
});

test('rejects launch arguments that override isolated profile directories', () => {
	const root = createAppRoot();
	assert.throws(() => validateEmptyWorkbenchColdStartRequest({
		schemaVersion: 1,
		story: EMPTY_WORKBENCH_COLD_START_STORY,
		runId: 'run-1',
		appRoot: root,
		userDataDir: join(root, 'profile'),
		extensionsDir: join(root, 'extensions'),
		artifactsDir: join(root, 'artifacts'),
		timeoutMs: 30_000,
		env: {},
		launchArgs: ['--user-data-dir=other']
	}), /cannot override/);
});

test('emits monotonic phase timings and runtime metadata with a fake launch', async () => {
	const root = createAppRoot();
	writeFileSync(join(root, 'out', 'main.js'), '');
	const request = validateEmptyWorkbenchColdStartRequest({
		schemaVersion: 1,
		story: EMPTY_WORKBENCH_COLD_START_STORY,
		runId: 'run-1',
		appRoot: root,
		userDataDir: join(root, 'profile'),
		extensionsDir: join(root, 'extensions'),
		artifactsDir: join(root, 'artifacts'),
		timeoutMs: 30_000,
		env: {},
		launchArgs: [
			'--trace-perfetto-config-file=perfetto.json',
			'--trace-startup-file=trace.json',
			'--js-flags=--logfile=v8.log',
			'--enable-features=BenchmarkFeature'
		]
	});
	const clock = createClock();
	let launchOptions: ApplicationOptions | undefined;
	const result = await runEmptyWorkbenchColdStart(request, join(root, 'story.log'), {
		now: clock.now,
		launch: async options => {
			launchOptions = options;
			options.electronLaunchObserver?.onProcessSpawn?.({ pid: 42 } as ChildProcess);
			options.electronLaunchObserver?.onFirstWindow?.();
			return {
				didFinishLoad: async () => clock.advance(),
				whenWorkbenchRestored: async () => clock.advance(),
				exit: async () => undefined,
				driver: {
					waitForElement: async () => clock.advance(),
					getElectronProcessVersions: async () => ({ electron: '46.0.0', chrome: '146.0.0', node: '24.0.0', v8: '14.6' })
				}
			};
		}
	});

	assert.deepStrictEqual({
		status: result.status,
		valid: result.valid,
		phaseNames: Object.keys(result.phases),
		phaseShapes: Object.values(result.phases).map(value => ({
			nonNegative: value.startTimeMs >= 0,
			ordered: value.endTimeMs >= value.startTimeMs,
			duration: value.durationMs === value.endTimeMs - value.startTimeMs
		})),
		metadata: result.metadata,
		launchArgs: launchOptions?.extraArgs,
		launchEnv: launchOptions?.extraEnv
	}, {
		status: 'success',
		valid: true,
		phaseNames: ['processSpawn', 'firstWindow', 'didFinishLoad', 'monacoWorkbench', 'workbenchRestored'],
		phaseShapes: [
			{ nonNegative: true, ordered: true, duration: true },
			{ nonNegative: true, ordered: true, duration: true },
			{ nonNegative: true, ordered: true, duration: true },
			{ nonNegative: true, ordered: true, duration: true },
			{ nonNegative: true, ordered: true, duration: true }
		],
		metadata: {
			app: { name: 'code-oss-dev', version: '1.2.3' },
			electron: '46.0.0',
			chromium: '146.0.0',
			node: '24.0.0',
			v8: '14.6'
		},
		launchArgs: [
			'--new-window',
			'--disable-extensions',
			'--skip-add-to-recently-opened',
			'--trace-perfetto-config-file=perfetto.json',
			'--trace-startup-file=trace.json',
			'--js-flags=--logfile=v8.log',
			'--enable-features=BenchmarkFeature'
		],
		launchEnv: {
			ELECTRON_RUN_AS_NODE: undefined,
			VSCODE_CLI: '1',
			VSCODE_DEV: '1',
			VSCODE_REPOSITORY: root
		}
	});
});

test('reports an Electron process exit during launch', async () => {
	const root = createAppRoot();
	writeFileSync(join(root, 'out', 'main.js'), '');
	const request = validateEmptyWorkbenchColdStartRequest({
		schemaVersion: 1,
		story: EMPTY_WORKBENCH_COLD_START_STORY,
		runId: 'run-exit',
		appRoot: root,
		userDataDir: join(root, 'profile'),
		extensionsDir: join(root, 'extensions'),
		artifactsDir: join(root, 'artifacts'),
		timeoutMs: 30_000,
		env: {},
		launchArgs: []
	});
	const result = await runEmptyWorkbenchColdStart(request, join(root, 'story.log'), {
		launch: options => {
			options.electronLaunchObserver?.onProcessSpawn?.({ pid: 42 } as ChildProcess);
			options.electronLaunchObserver?.onFailure?.({
				type: 'processExit',
				message: 'Electron exited.',
				code: 1,
				signal: null
			});
			return new Promise(() => { });
		}
	});

	assert.deepStrictEqual({
		status: result.status,
		valid: result.valid,
		errorCode: result.error?.code,
		exit: result.exit,
		phaseNames: Object.keys(result.phases)
	}, {
		status: 'failure',
		valid: true,
		errorCode: 'processExit',
		exit: { code: 1, signal: null },
		phaseNames: ['processSpawn']
	});
});

function createAppRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'vscode-cold-start-'));
	temporaryDirectories.push(root);
	mkdirSync(join(root, 'out'), { recursive: true });
	writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'code-oss-dev', version: '1.2.3', main: './out/main.js' }));
	writeFileSync(join(root, 'electron.exe'), '');
	return root;
}

function createClock(): { now: () => number; advance: () => void } {
	let value = 100;
	return {
		now: () => value,
		advance: () => { value += 5; }
	};
}
