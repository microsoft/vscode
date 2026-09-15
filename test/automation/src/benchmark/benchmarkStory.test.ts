/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { spawn } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { once } from 'events';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, test } from 'node:test';
import { ApplicationOptions, Quality } from '../application';
import { Logger } from '../logger';
import { isProcessAlive, teardownAndWait } from '../processes';
import { cleanupFailedElectronLaunch } from '../playwrightElectron';
import {
	BenchmarkStoryCode,
	EMPTY_WORKBENCH_COLD_START_STORY,
	runBenchmarkStory,
	validateBenchmarkOutputPaths,
	validateBenchmarkStoryRequest,
	WINDOW_RESIZE_STORY
} from './benchmarkStory';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const path of temporaryDirectories.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

test('validates canonical disjoint directories and preserves ordered launch arguments', () => {
	const root = createAppRoot();
	const request = validateBenchmarkStoryRequest(createRequest(root, EMPTY_WORKBENCH_COLD_START_STORY, {
		launchArgs: ['--trace-startup-file=trace.json', '--js-flags=--logfile=v8.log']
	}));

	assert.deepStrictEqual(request.launchArgs, ['--trace-startup-file=trace.json', '--js-flags=--logfile=v8.log']);
	assert.throws(() => validateBenchmarkStoryRequest(createRequest(root, EMPTY_WORKBENCH_COLD_START_STORY, {
		extensionsDir: join(root, 'profile', 'extensions')
	})), /ancestor\/descendant/);
	if (process.platform === 'win32') {
		assert.throws(() => validateBenchmarkStoryRequest(createRequest(root, EMPTY_WORKBENCH_COLD_START_STORY, {
			extensionsDir: join(root, 'PROFILE')
		})), /ancestor\/descendant/);
	}
	assert.throws(() => validateBenchmarkOutputPaths(request, join(root, 'result.json'), join(root, 'result.json')), /different files/);
});

test('emits honest launch phases, clean shutdown, and ordered flags', async () => {
	const root = createCompiledAppRoot();
	const clock = createClock();
	let launchOptions: ApplicationOptions | undefined;
	const result = await runBenchmarkStory(
		validateBenchmarkStoryRequest(createRequest(root, EMPTY_WORKBENCH_COLD_START_STORY, {
			launchArgs: [
				'--trace-perfetto-config-file=perfetto.json',
				'--trace-startup-file=trace.json',
				'--js-flags=--logfile=v8.log',
				'--enable-features=BenchmarkFeature'
			]
		})),
		join(root, 'story.log'),
		{
			now: clock.now,
			launch: async options => {
				launchOptions = options;
				options.electronLaunchObserver?.onElectronLaunch?.();
				options.electronLaunchObserver?.onFirstWindow?.();
				return createFakeCode(clock);
			}
		}
	);

	assert.deepStrictEqual({
		status: result.status,
		valid: result.valid,
		phaseNames: Object.keys(result.phases),
		launchAlias: result.phases.processSpawn === result.phases.electronLaunch,
		shutdown: result.shutdown,
		launchArgs: launchOptions?.extraArgs
	}, {
		status: 'success',
		valid: true,
		phaseNames: ['electronLaunch', 'processSpawn', 'firstWindow', 'didFinishLoad', 'monacoWorkbench', 'workbenchRestored', 'shutdown'],
		launchAlias: true,
		shutdown: { status: 'clean', exitCode: 0, signal: null },
		launchArgs: [
			'--new-window',
			'--disable-extensions',
			'--skip-add-to-recently-opened',
			'--trace-perfetto-config-file=perfetto.json',
			'--trace-startup-file=trace.json',
			'--js-flags=--logfile=v8.log',
			'--enable-features=BenchmarkFeature'
		]
	});
});

test('interruption still performs bounded shutdown', async () => {
	const root = createCompiledAppRoot();
	const clock = createClock();
	const controller = new AbortController();
	let shutdownCalled = false;
	const code = createFakeCode(clock, {
		shutdown: async () => {
			shutdownCalled = true;
			return { status: 'clean', exitCode: 0, signal: null };
		}
	});
	code.didFinishLoad = async () => {
		controller.abort();
		clock.advance();
	};
	const result = await runBenchmarkStory(
		validateBenchmarkStoryRequest(createRequest(root, EMPTY_WORKBENCH_COLD_START_STORY)),
		join(root, 'story.log'),
		{
			now: clock.now,
			signal: controller.signal,
			launch: async options => {
				options.electronLaunchObserver?.onElectronLaunch?.();
				options.electronLaunchObserver?.onFirstWindow?.();
				return code;
			}
		}
	);

	assert.deepStrictEqual({
		status: result.status,
		errorCode: result.error?.code,
		shutdownCalled,
		shutdown: result.shutdown.status
	}, {
		status: 'failure',
		errorCode: 'interrupted',
		shutdownCalled: true,
		shutdown: 'clean'
	});
});

test('runs the fixed resize sequence and records performance marks', async () => {
	const root = createCompiledAppRoot();
	const clock = createClock();
	const bounds: { width: number; height: number }[] = [];
	const marks: string[] = [];
	const code = createFakeCode(clock, {
		setElectronWindowBounds: async value => {
			bounds.push({ width: value.width, height: value.height });
			clock.advance();
		},
		getElectronWindowBounds: async () => ({ x: 80, y: 80, width: 1200, height: 800 }),
		markRendererPerformance: async name => {
			marks.push(name);
			clock.advance();
		}
	});
	const result = await runBenchmarkStory(
		validateBenchmarkStoryRequest(createRequest(root, WINDOW_RESIZE_STORY)),
		join(root, 'story.log'),
		{
			now: clock.now,
			launch: async options => {
				options.electronLaunchObserver?.onElectronLaunch?.();
				options.electronLaunchObserver?.onFirstWindow?.();
				return code;
			}
		}
	);

	assert.deepStrictEqual({
		status: result.status,
		phaseNames: Object.keys(result.phases),
		resizeOperations: bounds.length,
		firstBounds: bounds[0],
		finalBounds: bounds.at(-1),
		marks,
		metadata: result.metadata.resize
	}, {
		status: 'success',
		phaseNames: ['electronLaunch', 'firstWindow', 'didFinishLoad', 'monacoWorkbench', 'workbenchRestored', 'resizeWarmup', 'resizeMeasure', 'shutdown'],
		resizeOperations: 25,
		firstBounds: { width: 1200, height: 800 },
		finalBounds: { width: 1200, height: 800 },
		marks: ['vscode.window-resize.measure.start', 'vscode.window-resize.measure.end'],
		metadata: {
			initialBounds: { x: 80, y: 80, width: 1200, height: 800 },
			alternateBounds: { x: 80, y: 80, width: 1000, height: 700 },
			finalBounds: { x: 80, y: 80, width: 1200, height: 800 },
			warmupIterations: 4,
			measuredIterations: 20,
			settlePolicy: { browserWindowEvent: 'resize', rendererAnimationFrames: 2 },
			performanceMarks: {
				start: 'vscode.window-resize.measure.start',
				end: 'vscode.window-resize.measure.end'
			}
		}
	});
});

test('turns forced cleanup into an explicit story failure', async () => {
	const root = createCompiledAppRoot();
	const clock = createClock();
	const code = createFakeCode(clock, {
		shutdown: async () => ({
			status: 'forced',
			exitCode: null,
			signal: null,
			detail: 'Process tree was terminated.'
		})
	});
	const result = await runBenchmarkStory(
		validateBenchmarkStoryRequest(createRequest(root, EMPTY_WORKBENCH_COLD_START_STORY)),
		join(root, 'story.log'),
		{
			now: clock.now,
			launch: async options => {
				options.electronLaunchObserver?.onElectronLaunch?.();
				options.electronLaunchObserver?.onFirstWindow?.();
				return code;
			}
		}
	);

	assert.deepStrictEqual({
		status: result.status,
		errorCode: result.error?.code,
		shutdown: result.shutdown
	}, {
		status: 'failure',
		errorCode: 'shutdownFailure',
		shutdown: {
			status: 'forced',
			exitCode: null,
			signal: null,
			detail: 'Process tree was terminated.'
		}
	});
});

test('terminates and awaits a real owned process', async () => {
	const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
	await once(child, 'spawn');
	const pid = child.pid!;
	assert.strictEqual(isProcessAlive(pid), true);

	await teardownAndWait(child, new TestLogger(), 10_000);

	assert.strictEqual(isProcessAlive(pid), false);
});

test('terminates a real process when partial Playwright cleanup fails', async () => {
	const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
	await once(child, 'spawn');
	const pid = child.pid!;

	await cleanupFailedElectronLaunch(
		{ close: async () => { throw new Error('connection lost'); } },
		child,
		createLaunchOptions(createCompiledAppRoot())
	);

	assert.strictEqual(isProcessAlive(pid), false);
});

function createRequest(root: string, story: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		schemaVersion: 1,
		story,
		runId: 'run-1',
		appRoot: root,
		electronExecutable: join(root, 'electron.exe'),
		userDataDir: join(root, 'profile'),
		extensionsDir: join(root, 'extensions'),
		artifactsDir: join(root, 'artifacts'),
		timeoutMs: 30_000,
		env: {},
		launchArgs: [],
		...overrides
	};
}

function createAppRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'vscode-benchmark-'));
	temporaryDirectories.push(root);
	mkdirSync(join(root, 'out'), { recursive: true });
	writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'code-oss-dev', version: '1.2.3', main: './out/main.js' }));
	writeFileSync(join(root, 'electron.exe'), '');
	return root;
}

function createCompiledAppRoot(): string {
	const root = createAppRoot();
	writeFileSync(join(root, 'out', 'main.js'), '');
	return root;
}

function createFakeCode(
	clock: ReturnType<typeof createClock>,
	overrides: Partial<BenchmarkStoryCode['driver']> & { shutdown?: BenchmarkStoryCode['shutdown'] } = {}
): BenchmarkStoryCode {
	return {
		didFinishLoad: async () => clock.advance(),
		whenWorkbenchRestored: async () => clock.advance(),
		shutdown: overrides.shutdown ?? (async () => ({ status: 'clean', exitCode: 0, signal: null })),
		driver: {
			waitForElement: async () => clock.advance(),
			getElectronProcessVersions: async () => ({ appName: 'Code - OSS', appVersion: '1.2.3', electron: '46.0.0', chrome: '146.0.0', node: '24.0.0', v8: '14.6' }),
			setElectronWindowBounds: overrides.setElectronWindowBounds ?? (async () => clock.advance()),
			getElectronWindowBounds: overrides.getElectronWindowBounds ?? (async () => ({ x: 80, y: 80, width: 1200, height: 800 })),
			settleRendererAnimationFrames: overrides.settleRendererAnimationFrames ?? (async () => clock.advance()),
			markRendererPerformance: overrides.markRendererPerformance ?? (async () => clock.advance())
		}
	};
}

function createLaunchOptions(root: string): ApplicationOptions {
	return {
		quality: Quality.Dev,
		version: { major: 1, minor: 2, patch: 3 },
		logger: new TestLogger(),
		logsPath: join(root, 'logs'),
		crashesPath: join(root, 'crashes')
	};
}

function createClock(): { now: () => number; advance: () => void } {
	let value = 100;
	return {
		now: () => value,
		advance: () => { value += 5; }
	};
}

class TestLogger implements Logger {
	log(): void { }
}
