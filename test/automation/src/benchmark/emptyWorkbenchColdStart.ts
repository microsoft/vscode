/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { performance } from 'perf_hooks';
import { ApplicationOptions, Quality } from '../application';
import { ElectronLaunchFailure, launch } from '../code';
import { FileLogger } from '../logger';

export const EMPTY_WORKBENCH_COLD_START_STORY = 'vscode.empty-workbench.cold-start';

export interface EmptyWorkbenchColdStartRequest {
	readonly schemaVersion: 1;
	readonly story: typeof EMPTY_WORKBENCH_COLD_START_STORY;
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

export interface EmptyWorkbenchColdStartResult {
	readonly schemaVersion: 1;
	readonly story: typeof EMPTY_WORKBENCH_COLD_START_STORY;
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
	};
	readonly artifacts: Readonly<Record<string, string>>;
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

export interface EmptyWorkbenchColdStartCode {
	readonly driver: {
		waitForElement(selector: string, options?: { timeout?: number }): Promise<void>;
		getElectronProcessVersions(): Promise<{ electron?: string; chrome?: string; node?: string; v8?: string } | undefined>;
	};
	didFinishLoad(): Promise<void>;
	whenWorkbenchRestored(): Promise<void>;
	exit(): Promise<void>;
}

export interface EmptyWorkbenchColdStartDependencies {
	readonly launch?: (options: ApplicationOptions) => Promise<EmptyWorkbenchColdStartCode>;
	readonly now?: () => number;
}

export function validateEmptyWorkbenchColdStartRequest(value: unknown): EmptyWorkbenchColdStartRequest {
	if (!isRecord(value)) {
		throw new Error('Request must be a JSON object.');
	}
	if (value.schemaVersion !== 1) {
		throw new Error(`Unsupported schemaVersion '${String(value.schemaVersion)}'. Expected 1.`);
	}
	if (value.story !== EMPTY_WORKBENCH_COLD_START_STORY) {
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

	const userDataDir = requiredAbsolutePath(value.userDataDir, 'userDataDir');
	const extensionsDir = requiredAbsolutePath(value.extensionsDir, 'extensionsDir');
	const artifactsDir = requiredAbsolutePath(value.artifactsDir, 'artifactsDir');
	if (new Set([userDataDir, extensionsDir, artifactsDir]).size !== 3) {
		throw new Error('userDataDir, extensionsDir, and artifactsDir must be distinct directories.');
	}
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
		story: EMPTY_WORKBENCH_COLD_START_STORY,
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

export async function runEmptyWorkbenchColdStart(
	request: EmptyWorkbenchColdStartRequest,
	logFile: string,
	dependencies: EmptyWorkbenchColdStartDependencies = {}
): Promise<EmptyWorkbenchColdStartResult> {
	const now = dependencies.now ?? (() => performance.now());
	const launchApplication = dependencies.launch ?? (options => launch(options));
	const origin = now();
	const phases: Record<string, PhaseTiming> = Object.create(null);
	const logsDir = join(request.artifactsDir, 'logs');
	const crashesDir = join(request.artifactsDir, 'crashes');
	const artifacts = {
		artifactsDir: request.artifactsDir,
		crashesDir,
		extensionsDir: request.extensionsDir,
		logFile,
		logsDir,
		userDataDir: request.userDataDir
	};
	let code: EmptyWorkbenchColdStartCode | undefined;
	let completed = false;
	let launchFailure: ElectronLaunchFailure | undefined;
	let launchTargetValid = false;
	let lastPhaseEnd = 0;
	let appMetadata: { name?: string; version?: string } | undefined;
	let rejectLaunchFailure!: (error: Error) => void;
	const launchFailurePromise = new Promise<never>((_, reject) => rejectLaunchFailure = reject);
	const deadline = origin + request.timeoutMs;

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
		let processSpawnStart = 0;
		let firstWindowStart = 0;
		const observer = {
			onProcessSpawn: (process: ChildProcess) => {
				const end = offset();
				phases.processSpawn = phase(processSpawnStart, end);
				firstWindowStart = end;
				lastPhaseEnd = end;
				logger.log(`Electron process spawned with pid ${process.pid}.`);
			},
			onFirstWindow: () => {
				lastPhaseEnd = offset();
				phases.firstWindow = phase(firstWindowStart, lastPhaseEnd);
			},
			onFailure: (failure: ElectronLaunchFailure) => {
				if (!completed && !launchFailure) {
					launchFailure = failure;
					rejectLaunchFailure(new Error(failure.message));
				}
			}
		};
		const packageVersion = appMetadata.version ?? '0.0.0';
		const version = parseVersion(packageVersion);
		processSpawnStart = offset();
		code = await waitFor(launchApplication({
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
		}), 'Electron launch');

		await recordPhase('didFinishLoad', () => code!.didFinishLoad());
		await recordPhase('monacoWorkbench', () => code!.driver.waitForElement('.monaco-workbench', { timeout: remainingTime() }));
		await recordPhase('workbenchRestored', () => code!.whenWorkbenchRestored());
		const versions = await waitFor(code.driver.getElectronProcessVersions(), 'Electron metadata');
		completed = true;

		return {
			schemaVersion: 1,
			story: request.story,
			runId: request.runId,
			status: 'success',
			valid: true,
			phases,
			metadata: {
				app: appMetadata,
				electron: versions?.electron,
				chromium: versions?.chrome,
				node: versions?.node,
				v8: versions?.v8
			},
			artifacts
		};
	} catch (error) {
		completed = true;
		const failure = toError(error);
		return {
			schemaVersion: 1,
			story: request.story,
			runId: request.runId,
			status: 'failure',
			valid: true,
			phases,
			metadata: { app: appMetadata },
			artifacts,
			error: {
				code: launchFailure?.type ?? (!launchTargetValid ? 'invalidLaunchTarget' : failure.message.includes('timed out') ? 'timeout' : 'readinessFailure'),
				message: failure.message,
				stack: failure.stack
			},
			exit: launchFailure?.type === 'processExit' ? { code: launchFailure.code ?? null, signal: launchFailure.signal ?? null } : undefined,
			crash: launchFailure && launchFailure.type !== 'processExit' ? { type: launchFailure.type, message: launchFailure.message } : undefined
		};
	} finally {
		if (code) {
			try {
				await code.exit();
			} catch {
				// The primary result already captures startup success or failure.
			}
		}
	}

	function offset(): number {
		return Math.max(0, now() - origin);
	}

	function remainingTime(): number {
		return Math.max(1, deadline - now());
	}

	async function waitFor<T>(operation: Promise<T>, name: string): Promise<T> {
		let handle: NodeJS.Timeout | undefined;
		const timeout = new Promise<never>((_, reject) => {
			handle = setTimeout(() => reject(new Error(`${name} timed out after ${request.timeoutMs}ms.`)), remainingTime());
		});
		try {
			return await Promise.race([operation, launchFailurePromise, timeout]);
		} finally {
			if (handle) {
				clearTimeout(handle);
			}
		}
	}

	async function recordPhase(name: string, operation: () => Promise<void>): Promise<void> {
		const start = lastPhaseEnd;
		await waitFor(operation(), name);
		lastPhaseEnd = offset();
		phases[name] = phase(start, lastPhaseEnd);
	}
}

export function createInvalidResult(value: unknown, error: unknown, artifacts: Readonly<Record<string, string>>): EmptyWorkbenchColdStartResult {
	const request = isRecord(value) ? value : {};
	const failure = toError(error);
	return {
		schemaVersion: 1,
		story: EMPTY_WORKBENCH_COLD_START_STORY,
		runId: typeof request.runId === 'string' ? request.runId : '',
		status: 'failure',
		valid: false,
		phases: {},
		metadata: {},
		artifacts,
		error: {
			code: 'invalidRequest',
			message: failure.message,
			stack: failure.stack
		}
	};
}

function phase(startTimeMs: number, endTimeMs: number): PhaseTiming {
	return { startTimeMs, endTimeMs, durationMs: endTimeMs - startTimeMs };
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

async function validateLaunchTarget(request: EmptyWorkbenchColdStartRequest): Promise<void> {
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

async function readAppMetadata(request: EmptyWorkbenchColdStartRequest): Promise<{ name?: string; version?: string }> {
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
	return value === undefined ? undefined : requiredAbsolutePath(value, name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
