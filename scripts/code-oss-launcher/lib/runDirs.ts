/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run directories hold the throwaway copies a launch uses. Fresh ones are named
// `<yyyyMMdd-HHmmss>-<random>` and removed once nothing uses them; reused ones are named
// `reuse-<key>` and synced on each launch. `launch-state.json` records which processes use one.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs, realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const STATE_FILE = 'launch-state.json';
const CLAIM_FILE = 'launch-claim.json';
const REUSE_PREFIX = 'reuse-';
const DELETING_MARKER = '.deleting-';
// A launcher that has held a claim this long is assumed to be gone, whatever its PID says
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
// Leaves a fresh run directory alone while the launch that created it may still write its state
const FRESH_GRACE_MS = 2 * 60 * 1000;
const UNUSED_REUSE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Electron's main IPC socket, `<run-dir>/user-data/<version>-main.sock`, must fit the ~103-byte unix socket path limit
const UNIX_SOCKET_PATH_RESERVE = 30 + 'user-data/'.length;

export interface IRunState {
	readonly kind: 'fresh' | 'reuse';
	/** The launcher preparing the directory, until Code is up */
	readonly launcherPid?: number;
	/** The Code main process */
	readonly codePid?: number;
	readonly lastUsedAt: number;
}

/**
 * Where launches create run directories, in order of preference:
 * `CODE_OSS_DEV_RUN_ROOT`; on Windows `<volume>\.code-oss-dev` when the repo is on a Dev Drive
 * (ReFS, listed by the PowerShell wrapper in `CODE_OSS_DEV_REFS_VOLUMES`), whose performance-mode
 * virus scanning makes copies several times faster; otherwise a folder in the temp directory.
 */
export function getRunRoot(repo: string): string {
	if (process.env.CODE_OSS_DEV_RUN_ROOT) {
		return path.resolve(process.env.CODE_OSS_DEV_RUN_ROOT);
	}
	if (process.platform === 'win32') {
		const repoVolume = path.parse(path.resolve(repo)).root.toLowerCase();
		const refsVolumes = (process.env.CODE_OSS_DEV_REFS_VOLUMES ?? '').split(';').map(volume => volume.toLowerCase());
		if (refsVolumes.includes(repoVolume)) {
			return path.join(path.parse(path.resolve(repo)).root, '.code-oss-dev');
		}
	}
	return getTempRunRoot();
}

/**
 * The fallback run root in the temp directory. Long paths, so that run directories appear the same
 * in process command lines as in comparisons.
 */
export function getTempRunRoot(): string {
	const temp = realpathSync.native(os.tmpdir());
	if (process.platform === 'win32') {
		return path.join(temp, 'code-oss-dev');
	}
	// Per user, since the temp directory may be shared, as /tmp is on Linux. macOS's default TMPDIR
	// is too long for Electron's unix socket below a run directory.
	const name = `code-oss-dev-${os.userInfo().uid}`;
	const root = path.join(temp, name);
	return Buffer.byteLength(root) + '/20261020-120000-xxxxxx/'.length + UNIX_SOCKET_PATH_RESERVE <= 103 ? root : path.join('/tmp', name);
}

/**
 * Creates the run root, private to the current user on POSIX systems. An existing root must belong
 * to the current user, since run directories hold copies of authenticated profiles.
 */
async function ensureRunRoot(root: string): Promise<void> {
	await fs.mkdir(root, { recursive: true, mode: 0o700 });
	if (process.platform === 'win32') {
		return;
	}
	const stat = await fs.lstat(root);
	if (!stat.isDirectory() || stat.uid !== os.userInfo().uid) {
		throw new Error(`The run root ${root} must be a directory owned by the current user.`);
	}
	if ((stat.mode & 0o077) !== 0) {
		await fs.chmod(root, 0o700);
	}
}

/**
 * All roots a run directory may be in, for validating cleanup requests.
 */
export function isInRunRoot(runDir: string): boolean {
	const parent = path.dirname(path.resolve(runDir));
	if (process.env.CODE_OSS_DEV_RUN_ROOT) {
		return isSamePath(process.env.CODE_OSS_DEV_RUN_ROOT, parent);
	}
	const roots = [getTempRunRoot()];
	const isVolumeRoot = process.platform === 'win32' && path.basename(parent) === '.code-oss-dev' && path.dirname(parent) === path.parse(parent).root;
	return isVolumeRoot || roots.some(root => isSamePath(root, parent));
}

/**
 * Creates a new run directory, private to the current user on POSIX systems.
 */
export async function createFreshRunDir(root: string): Promise<string> {
	await ensureRunRoot(root);
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const runDir = await fs.mkdtemp(path.join(root, `${stamp}-`));
	await writeState(runDir, { kind: 'fresh', launcherPid: process.pid, lastUsedAt: Date.now() });
	return runDir;
}

/**
 * Claims the reused run directory for `key`, or returns `undefined` when another launch or a
 * running Code uses it. The claim must be released with {@link releaseClaim}.
 */
export async function claimReuseRunDir(root: string, key: string): Promise<string | undefined> {
	const runDir = path.join(root, `${REUSE_PREFIX}${key}`);
	await ensureRunRoot(root);
	await fs.mkdir(runDir, { recursive: true, mode: 0o700 });
	const claimFile = path.join(runDir, CLAIM_FILE);
	try {
		await fs.writeFile(claimFile, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await isClaimActive(runDir)) {
			return undefined;
		}
		// A launch that ended without releasing its claim
		await fs.rm(claimFile, { force: true });
		return claimReuseRunDir(root, key);
	}
	if (await isCodeRunningIn(runDir)) {
		await releaseClaim(runDir);
		return undefined;
	}
	return runDir;
}

export async function releaseClaim(runDir: string): Promise<void> {
	await fs.rm(path.join(runDir, CLAIM_FILE), { force: true });
}

export async function readState(runDir: string): Promise<IRunState | undefined> {
	try {
		return JSON.parse(await fs.readFile(path.join(runDir, STATE_FILE), 'utf8'));
	} catch {
		return undefined;
	}
}

export async function writeState(runDir: string, state: IRunState): Promise<void> {
	await fs.writeFile(path.join(runDir, STATE_FILE), JSON.stringify(state));
}

/**
 * Whether a launch is preparing the run directory or Code runs in it.
 */
export async function isRunDirInUse(runDir: string): Promise<boolean> {
	if (await isClaimActive(runDir)) {
		return true;
	}
	const state = await readState(runDir);
	if (state?.launcherPid !== undefined && state.launcherPid !== process.pid && isProcessAlive(state.launcherPid) && Date.now() - state.lastUsedAt < CLAIM_TIMEOUT_MS) {
		return true;
	}
	return isCodeRunningIn(runDir);
}

async function isCodeRunningIn(runDir: string): Promise<boolean> {
	if (process.platform === 'win32') {
		// Running Code keeps files below the run directory open, which makes renaming it fail.
		// Unlike a PID check, this is immune to PID reuse and also works without a state file.
		return !(await canRename(runDir));
	}
	const state = await readState(runDir);
	return state?.codePid !== undefined && isCodeProcessOf(runDir, state.codePid);
}

/**
 * The `--user-data-dir` argument launches pass for a run directory, in each spelling the directory
 * may have in a command line.
 */
function getUserDataArguments(runDir: string): string[] {
	const spellings = new Set([path.resolve(runDir)]);
	try {
		spellings.add(realpathSync.native(runDir));
	} catch {
		// Already gone
	}
	return [...spellings].map(spelling => `--user-data-dir=${path.join(spelling, 'user-data')}`);
}

function matchesUserDataArgument(commandLine: string, runDir: string): boolean {
	const flags = process.platform === 'win32' ? 'i' : '';
	return getUserDataArguments(runDir).some(argument => new RegExp(`(?:^|[\\s"])${escapeRegExp(argument)}(?=["\\s]|$)`, flags).test(commandLine));
}

/**
 * Stops only the process tree whose command line names this run's exact profile directory.
 */
export function stopCodeProcesses(runDir: string, codePid: number | undefined): boolean {
	if (process.platform === 'win32') {
		const pids = findCodeProcesses(runDir);
		for (const pid of pids) {
			spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
		}
		return pids.length > 0;
	}
	if (codePid === undefined || !isCodeProcessOf(runDir, codePid)) {
		return false;
	}
	try {
		// Both detached and managed POSIX launches have a private process group.
		process.kill(-codePid, 'SIGTERM');
		return true;
	} catch {
		try {
			process.kill(codePid, 'SIGTERM');
			return true;
		} catch {
			return false;
		}
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `pid` is a process of a launch in `runDir`, judged by its exact `--user-data-dir`
 * argument. A recorded PID alone is not enough: once Code exits, the PID may be reused by an
 * unrelated process.
 */
export function isCodeProcessOf(runDir: string, pid: number): boolean {
	if (!isProcessAlive(pid)) {
		return false;
	}
	if (process.platform === 'win32') {
		return findCodeProcesses(runDir).includes(pid);
	}
	const result = spawnSync('ps', ['-o', 'args=', '-p', String(pid)], { encoding: 'utf8' });
	return result.status === 0 && matchesUserDataArgument(result.stdout, runDir);
}

/**
 * The processes started with the profile in `runDir` on Windows: Code and its helper processes.
 */
export function findCodeProcesses(runDir: string): number[] {
	if (process.platform !== 'win32') {
		throw new Error('findCodeProcesses is only implemented on Windows');
	}
	const script = `Get-CimInstance Win32_Process -Filter "CommandLine like '%--user-data-dir=%'" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`;
	const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8' });
	return (result.stdout ?? '').split(/\r?\n/).flatMap(line => {
		const separator = line.indexOf('\t');
		const pid = Number(line.slice(0, separator));
		return separator > 0 && Number.isInteger(pid) && matchesUserDataArgument(line.slice(separator + 1), runDir) ? [pid] : [];
	});
}

async function isClaimActive(runDir: string): Promise<boolean> {
	try {
		const claim: { pid: number; at: number } = JSON.parse(await fs.readFile(path.join(runDir, CLAIM_FILE), 'utf8'));
		return claim.pid !== process.pid && isProcessAlive(claim.pid) && Date.now() - claim.at < CLAIM_TIMEOUT_MS;
	} catch {
		return false;
	}
}

async function canRename(runDir: string): Promise<boolean> {
	const probe = `${runDir}.probe-${randomBytes(4).toString('hex')}`;
	try {
		await fs.rename(runDir, probe);
	} catch {
		return false;
	}
	const errors: unknown[] = [];
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await fs.rename(probe, runDir);
			return true;
		} catch (error) {
			errors.push(error);
			if (attempt < 2) {
				await delay(100);
			}
		}
	}
	throw new AggregateError(errors, `Cannot restore run directory ${runDir} after checking its lock. Its contents remain at ${probe}; restore that path before retrying.`);
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: the process exists but belongs to someone else
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/**
 * Removes a run directory. It is renamed first, so that it disappears at once and a partial
 * deletion never leaves a broken run directory behind.
 */
export async function removeRunDir(runDir: string): Promise<void> {
	const deleting = `${runDir}${DELETING_MARKER}${randomBytes(4).toString('hex')}`;
	await fs.rename(runDir, deleting);
	await fs.rm(deleting, { recursive: true, force: true, maxRetries: 5 });
}

/**
 * Removes abandoned run directories: fresh ones nothing uses any more, reused ones unused for a week,
 * and leftovers of interrupted removals.
 */
export async function collectGarbage(root: string): Promise<string[]> {
	const removed: string[] = [];
	const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		const runDir = path.join(root, entry.name);
		try {
			if (entry.name.includes(DELETING_MARKER)) {
				await fs.rm(runDir, { recursive: true, force: true, maxRetries: 5 });
				removed.push(runDir);
				continue;
			}
			const state = await readState(runDir);
			if (!state) {
				continue;
			}
			const lastUsedAt = state?.lastUsedAt ?? (await fs.stat(runDir)).mtimeMs;
			const maxAge = entry.name.startsWith(REUSE_PREFIX) ? UNUSED_REUSE_MAX_AGE_MS : FRESH_GRACE_MS;
			// Without a state file only Windows can tell whether Code uses the directory
			if (Date.now() - lastUsedAt < maxAge || await isRunDirInUse(runDir)) {
				continue;
			}
			await removeRunDir(runDir);
			removed.push(runDir);
		} catch {
			// Became busy, or is being removed by another collection
		}
	}
	return removed;
}

function isSamePath(a: string, b: string): boolean {
	const normalize = (value: string) => process.platform === 'linux' ? path.resolve(value) : path.resolve(value).toLowerCase();
	return normalize(a) === normalize(b);
}
