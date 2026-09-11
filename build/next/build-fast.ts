/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { getGitCommitDate } from '../lib/date.ts';
import { applyIncrementalClientChanges, mapWithConcurrency, MAX_CONCURRENT_FILE_OPERATIONS } from './transpile.ts';

const STATE_SCHEMA = 1;
const BUILD_RECIPE = 1;
const LOCK_STALE_AFTER_MS = 30_000;
const BUILD_SCOPES = ['src', 'extensions', '.vscode/extensions', 'build', 'gulpfile.mjs', 'package.json', 'package-lock.json', '.nvmrc'];
const API_PROPOSALS_OUTPUT = 'src/vs/platform/extensions/common/extensionsApiProposals.ts';
const EXTENSION_POINTS_OUTPUT = 'src/vs/workbench/services/extensions/common/extensionPoints.json';
const EXTENSION_BUILD_ARGS = ['run', 'gulp', 'compile-extensions', 'compile-extension-media'];
const COPILOT_BUILD_ARGS = ['--prefix', 'extensions/copilot', 'run', 'compile'];

type Fingerprint = string | null;
type LaneMode = 'skip' | 'incremental' | 'full';

export interface BuildFastState {
	readonly schema: number;
	readonly recipe: number;
	readonly head: string;
	readonly environment: string;
	readonly dirty: Readonly<Record<string, Fingerprint>>;
}

export interface BuildFastSnapshot {
	readonly head: string;
	readonly dirty: Readonly<Record<string, Fingerprint>>;
}

export interface BuildFastPlan {
	readonly reason: string;
	readonly changedPaths: readonly string[];
	readonly client: LaneMode;
	readonly extensions: LaneMode;
	readonly copilot: LaneMode;
}

export interface BuildFastPrerequisites {
	readonly tasks: readonly string[];
	readonly clientChangedPaths: readonly string[];
}

export interface StateReadResult {
	readonly state: BuildFastState | undefined;
	readonly reason: string | undefined;
}

export interface OutputStatus {
	readonly client: boolean;
	readonly extensions: boolean;
	readonly copilot: boolean;
}

interface Lock {
	dispose(): Promise<void>;
}

export async function runBuildFast(repoRoot: string, force: boolean): Promise<void> {
	const stateDir = path.join(repoRoot, '.build', 'build-fast');
	await fs.promises.mkdir(stateDir, { recursive: true });
	const lock = await acquireLock(path.join(stateDir, 'lock'));

	try {
		const environment = readEnvironment(repoRoot);
		const statePath = path.join(stateDir, 'state.json');
		const saved = await readState(statePath);

		let before: BuildFastSnapshot;
		let committedPaths: readonly string[];
		try {
			before = await collectSnapshot(repoRoot);
			committedPaths = saved.state ? await getCommittedPaths(repoRoot, saved.state.head, before.head) : [];
		} catch (error) {
			console.warn(`[build-fast] Git discovery failed; running a full build without updating incremental state: ${getErrorMessage(error)}`);
			await fs.promises.rm(statePath, { force: true });
			await runAllFull(repoRoot);
			return;
		}

		const changedPaths = computeChangedPaths(saved.state, before, committedPaths);
		const outputs = await getOutputStatus(repoRoot);
		const plan = createBuildPlan(saved, environment, changedPaths, outputs, force);
		logPlan(plan);

		const hasBuildWork = plan.client !== 'skip' || plan.extensions !== 'skip' || plan.copilot !== 'skip';
		if (!hasBuildWork && saved.state?.head === before.head) {
			return;
		}
		if (hasBuildWork) {
			await fs.promises.rm(statePath, { force: true });
		}

		const fullBuild = plan.client === 'full' && plan.extensions === 'full' && plan.copilot === 'full';
		const prerequisites = createBuildFastPrerequisites(fullBuild, plan.changedPaths);
		if (prerequisites.tasks.length > 0) {
			await runCommand(repoRoot, npmCommand(), ['run', 'gulp', ...prerequisites.tasks], 'prerequisites');
			before = await collectSnapshot(repoRoot);
		}

		const tasks: Promise<void>[] = [];
		if (plan.client === 'full') {
			tasks.push(runCommand(repoRoot, process.execPath, [path.join(repoRoot, 'build', 'next', 'index.ts'), 'transpile'], 'client'));
		} else if (plan.client === 'incremental') {
			tasks.push(runTimed('client', () => applyIncrementalClientChanges(repoRoot, 'out', prerequisites.clientChangedPaths)));
		}
		if (plan.extensions === 'full') {
			tasks.push(runCommand(repoRoot, npmCommand(), EXTENSION_BUILD_ARGS, 'extensions'));
		}
		if (plan.copilot === 'full') {
			tasks.push(runCommand(repoRoot, npmCommand(), COPILOT_BUILD_ARGS, 'copilot'));
		}

		await waitForTasks(tasks);

		const after = await collectSnapshot(repoRoot);
		const { snapshot: builtSnapshot, inputsChanged } = selectBuiltSnapshot(before, after);
		if (inputsChanged) {
			console.warn('[build-fast] Inputs changed during the build; late changes will be rebuilt on the next run.');
		}

		const outputStatus = await getOutputStatus(repoRoot);
		validateSelectedOutputs(plan, outputStatus);

		if (saved.state?.head !== builtSnapshot.head && !inputsChanged) {
			await fs.promises.writeFile(path.join(repoRoot, 'out', 'date'), getGitCommitDate(), 'utf8');
		}

		await writeState(statePath, {
			schema: STATE_SCHEMA,
			recipe: BUILD_RECIPE,
			head: builtSnapshot.head,
			environment,
			dirty: builtSnapshot.dirty,
		});
	} finally {
		await lock.dispose();
	}
}

export function createBuildFastPrerequisites(fullBuild: boolean, changedPaths: readonly string[]): BuildFastPrerequisites {
	const apiProposalsChanged = changedPaths.some(filePath => filePath.startsWith('src/vscode-dts/') || filePath === API_PROPOSALS_OUTPUT);
	const extensionPointsOutputChanged = changedPaths.includes(EXTENSION_POINTS_OUTPUT);
	const tasks = fullBuild
		? ['copy-codicons', 'compile-api-proposal-names', 'compile-extension-point-names']
		: [
			...(apiProposalsChanged ? ['compile-api-proposal-names'] : []),
			...(extensionPointsOutputChanged ? ['compile-extension-point-names'] : []),
		];
	const clientChangedPaths = [
		...new Set([
			...changedPaths,
			...(apiProposalsChanged ? [API_PROPOSALS_OUTPUT] : []),
			...(extensionPointsOutputChanged ? [EXTENSION_POINTS_OUTPUT] : []),
		])
	];
	return { tasks, clientChangedPaths };
}

export function computeChangedPaths(saved: BuildFastState | undefined, current: BuildFastSnapshot, committedPaths: readonly string[]): string[] {
	if (!saved) {
		return [];
	}

	const changed = new Set(committedPaths);
	for (const [filePath, fingerprint] of Object.entries(current.dirty)) {
		if (!Object.hasOwn(saved.dirty, filePath) || saved.dirty[filePath] !== fingerprint) {
			changed.add(filePath);
		}
	}
	for (const filePath of Object.keys(saved.dirty)) {
		if (!Object.hasOwn(current.dirty, filePath)) {
			changed.add(filePath);
		}
	}
	return [...changed].sort();
}

export function selectBuiltSnapshot(before: BuildFastSnapshot, after: BuildFastSnapshot): { snapshot: BuildFastSnapshot; inputsChanged: boolean } {
	const inputsChanged = !snapshotsEqual(before, after);
	return { snapshot: inputsChanged ? before : after, inputsChanged };
}

export function createBuildPlan(saved: StateReadResult, environment: string, changedPaths: readonly string[], outputs: OutputStatus, force: boolean): BuildFastPlan {
	if (force) {
		return fullPlan('forced by --force', changedPaths);
	}
	if (!saved.state) {
		return fullPlan(saved.reason ?? 'incremental state is unavailable', changedPaths);
	}
	if (saved.state.schema !== STATE_SCHEMA || saved.state.recipe !== BUILD_RECIPE) {
		return fullPlan('incremental state schema or recipe changed', changedPaths);
	}
	if (saved.state.environment !== environment) {
		return fullPlan('build environment changed', changedPaths);
	}
	if (changedPaths.some(isGlobalBuildInput)) {
		return fullPlan('build configuration or dependencies changed', changedPaths);
	}

	let client: LaneMode = outputs.client ? 'skip' : 'full';
	let extensions: LaneMode = outputs.extensions ? 'skip' : 'full';
	let copilot: LaneMode = outputs.copilot ? 'skip' : 'full';

	for (const filePath of changedPaths) {
		if (filePath.startsWith('src/')) {
			if (client === 'skip') {
				client = 'incremental';
			}
		} else if (filePath.startsWith('extensions/copilot/')) {
			copilot = 'full';
		} else if (filePath.startsWith('extensions/') || filePath.startsWith('.vscode/extensions/')) {
			extensions = 'full';
		}
	}

	const reasons: string[] = [];
	if (!outputs.client) {
		reasons.push('client output is missing');
	}
	if (!outputs.extensions) {
		reasons.push('extension output is missing');
	}
	if (!outputs.copilot) {
		reasons.push('Copilot output is missing');
	}
	if (changedPaths.length > 0) {
		reasons.push(`${changedPaths.length} input path(s) changed`);
	}

	return {
		reason: reasons.join('; ') || 'inputs and outputs are up to date',
		changedPaths,
		client,
		extensions,
		copilot,
	};
}

export function parseNullSeparatedPaths(output: Buffer): string[] {
	return output.toString('utf8').split('\0').filter(Boolean).map(normalizePath);
}

export async function collectSnapshot(repoRoot: string): Promise<BuildFastSnapshot> {
	const [headOutput, trackedOutput, untrackedOutput] = await Promise.all([
		runGit(repoRoot, ['rev-parse', 'HEAD']),
		runGit(repoRoot, ['diff', '--name-only', '-z', '--no-renames', 'HEAD', '--', ...BUILD_SCOPES]),
		runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...BUILD_SCOPES]),
	]);
	const head = headOutput.toString('utf8').trim();
	const dirtyPaths = new Set([...parseNullSeparatedPaths(trackedOutput), ...parseNullSeparatedPaths(untrackedOutput)]);
	const dirtyEntries = await mapWithConcurrency([...dirtyPaths].sort(), MAX_CONCURRENT_FILE_OPERATIONS, async filePath => {
		return [filePath, await fingerprintFile(path.join(repoRoot, filePath))] as const;
	});
	return { head, dirty: Object.fromEntries(dirtyEntries) };
}

async function getCommittedPaths(repoRoot: string, savedHead: string, currentHead: string): Promise<string[]> {
	if (savedHead === currentHead) {
		return [];
	}
	const output = await runGit(repoRoot, ['diff', '--name-only', '-z', '--no-renames', savedHead, currentHead, '--', ...BUILD_SCOPES]);
	return parseNullSeparatedPaths(output);
}

async function runGit(repoRoot: string, args: readonly string[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn('git', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', data => stdout.push(data));
		child.stderr.on('data', data => stderr.push(data));
		child.on('error', reject);
		child.on('close', code => {
			if (code === 0) {
				resolve(Buffer.concat(stdout));
			} else {
				reject(new Error(`git ${args[0]} failed with exit code ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
			}
		});
	});
}

async function fingerprintFile(filePath: string): Promise<Fingerprint> {
	try {
		const content = await fs.promises.readFile(filePath);
		return createHash('sha256').update(content).digest('hex');
	} catch (error) {
		if (isPathMissing(error) || isDirectoryRead(error)) {
			return null;
		}
		throw error;
	}
}

async function readState(statePath: string): Promise<StateReadResult> {
	let value: unknown;
	try {
		value = JSON.parse(await fs.promises.readFile(statePath, 'utf8'));
	} catch (error) {
		return { state: undefined, reason: isPathMissing(error) ? 'incremental state is missing' : 'incremental state is unreadable' };
	}

	if (!isBuildFastState(value)) {
		return { state: undefined, reason: 'incremental state is malformed' };
	}
	return { state: value, reason: undefined };
}

async function writeState(statePath: string, state: BuildFastState): Promise<void> {
	const temporaryPath = `${statePath}.${process.pid}.tmp`;
	await fs.promises.writeFile(temporaryPath, `${JSON.stringify(state, null, '\t')}\n`, 'utf8');
	await fs.promises.rename(temporaryPath, statePath);
}

function isBuildFastState(value: unknown): value is BuildFastState {
	if (!isRecord(value)
		|| typeof value.schema !== 'number'
		|| typeof value.recipe !== 'number'
		|| typeof value.head !== 'string'
		|| typeof value.environment !== 'string'
		|| !isRecord(value.dirty)) {
		return false;
	}
	return Object.values(value.dirty).every(fingerprint => fingerprint === null || typeof fingerprint === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGlobalBuildInput(filePath: string): boolean {
	return filePath.startsWith('build/')
		|| filePath === 'gulpfile.mjs'
		|| filePath === 'package.json'
		|| filePath === 'package-lock.json'
		|| filePath === '.nvmrc';
}

function fullPlan(reason: string, changedPaths: readonly string[]): BuildFastPlan {
	return { reason, changedPaths, client: 'full', extensions: 'full', copilot: 'full' };
}

async function getOutputStatus(repoRoot: string): Promise<OutputStatus> {
	const [client, extensions, copilot] = await Promise.all([
		pathExists(path.join(repoRoot, 'out', 'main.js')),
		pathExists(path.join(repoRoot, 'extensions', 'configuration-editing', 'out', 'configurationEditingMain.js')),
		pathExists(path.join(repoRoot, 'extensions', 'copilot', 'dist', 'extension.js')),
	]);
	return { client, extensions, copilot };
}

function validateSelectedOutputs(plan: BuildFastPlan, outputs: OutputStatus): void {
	if (plan.client !== 'skip' && !outputs.client) {
		throw new Error('Client build completed without producing out/main.js.');
	}
	if (plan.extensions !== 'skip' && !outputs.extensions) {
		throw new Error('Extension build completed without producing the expected configuration-editing output.');
	}
	if (plan.copilot !== 'skip' && !outputs.copilot) {
		throw new Error('Copilot build completed without producing dist/extension.js.');
	}
}

async function runAllFull(repoRoot: string): Promise<void> {
	await runCommand(repoRoot, npmCommand(), [
		'run',
		'gulp',
		'copy-codicons',
		'compile-api-proposal-names',
		'compile-extension-point-names',
	], 'prerequisites');
	await waitForTasks([
		runCommand(repoRoot, process.execPath, [path.join(repoRoot, 'build', 'next', 'index.ts'), 'transpile'], 'client'),
		runCommand(repoRoot, npmCommand(), EXTENSION_BUILD_ARGS, 'extensions'),
		runCommand(repoRoot, npmCommand(), COPILOT_BUILD_ARGS, 'copilot'),
	]);
}

async function runCommand(cwd: string, command: string, args: readonly string[], label: string): Promise<void> {
	return runTimed(label, () => new Promise<void>((resolve, reject) => {
		const useShell = process.platform === 'win32' && path.basename(command).toLowerCase() === 'npm.cmd';
		const child = spawn(command, args, { cwd, stdio: 'inherit', shell: useShell });
		child.on('error', reject);
		child.on('close', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${label} build failed with exit code ${code}`));
			}
		});
	}));
}

async function waitForTasks(tasks: readonly Promise<void>[]): Promise<void> {
	const results = await Promise.allSettled(tasks);
	const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
	if (failure) {
		throw failure.reason;
	}
}

async function runTimed(label: string, task: () => Promise<void>): Promise<void> {
	const start = Date.now();
	await task();
	console.log(`[build-fast] ${label} finished in ${Date.now() - start}ms`);
}

function logPlan(plan: BuildFastPlan): void {
	console.log(`[build-fast] ${plan.reason}`);
	console.log(`[build-fast] client=${plan.client}, extensions=${plan.extensions}, copilot=${plan.copilot}`);
}

function readEnvironment(repoRoot: string): string {
	const copilotPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extensions', 'copilot', 'package.json'), 'utf8')) as {
		readonly devDependencies?: Readonly<Record<string, string>>;
	};
	return [
		`recipe=${BUILD_RECIPE}`,
		`platform=${process.platform}`,
		`arch=${process.arch}`,
		`node=${process.version}`,
		`esbuild=${esbuild.version}`,
		`copilot-esbuild=${copilotPackage.devDependencies?.esbuild ?? ''}`,
	].join(';');
}

async function acquireLock(lockPath: string): Promise<Lock> {
	try {
		const handle = await fs.promises.open(lockPath, 'wx');
		await handle.writeFile(String(process.pid), 'utf8');
		await handle.close();
		return {
			dispose: async () => {
				await fs.promises.rm(lockPath, { force: true });
			}
		};
	} catch (error) {
		if (!isAlreadyExists(error)) {
			throw error;
		}
	}

	const owner = await readLockOwner(lockPath);
	if (owner !== undefined && isProcessRunning(owner)) {
		throw new Error(`Another build-fast process is already running (PID ${owner}).`);
	}
	if (owner === undefined && await isFreshLock(lockPath)) {
		throw new Error('Another build-fast process is acquiring the build lock.');
	}
	throw new Error(`A stale build-fast lock exists at ${lockPath}. Remove it after confirming that no build-fast process is running.`);
}

async function isFreshLock(lockPath: string): Promise<boolean> {
	try {
		const stat = await fs.promises.stat(lockPath);
		return Date.now() - stat.mtimeMs < LOCK_STALE_AFTER_MS;
	} catch (error) {
		if (isPathMissing(error)) {
			return false;
		}
		throw error;
	}
}

async function readLockOwner(lockPath: string): Promise<number | undefined> {
	try {
		const owner = Number.parseInt(await fs.promises.readFile(lockPath, 'utf8'), 10);
		return Number.isSafeInteger(owner) && owner > 0 ? owner : undefined;
	} catch (error) {
		if (isPathMissing(error)) {
			return undefined;
		}
		throw error;
	}
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !isNoSuchProcess(error);
	}
}

function snapshotsEqual(first: BuildFastSnapshot, second: BuildFastSnapshot): boolean {
	return first.head === second.head && JSON.stringify(first.dirty) === JSON.stringify(second.dirty);
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath);
		return true;
	} catch (error) {
		if (isPathMissing(error)) {
			return false;
		}
		throw error;
	}
}

function normalizePath(filePath: string): string {
	return filePath.replaceAll('\\', '/');
}

function npmCommand(): string {
	return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isPathMissing(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function isDirectoryRead(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'EISDIR';
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function isNoSuchProcess(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}
