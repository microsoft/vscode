/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { existsSync, promises as fs, realpathSync } from 'fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'path';
import { performance } from 'perf_hooks';
import { ApplicationOptions, Quality } from '../application';
import { ElectronLaunchFailure, ElectronShutdownResult, launch } from '../code';
import { FileLogger } from '../logger';
import { ElectronWindowBounds } from '../playwrightDriver';

export const EMPTY_WORKBENCH_COLD_START_STORY = 'vscode.empty-workbench.cold-start';
export const WINDOW_RESIZE_STORY = 'vscode.window-resize';
export type BenchmarkStory = typeof EMPTY_WORKBENCH_COLD_START_STORY | typeof WINDOW_RESIZE_STORY;

const SHUTDOWN_TIMEOUT = 20_000;
const RESIZE_INITIAL_BOUNDS: ElectronWindowBounds = { x: 80, y: 80, width: 1200, height: 800 };
const RESIZE_ALTERNATE_BOUNDS: ElectronWindowBounds = { x: 80, y: 80, width: 1000, height: 700 };
const RESIZE_WARMUP_ITERATIONS = 4;
const RESIZE_MEASURED_ITERATIONS = 20;
const RESIZE_SETTLE_ANIMATION_FRAMES = 2;

export interface BenchmarkStoryRequest {
	readonly schemaVersion: 1;
	readonly story: BenchmarkStory;
	readonly runId: string;
	readonly appExecutable?: string;
	readonly appRoot?: string;
	readonly electronExecutable?: string;
	readonly userDataDir: string;
	readonly extensionsDir: string;
	readonly artifactsDir: string;
	readonly timeoutMs: number;
	readonly env: Readonly<Record<string, string>>;
	readonly launchArgs: readonly string[];
}

export interface PhaseTiming {
	readonly startTimeMs: number;
	readonly endTimeMs: number;
	readonly durationMs: number;
}

export interface BenchmarkShutdown {
	readonly status: ElectronShutdownResult['status'];
	readonly exitCode: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly detail?: string;
}

export interface BenchmarkStoryResult {
	readonly schemaVersion: 1;
	readonly story: BenchmarkStory;
	readonly runId: string;
	readonly status: 'success' | 'failure';
	readonly valid: boolean;
	readonly phases: Readonly<Record<string, PhaseTiming>>;
	readonly metadata: {
		readonly app?: { readonly name?: string; readonly version?: string };
		readonly electron?: string;
		readonly chromium?: string;
		readonly node?: string;
		readonly v8?: string;
		readonly resize?: {
			readonly initialBounds: ElectronWindowBounds;
			readonly alternateBounds: ElectronWindowBounds;
			readonly finalBounds: ElectronWindowBounds;
			readonly warmupIterations: number;
			readonly measuredIterations: number;
			readonly settlePolicy: {
				readonly browserWindowEvent: 'resize';
				readonly rendererAnimationFrames: number;
			};
			readonly performanceMarks: {
				readonly start: string;
				readonly end: string;
			};
		};
	};
	readonly artifacts: Readonly<Record<string, string>>;
	readonly shutdown: BenchmarkShutdown;
	readonly error?: {
		readonly code: string;
		readonly message: string;
		readonly stack?: string;
	};
	readonly exit?: {
		readonly code: number | null;
		readonly signal: NodeJS.Signals | null;
	};
	readonly crash?: {
		readonly type: ElectronLaunchFailure['type'];
		readonly message: string;
	};
}

export interface BenchmarkStoryCode {
	readonly driver: {
		waitForElement(selector: string, options?: { timeout?: number }): Promise<void>;
		getElectronProcessVersions(): Promise<{ electron?: string; chrome?: string; node?: string; v8?: string } | undefined>;
		setElectronWindowBounds(bounds: ElectronWindowBounds): Promise<void>;
		getElectronWindowBounds(): Promise<ElectronWindowBounds>;
		settleRendererAnimationFrames(count: number): Promise<void>;
		markRendererPerformance(name: string): Promise<void>;
	};
	didFinishLoad(): Promise<void>;
	whenWorkbenchRestored(): Promise<void>;
	shutdown(timeoutMs: number): Promise<ElectronShutdownResult>;
}

export interface BenchmarkStoryDependencies {
	readonly launch?: (options: ApplicationOptions) => Promise<BenchmarkStoryCode>;
	readonly now?: () => number;
	readonly signal?: AbortSignal;
}

export function validateBenchmarkStoryRequest(value: unknown): BenchmarkStoryRequest {
	if (!isRecord(value)) {
		throw new Error('Request must be a JSON object.');
	}
	if (value.schemaVersion !== 1) {
		throw new Error(`Unsupported schemaVersion '${String(value.schemaVersion)}'. Expected 1.`);
	}
	if (value.story !== EMPTY_WORKBENCH_COLD_START_STORY && value.story !== WINDOW_RESIZE_STORY) {
		throw new Error(`Unsupported story '${String(value.story)}'.`);
	}
	if (typeof value.runId !== 'string' || value.runId.length === 0) {
		throw new Error('runId must be a non-empty string.');
	}

	const appExecutable = optionalAbsolutePath(value.appExecutable, 'appExecutable');
	const appRoot = optionalAbsolutePath(value.appRoot, 'appRoot');
	if ((appExecutable ? 1 : 0) + (appRoot ? 1 : 0) !== 1) {
		throw new Error('Exactly one of appExecutable or appRoot must be provided.');
	}
	const electronExecutable = optionalAbsolutePath(value.electronExecutable, 'electronExecutable');
	if (appExecutable && electronExecutable) {
		throw new Error('electronExecutable is only supported with appRoot; appExecutable is already the launched executable.');
	}

	const userDataDir = canonicalizePath(requiredAbsolutePath(value.userDataDir, 'userDataDir'));
	const extensionsDir = canonicalizePath(requiredAbsolutePath(value.extensionsDir, 'extensionsDir'));
	const artifactsDir = canonicalizePath(requiredAbsolutePath(value.artifactsDir, 'artifactsDir'));
	assertDisjointDirectories([
		['userDataDir', userDataDir],
		['extensionsDir', extensionsDir],
		['artifactsDir', artifactsDir]
	]);
	if (typeof value.timeoutMs !== 'number' || !Number.isFinite(value.timeoutMs) || value.timeoutMs <= 0) {
		throw new Error('timeoutMs must be a positive finite number.');
	}
	if (!isRecord(value.env) || !Object.values(value.env).every(item => typeof item === 'string')) {
		throw new Error('env must be an object whose values are strings.');
	}
	if (!Array.isArray(value.launchArgs) || !value.launchArgs.every(item => typeof item === 'string')) {
		throw new Error('launchArgs must be an array of strings.');
	}
	for (const option of ['--user-data-dir', '--extensions-dir']) {
		if (value.launchArgs.some(arg => arg === option || arg.startsWith(`${option}=`))) {
			throw new Error(`launchArgs cannot override the isolated profile option '${option}'.`);
		}
	}

	return {
		schemaVersion: 1,
		story: value.story,
		runId: value.runId,
		appExecutable,
		appRoot,
		electronExecutable,
		userDataDir,
		extensionsDir,
		artifactsDir,
		timeoutMs: value.timeoutMs,
		env: value.env as Record<string, string>,
		launchArgs: value.launchArgs as string[]
	};
}

export function validateBenchmarkOutputPaths(request: BenchmarkStoryRequest, logFile: string, resultFile: string): void {
	const paths: [string, string][] = [
		['logFile', canonicalizePath(requiredAbsolutePath(logFile, 'logFile'))],
		['resultFile', canonicalizePath(requiredAbsolutePath(resultFile, 'resultFile'))]
	];
	if (paths[0][1] === paths[1][1]) {
		throw new Error('logFile and resultFile must be different files.');
	}
	for (const [name, path] of paths) {
		if (path === request.artifactsDir) {
			throw new Error(`${name} must not equal artifactsDir.`);
		}
		for (const [directoryName, directory] of [
			['userDataDir', request.userDataDir],
			['extensionsDir', request.extensionsDir]
		] as const) {
			if (pathsOverlap(path, directory)) {
				throw new Error(`${name} must not equal or overlap ${directoryName}.`);
			}
		}
	}
}

export async function runBenchmarkStory(
	request: BenchmarkStoryRequest,
	logFile: string,
	dependencies: BenchmarkStoryDependencies = {}
): Promise<BenchmarkStoryResult> {
	const now = dependencies.now ?? (() => performance.now());
	const launchApplication = dependencies.launch ?? (options => launch(options));
	const origin = now();
	const phases: Record<string, PhaseTiming> = Object.create(null);
	const logsDir = join(request.artifactsDir, 'logs');
	const crashesDir = join(request.artifactsDir, 'crashes');
	const artifacts = getArtifacts(request, logFile, logsDir, crashesDir);
	let code: BenchmarkStoryCode | undefined;
	let launchFailure: ElectronLaunchFailure | undefined;
	let launchTargetValid = false;
	let lastPhaseEnd = 0;
	let appMetadata: { name?: string; version?: string } | undefined;
	let storyError: Error | undefined;
	let storyErrorCode: string | undefined;
	let storyComplete = false;
	const runtimeMetadata: BenchmarkStoryResult['metadata'] = {};
	let rejectLaunchFailure!: (error: Error) => void;
	const launchFailurePromise = new Promise<never>((_, reject) => rejectLaunchFailure = reject);
	const deadline = origin + request.timeoutMs;
	let shutdown: BenchmarkShutdown = {
		status: 'clean',
		exitCode: null,
		signal: null,
		detail: 'No Electron process was launched.'
	};

	try {
		await Promise.all([
			ensureEmptyDirectory(request.userDataDir, 'userDataDir'),
			ensureEmptyDirectory(request.extensionsDir, 'extensionsDir'),
			fs.mkdir(logsDir, { recursive: true }),
			fs.mkdir(crashesDir, { recursive: true }),
			fs.mkdir(dirname(logFile), { recursive: true })
		]);
		const logger = new FileLogger(logFile);
		await validateLaunchTarget(request);
		launchTargetValid = true;
		appMetadata = await readAppMetadata(request);
		let electronLaunchStart = 0;
		let firstWindowStart = 0;
		const observer = {
			onElectronLaunch: () => {
				const end = offset();
				const launchPhase = phase(electronLaunchStart, end);
				phases.electronLaunch = launchPhase;
				if (request.story === EMPTY_WORKBENCH_COLD_START_STORY) {
					phases.processSpawn = launchPhase;
				}
				firstWindowStart = end;
				lastPhaseEnd = end;
			},
			onProcessSpawn: (process: ChildProcess) => {
				logger.log(`Connected to Electron process ${process.pid}.`);
			},
			onFirstWindow: () => {
				lastPhaseEnd = offset();
				phases.firstWindow = phase(firstWindowStart, lastPhaseEnd);
			},
			onFailure: (failure: ElectronLaunchFailure) => {
				if (!storyComplete && !launchFailure) {
					launchFailure = failure;
					rejectLaunchFailure(new Error(failure.message));
				}
			}
		};
		const version = parseVersion(appMetadata.version ?? '0.0.0');
		electronLaunchStart = offset();
		code = await launchApplication({
			quality: request.appRoot ? Quality.Dev : Quality.OSS,
			version,
			applicationPath: request.appRoot,
			codePath: request.appExecutable ? dirname(request.appExecutable) : undefined,
			electronPath: request.electronExecutable ?? request.appExecutable,
			launchTimeout: remainingTime(),
			userDataDir: request.userDataDir,
			extensionsPath: request.extensionsDir,
			useInMemorySecretStorage: true,
			logger,
			logsPath: logsDir,
			crashesPath: crashesDir,
			extraEnv: {
				ELECTRON_RUN_AS_NODE: undefined,
				...(request.appRoot ? {
					VSCODE_CLI: '1',
					VSCODE_DEV: '1',
					VSCODE_REPOSITORY: request.appRoot
				} : {}),
				...request.env
			},
			extraArgs: [
				'--new-window',
				'--disable-extensions',
				'--skip-add-to-recently-opened',
				...request.launchArgs
			],
			electronLaunchObserver: observer
		});
		throwIfAborted();
		if (launchFailure) {
			throw new Error(launchFailure.message);
		}

		await recordPhase('didFinishLoad', () => code!.didFinishLoad());
		await recordPhase('monacoWorkbench', () => code!.driver.waitForElement('.monaco-workbench', { timeout: remainingTime() }));
		await recordPhase('workbenchRestored', () => code!.whenWorkbenchRestored());
		const versions = await waitFor(code.driver.getElectronProcessVersions(), 'Electron metadata');
		let metadata: BenchmarkStoryResult['metadata'] = {
			app: appMetadata,
			electron: versions?.electron,
			chromium: versions?.chrome,
			node: versions?.node,
			v8: versions?.v8
		};
		Object.assign(runtimeMetadata, metadata);
		if (request.story === WINDOW_RESIZE_STORY) {
			await runResizeStory(code);
			metadata = {
				...metadata,
				resize: {
					initialBounds: RESIZE_INITIAL_BOUNDS,
					alternateBounds: RESIZE_ALTERNATE_BOUNDS,
					finalBounds: RESIZE_INITIAL_BOUNDS,
					warmupIterations: RESIZE_WARMUP_ITERATIONS,
					measuredIterations: RESIZE_MEASURED_ITERATIONS,
					settlePolicy: {
						browserWindowEvent: 'resize',
						rendererAnimationFrames: RESIZE_SETTLE_ANIMATION_FRAMES
					},
					performanceMarks: {
						start: 'vscode.window-resize.measure.start',
						end: 'vscode.window-resize.measure.end'
					}
				}
			};
			Object.assign(runtimeMetadata, metadata);
		}
	} catch (error) {
		storyError = toError(error);
		storyErrorCode = launchFailure?.type
			?? (!launchTargetValid ? 'invalidLaunchTarget'
				: dependencies.signal?.aborted ? 'interrupted'
					: storyError.message.includes('timed out') ? 'timeout'
						: 'readinessFailure');
	} finally {
		storyComplete = true;
		if (code) {
			const shutdownStart = offset();
			try {
				shutdown = await code.shutdown(SHUTDOWN_TIMEOUT);
			} catch (error) {
				shutdown = {
					status: 'error',
					exitCode: null,
					signal: null,
					detail: toError(error).message
				};
			}
			phases.shutdown = phase(shutdownStart, offset());
			if (shutdown.status !== 'clean' && !storyError) {
				storyError = new Error(shutdown.detail ?? `Electron shutdown completed with status '${shutdown.status}'.`);
				storyErrorCode = 'shutdownFailure';
			}
		}
	}

	const succeeded = !storyError && shutdown.status === 'clean';
	return {
		schemaVersion: 1,
		story: request.story,
		runId: request.runId,
		status: succeeded ? 'success' : 'failure',
		valid: true,
		phases,
		metadata: Object.keys(runtimeMetadata).length > 0 ? runtimeMetadata : { app: appMetadata },
		artifacts,
		shutdown,
		error: storyError ? {
			code: storyErrorCode ?? 'storyFailure',
			message: storyError.message,
			stack: storyError.stack
		} : undefined,
		exit: launchFailure?.type === 'processExit' ? { code: launchFailure.code ?? null, signal: launchFailure.signal ?? null } : undefined,
		crash: launchFailure && launchFailure.type !== 'processExit' ? { type: launchFailure.type, message: launchFailure.message } : undefined
	};

	function offset(): number {
		return Math.max(0, now() - origin);
	}

	function remainingTime(): number {
		return Math.max(1, deadline - now());
	}

	function throwIfAborted(): void {
		if (dependencies.signal?.aborted) {
			throw new Error('Benchmark story was interrupted.');
		}
	}

	async function waitFor<T>(operation: Promise<T>, name: string): Promise<T> {
		throwIfAborted();
		let handle: NodeJS.Timeout | undefined;
		let abortListener: (() => void) | undefined;
		const timeout = new Promise<never>((_, reject) => {
			handle = setTimeout(() => reject(new Error(`${name} timed out after ${request.timeoutMs}ms.`)), remainingTime());
		});
		const interrupted = new Promise<never>((_, reject) => {
			abortListener = () => reject(new Error('Benchmark story was interrupted.'));
			dependencies.signal?.addEventListener('abort', abortListener, { once: true });
		});
		try {
			return await Promise.race([operation, launchFailurePromise, timeout, interrupted]);
		} finally {
			if (handle) {
				clearTimeout(handle);
			}
			if (abortListener) {
				dependencies.signal?.removeEventListener('abort', abortListener);
			}
		}
	}

	async function recordPhase(name: string, operation: () => Promise<void>): Promise<void> {
		const start = lastPhaseEnd;
		await waitFor(operation(), name);
		lastPhaseEnd = offset();
		phases[name] = phase(start, lastPhaseEnd);
	}

	async function runResizeStory(storyCode: BenchmarkStoryCode): Promise<void> {
		await recordPhase('resizeWarmup', async () => {
			await resizeAndSettle(storyCode, RESIZE_INITIAL_BOUNDS);
			for (let index = 0; index < RESIZE_WARMUP_ITERATIONS; index++) {
				await resizeAndSettle(storyCode, boundsForIteration(index));
			}
		});
		await recordPhase('resizeMeasure', async () => {
			await storyCode.driver.markRendererPerformance('vscode.window-resize.measure.start');
			for (let index = 0; index < RESIZE_MEASURED_ITERATIONS; index++) {
				await resizeAndSettle(storyCode, boundsForIteration(index));
			}
			await storyCode.driver.markRendererPerformance('vscode.window-resize.measure.end');
		});
		const finalBounds = await waitFor(storyCode.driver.getElectronWindowBounds(), 'Read final window bounds');
		if (!boundsEqual(finalBounds, RESIZE_INITIAL_BOUNDS)) {
			throw new Error(`Resize story ended with unexpected bounds ${JSON.stringify(finalBounds)}.`);
		}
	}

	async function resizeAndSettle(storyCode: BenchmarkStoryCode, bounds: ElectronWindowBounds): Promise<void> {
		await waitFor(storyCode.driver.setElectronWindowBounds(bounds), 'BrowserWindow resize');
		await waitFor(storyCode.driver.settleRendererAnimationFrames(RESIZE_SETTLE_ANIMATION_FRAMES), 'Renderer resize settle');
	}
}

export function createInvalidResult(value: unknown, error: unknown, artifacts: Readonly<Record<string, string>>): BenchmarkStoryResult {
	const request = isRecord(value) ? value : {};
	const failure = toError(error);
	return {
		schemaVersion: 1,
		story: request.story === WINDOW_RESIZE_STORY ? WINDOW_RESIZE_STORY : EMPTY_WORKBENCH_COLD_START_STORY,
		runId: typeof request.runId === 'string' ? request.runId : '',
		status: 'failure',
		valid: false,
		phases: {},
		metadata: {},
		artifacts,
		shutdown: {
			status: 'clean',
			exitCode: null,
			signal: null,
			detail: 'The invalid request was rejected before launching Electron.'
		},
		error: {
			code: 'invalidRequest',
			message: failure.message,
			stack: failure.stack
		}
	};
}

function getArtifacts(request: BenchmarkStoryRequest, logFile: string, logsDir: string, crashesDir: string): Record<string, string> {
	const artifacts: Record<string, string> = {
		artifactsDir: request.artifactsDir,
		crashesDir,
		extensionsDir: request.extensionsDir,
		logFile,
		logsDir,
		userDataDir: request.userDataDir
	};
	for (const argument of request.launchArgs) {
		for (const [option, name] of [
			['--trace-startup-file=', 'traceStartupFile'],
			['--trace-perfetto-config-file=', 'tracePerfettoConfigFile']
		] as const) {
			if (argument.startsWith(option)) {
				artifacts[name] = canonicalizePath(argument.slice(option.length));
			}
		}
	}
	return artifacts;
}

function phase(startTimeMs: number, endTimeMs: number): PhaseTiming {
	return { startTimeMs, endTimeMs, durationMs: endTimeMs - startTimeMs };
}

function boundsForIteration(index: number): ElectronWindowBounds {
	return index % 2 === 0 ? RESIZE_ALTERNATE_BOUNDS : RESIZE_INITIAL_BOUNDS;
}

function boundsEqual(first: ElectronWindowBounds, second: ElectronWindowBounds): boolean {
	return first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height;
}

async function ensureEmptyDirectory(path: string, name: string): Promise<void> {
	try {
		const entries = await fs.readdir(path);
		if (entries.length > 0) {
			throw new Error(`${name} must be fresh and empty: '${path}'.`);
		}
	} catch (error) {
		const code = isRecord(error) ? error.code : undefined;
		if (code !== 'ENOENT') {
			throw error;
		}
		await fs.mkdir(path, { recursive: true });
	}
}

async function validateLaunchTarget(request: BenchmarkStoryRequest): Promise<void> {
	if (request.appExecutable) {
		await fs.access(request.appExecutable);
		return;
	}
	const packagePath = join(request.appRoot!, 'package.json');
	const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8')) as { main?: string };
	if (!packageJson.main) {
		throw new Error(`VS Code appRoot package.json has no main entry: '${packagePath}'.`);
	}
	const mainPath = resolve(request.appRoot!, packageJson.main);
	try {
		await fs.access(mainPath);
	} catch {
		throw new Error(`VS Code appRoot is not compiled. Expected '${mainPath}' before launching '${request.electronExecutable ?? 'the development Electron'}'.`);
	}
	if (request.electronExecutable) {
		await fs.access(request.electronExecutable);
	}
}

async function readAppMetadata(request: BenchmarkStoryRequest): Promise<{ name?: string; version?: string }> {
	const packagePath = request.appRoot
		? join(request.appRoot, 'package.json')
		: join(dirname(request.appExecutable!), 'resources', 'app', 'package.json');
	try {
		const value = JSON.parse(await fs.readFile(packagePath, 'utf8')) as { name?: string; version?: string };
		return { name: value.name, version: value.version };
	} catch {
		return {};
	}
}

function parseVersion(value: string): { major: number; minor: number; patch: number } {
	const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/.exec(value);
	return {
		major: Number(match?.groups?.major ?? 0),
		minor: Number(match?.groups?.minor ?? 0),
		patch: Number(match?.groups?.patch ?? 0)
	};
}

function requiredAbsolutePath(value: unknown, name: string): string {
	if (typeof value !== 'string' || !isAbsolute(value)) {
		throw new Error(`${name} must be an absolute path.`);
	}
	return value;
}

function optionalAbsolutePath(value: unknown, name: string): string | undefined {
	return value === undefined ? undefined : canonicalizePath(requiredAbsolutePath(value, name));
}

function canonicalizePath(path: string): string {
	const absolutePath = resolve(path);
	let existingPath = absolutePath;
	const suffix: string[] = [];
	while (!existsSync(existingPath)) {
		const parent = dirname(existingPath);
		if (parent === existingPath) {
			break;
		}
		suffix.unshift(existingPath.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
		existingPath = parent;
	}
	const canonicalExistingPath = existsSync(existingPath) ? realpathSync.native(existingPath) : existingPath;
	const canonicalPath = resolve(canonicalExistingPath, ...suffix);
	return process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath;
}

function assertDisjointDirectories(paths: readonly (readonly [string, string])[]): void {
	for (let firstIndex = 0; firstIndex < paths.length; firstIndex++) {
		for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex++) {
			const [firstName, firstPath] = paths[firstIndex];
			const [secondName, secondPath] = paths[secondIndex];
			if (pathsOverlap(firstPath, secondPath)) {
				throw new Error(`${firstName} and ${secondName} must not be equal or have an ancestor/descendant relationship.`);
			}
		}
	}
}

function pathsOverlap(first: string, second: string): boolean {
	const firstRoot = parse(first).root;
	const secondRoot = parse(second).root;
	if (normalizeForComparison(firstRoot) !== normalizeForComparison(secondRoot)) {
		return false;
	}
	const firstToSecond = relative(first, second);
	const secondToFirst = relative(second, first);
	return firstToSecond === ''
		|| (!firstToSecond.startsWith(`..${sep}`) && firstToSecond !== '..')
		|| (!secondToFirst.startsWith(`..${sep}`) && secondToFirst !== '..');
}

function normalizeForComparison(value: string): string {
	return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
