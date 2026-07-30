/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../base/common/path.js';
import { ILogService } from '../../log/common/log.js';
import {
	AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
	IAgentHostEndpointIdentity,
	IAgentHostEndpointMetadata,
	dedupeAgentHostEndpointMetadata,
	parseAgentHostEndpointRegistry,
	removeAgentHostEndpointMetadata,
	upsertAgentHostEndpointMetadata,
} from '../common/agentHostEndpointRegistry.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { isPidAlive } from './agentHostLockfile.js';

const metadataDirectoryName = 'agent-host';
const endpointDirectoryName = 'local-endpoint';
const metadataFileName = 'metadata.json';

/** The editor's own entry in the shared local agent host endpoint registry. */
export type ILocalAgentHostEndpointMetadata = IAgentHostEndpointMetadata & {
	readonly type: 'editor';
	readonly endpoint: { readonly type: 'socket'; readonly path: string };
};

export function createLocalAgentHostEndpointMetadata(userDataPath: string): ILocalAgentHostEndpointMetadata {
	const instanceId = randomBytes(16).toString('base64url');
	return {
		schemaVersion: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
		type: 'editor',
		pid: process.pid,
		instanceId,
		endpoint: { type: 'socket', path: getEndpointPath(userDataPath, instanceId) },
		connectionToken: randomBytes(32).toString('base64url'),
		protocolVersion: PROTOCOL_VERSION,
	};
}

export async function prepareLocalAgentHostEndpointMetadataDirectory(userDataPath: string): Promise<void> {
	const directory = getMetadataDirectory(userDataPath);
	await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
	const stat = await fs.promises.lstat(directory);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`Local agent host endpoint metadata directory is not a directory: ${directory}`);
	}

	if (process.platform === 'win32') {
		await applyWindowsOwnerOnlyAcl(directory);
	} else {
		if (process.getuid && stat.uid !== process.getuid()) {
			throw new Error(`Local agent host endpoint metadata directory is not owned by the current user: ${directory}`);
		}
		await fs.promises.chmod(directory, 0o700);
	}
}

export async function prepareLocalAgentHostEndpointSocketDirectory(userDataPath: string): Promise<void> {
	if (process.platform !== 'win32') {
		const directory = getSocketDirectory(userDataPath);
		await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
		const stat = await fs.promises.lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error(`Local agent host endpoint socket directory is not a directory: ${directory}`);
		}
		if (process.getuid && stat.uid !== process.getuid()) {
			throw new Error(`Local agent host endpoint socket directory is not owned by the current user: ${directory}`);
		}
		await fs.promises.chmod(directory, 0o700);
	}
}

/**
 * Upserts `metadata` into the shared local agent host endpoint registry.
 *
 * Multiple processes (this editor, other editor windows, and the standalone
 * `code agent host` CLI) can publish to the same registry file concurrently,
 * so an atomic rename alone is not sufficient: two writers could otherwise
 * read the same array and overwrite each other's addition. This acquires a
 * sibling exclusive lock first, so the read-prune-upsert-write sequence
 * below is serialized across all writers. Readers remain lock-free because
 * the final write is an atomic rename.
 *
 * Throws if the lock cannot be acquired within a bounded timeout, or if any
 * filesystem operation fails; callers must treat that as "continue running,
 * but undiscoverable" and must not fall back to a non-atomic write.
 */
export async function publishLocalAgentHostEndpointMetadata(userDataPath: string, metadata: ILocalAgentHostEndpointMetadata, logService?: ILogService): Promise<void> {
	const metadataPath = getMetadataPath(userDataPath);
	const release = await acquireRegistryLockAsync(userDataPath, metadata, logService);
	if (!release) {
		throw new Error(`Timed out acquiring the local agent host endpoint registry lock at ${getLockDirectoryPath(userDataPath)}`);
	}
	try {
		const current = await readRegistryAsync(metadataPath);
		const live = pruneDeadAgentHostEndpointMetadata(current, logService);
		const next = upsertAgentHostEndpointMetadata(dedupeAgentHostEndpointMetadata(live), metadata);
		await writeRegistryAtomicAsync(metadataPath, metadata.instanceId, next);
	} finally {
		await release();
	}
}

/**
 * Removes exactly `owner`'s `(type, pid, instanceId)` entry from the
 * registry, reacquiring the write lock first. Deletes the file entirely
 * only when the resulting registry is empty. This is a best-effort shutdown
 * operation: failures are logged, never thrown, so process exit is never
 * blocked by cleanup.
 */
export function cleanupLocalAgentHostEndpointMetadataSync(userDataPath: string, owner: ILocalAgentHostEndpointMetadata, logService?: ILogService): void {
	const metadataPath = getMetadataPath(userDataPath);
	const release = acquireRegistryLockSync(userDataPath, owner, logService);
	if (!release) {
		logService?.error(`[AgentHost] Timed out acquiring the local agent host endpoint registry lock while removing our entry from ${metadataPath}`);
		return;
	}
	try {
		const current = readRegistrySync(metadataPath);
		const remaining = removeAgentHostEndpointMetadata(current, owner);
		if (remaining.length === current.length) {
			return;
		}
		if (remaining.length === 0) {
			fs.rmSync(metadataPath, { force: true });
		} else {
			writeRegistryAtomicSync(metadataPath, owner.instanceId, remaining);
		}
	} finally {
		release();
	}
}

export function cleanupLocalAgentHostEndpointSocketSync(endpointPath: string): void {
	if (process.platform !== 'win32') {
		fs.rmSync(endpointPath, { force: true });
	}
}

/**
 * Reads and validates every live entry in the shared local agent host
 * endpoint registry, without taking the write lock. Safe to call frequently
 * (e.g. from a file watcher) because the registry file is only ever
 * observed in a fully-written state via atomic rename.
 */
export async function readLocalAgentHostEndpointRegistry(userDataPath: string): Promise<IAgentHostEndpointMetadata[]> {
	return readRegistryAsync(getMetadataPath(userDataPath));
}

function getMetadataDirectory(userDataPath: string): string {
	return join(userDataPath, metadataDirectoryName, endpointDirectoryName);
}

function getMetadataPath(userDataPath: string): string {
	return join(getMetadataDirectory(userDataPath), metadataFileName);
}

function getLockDirectoryPath(userDataPath: string): string {
	return `${getMetadataPath(userDataPath)}.lock`;
}

function getLockOwnerFilePath(lockDirectoryPath: string): string {
	return join(lockDirectoryPath, 'owner.json');
}

function getSocketDirectory(userDataPath: string): string {
	const owner = process.getuid?.().toString() ?? '';
	const hash = createHash('sha256').update(`${owner}:${userDataPath}`).digest('hex').slice(0, 12);
	return join(os.tmpdir(), `vscode-ah-${hash}`);
}

function getEndpointPath(userDataPath: string, instanceId: string): string {
	if (process.platform === 'win32') {
		const userDataHash = createHash('sha256').update(userDataPath).digest('hex');
		return `\\\\.\\pipe\\vscode-agent-host-${userDataHash}-${instanceId}`;
	}
	return join(getSocketDirectory(userDataPath), `${instanceId}.sock`);
}

async function readRegistryAsync(metadataPath: string): Promise<IAgentHostEndpointMetadata[]> {
	let raw: string;
	try {
		const stat = await fs.promises.lstat(metadataPath);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			return [];
		}
		raw = await fs.promises.readFile(metadataPath, 'utf8');
	} catch (error) {
		if (isNotFound(error)) {
			return [];
		}
		throw error;
	}
	return parseRegistryJson(raw);
}

function readRegistrySync(metadataPath: string): IAgentHostEndpointMetadata[] {
	let raw: string;
	try {
		const stat = fs.lstatSync(metadataPath);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			return [];
		}
		raw = fs.readFileSync(metadataPath, 'utf8');
	} catch (error) {
		if (isNotFound(error)) {
			return [];
		}
		throw error;
	}
	return parseRegistryJson(raw);
}

function parseRegistryJson(raw: string): IAgentHostEndpointMetadata[] {
	try {
		return parseAgentHostEndpointRegistry(JSON.parse(raw));
	} catch (error) {
		if (error instanceof SyntaxError) {
			return [];
		}
		throw error;
	}
}

/**
 * Drops entries whose PID is confirmed dead. Entries are only ever pruned
 * here (i.e. when death is certain via a PID liveness check); a live PID, or
 * a PID we cannot check, is always kept.
 */
function pruneDeadAgentHostEndpointMetadata(entries: readonly IAgentHostEndpointMetadata[], logService?: ILogService): IAgentHostEndpointMetadata[] {
	return entries.filter(entry => {
		if (isPidAlive(entry.pid)) {
			return true;
		}
		logService?.info(`[AgentHost] Pruning stale local endpoint registry entry: ${entry.type} PID ${entry.pid} (instance ${entry.instanceId}) is no longer running`);
		return false;
	});
}

async function writeRegistryAtomicAsync(metadataPath: string, uniqueSuffix: string, entries: readonly IAgentHostEndpointMetadata[]): Promise<void> {
	const temporaryPath = `${metadataPath}.${uniqueSuffix}.tmp`;
	const handle = await fs.promises.open(temporaryPath, 'wx', 0o600);
	try {
		await handle.writeFile(JSON.stringify(entries), 'utf8');
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await fs.promises.rename(temporaryPath, metadataPath);
	} finally {
		await fs.promises.rm(temporaryPath, { force: true });
	}
}

function writeRegistryAtomicSync(metadataPath: string, uniqueSuffix: string, entries: readonly IAgentHostEndpointMetadata[]): void {
	const temporaryPath = `${metadataPath}.${uniqueSuffix}.tmp`;
	const fd = fs.openSync(temporaryPath, 'wx', 0o600);
	try {
		fs.writeFileSync(fd, JSON.stringify(entries), 'utf8');
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
	try {
		fs.renameSync(temporaryPath, metadataPath);
	} finally {
		fs.rmSync(temporaryPath, { force: true });
	}
}

// #region Multi-writer lock
//
// The lock is a sibling directory to metadata.json (metadata.json.lock).
// `mkdir` without `recursive` is used as the exclusive-acquire primitive
// because directory creation is atomic on every platform we support and
// requires no native/optional dependency. The lock holder's `(pid,
// instanceId)` is written into an owner file inside the directory so a
// contending process can recognize and reclaim an abandoned lock: if the
// recorded PID is confirmed dead, the lock is stale and is reclaimed
// immediately; otherwise acquisition is retried until a bounded timeout
// elapses, after which the caller is told to log and continue
// undiscoverable rather than silently bypassing the lock.

interface ILockOwner {
	readonly pid: number;
	readonly instanceId: string;
}

const asyncLockAcquireTimeoutMs = 3000;
const asyncLockRetryDelayMs = 40;
const syncLockAcquireTimeoutMs = 500;
const syncLockRetryDelayMs = 10;
/** Grace period for a lock directory whose owner file has not appeared yet, to avoid racing a concurrent acquirer that is mid-write. */
const lockOwnerGraceMs = 2000;

async function acquireRegistryLockAsync(userDataPath: string, owner: ILockOwner, logService?: ILogService): Promise<(() => Promise<void>) | undefined> {
	const lockDirectoryPath = getLockDirectoryPath(userDataPath);
	const deadline = Date.now() + asyncLockAcquireTimeoutMs;
	for (; ;) {
		try {
			await fs.promises.mkdir(lockDirectoryPath);
			await fs.promises.writeFile(getLockOwnerFilePath(lockDirectoryPath), JSON.stringify(owner), { encoding: 'utf8', mode: 0o600 });
			return () => releaseRegistryLockAsync(lockDirectoryPath, owner, logService);
		} catch (error) {
			if (!isAlreadyExists(error)) {
				throw error;
			}
			if (await tryReclaimStaleLockAsync(lockDirectoryPath, logService)) {
				continue;
			}
			if (Date.now() >= deadline) {
				return undefined;
			}
			await delay(asyncLockRetryDelayMs);
		}
	}
}

async function releaseRegistryLockAsync(lockDirectoryPath: string, owner: ILockOwner, logService?: ILogService): Promise<void> {
	try {
		const current = await readLockOwnerAsync(lockDirectoryPath);
		if (current && !isSameLockOwner(current, owner)) {
			// Another process already reclaimed this lock as stale; it now owns
			// this lock's lifecycle, so leave it alone.
			return;
		}
		await fs.promises.rm(lockDirectoryPath, { recursive: true, force: true });
	} catch (error) {
		logService?.error('[AgentHost] Failed to release the local agent host endpoint registry lock', error);
	}
}

async function tryReclaimStaleLockAsync(lockDirectoryPath: string, logService?: ILogService): Promise<boolean> {
	const owner = await readLockOwnerAsync(lockDirectoryPath);
	if (owner) {
		if (isPidAlive(owner.pid)) {
			return false;
		}
	} else if (!(await isLockDirectoryStaleWithoutOwnerAsync(lockDirectoryPath))) {
		return false;
	}
	try {
		await fs.promises.rm(lockDirectoryPath, { recursive: true, force: true });
	} catch {
		return false;
	}
	logService?.warn(`[AgentHost] Reclaimed a stale local agent host endpoint registry lock${owner ? ` from PID ${owner.pid}` : ''}`);
	return true;
}

async function readLockOwnerAsync(lockDirectoryPath: string): Promise<ILockOwner | undefined> {
	try {
		return parseLockOwner(JSON.parse(await fs.promises.readFile(getLockOwnerFilePath(lockDirectoryPath), 'utf8')));
	} catch {
		return undefined;
	}
}

async function isLockDirectoryStaleWithoutOwnerAsync(lockDirectoryPath: string): Promise<boolean> {
	try {
		const stat = await fs.promises.stat(lockDirectoryPath);
		return Date.now() - stat.mtimeMs > lockOwnerGraceMs;
	} catch {
		// The directory disappeared already (another process reclaimed it);
		// let the caller retry acquisition.
		return true;
	}
}

function acquireRegistryLockSync(userDataPath: string, owner: ILockOwner, logService?: ILogService): (() => void) | undefined {
	const lockDirectoryPath = getLockDirectoryPath(userDataPath);
	const deadline = Date.now() + syncLockAcquireTimeoutMs;
	for (; ;) {
		try {
			fs.mkdirSync(lockDirectoryPath);
			fs.writeFileSync(getLockOwnerFilePath(lockDirectoryPath), JSON.stringify(owner), { encoding: 'utf8', mode: 0o600 });
			return () => releaseRegistryLockSync(lockDirectoryPath, owner, logService);
		} catch (error) {
			if (!isAlreadyExists(error)) {
				throw error;
			}
			if (tryReclaimStaleLockSync(lockDirectoryPath, logService)) {
				continue;
			}
			if (Date.now() >= deadline) {
				return undefined;
			}
			sleepSync(syncLockRetryDelayMs);
		}
	}
}

function releaseRegistryLockSync(lockDirectoryPath: string, owner: ILockOwner, logService?: ILogService): void {
	try {
		const current = readLockOwnerSync(lockDirectoryPath);
		if (current && !isSameLockOwner(current, owner)) {
			return;
		}
		fs.rmSync(lockDirectoryPath, { recursive: true, force: true });
	} catch (error) {
		logService?.error('[AgentHost] Failed to release the local agent host endpoint registry lock', error);
	}
}

function tryReclaimStaleLockSync(lockDirectoryPath: string, logService?: ILogService): boolean {
	const owner = readLockOwnerSync(lockDirectoryPath);
	if (owner) {
		if (isPidAlive(owner.pid)) {
			return false;
		}
	} else if (!isLockDirectoryStaleWithoutOwnerSync(lockDirectoryPath)) {
		return false;
	}
	try {
		fs.rmSync(lockDirectoryPath, { recursive: true, force: true });
	} catch {
		return false;
	}
	logService?.warn(`[AgentHost] Reclaimed a stale local agent host endpoint registry lock${owner ? ` from PID ${owner.pid}` : ''}`);
	return true;
}

function readLockOwnerSync(lockDirectoryPath: string): ILockOwner | undefined {
	try {
		return parseLockOwner(JSON.parse(fs.readFileSync(getLockOwnerFilePath(lockDirectoryPath), 'utf8')));
	} catch {
		return undefined;
	}
}

function isLockDirectoryStaleWithoutOwnerSync(lockDirectoryPath: string): boolean {
	try {
		const stat = fs.statSync(lockDirectoryPath);
		return Date.now() - stat.mtimeMs > lockOwnerGraceMs;
	} catch {
		return true;
	}
}

function parseLockOwner(raw: unknown): ILockOwner | undefined {
	if (typeof raw !== 'object' || raw === null) {
		return undefined;
	}
	const obj = raw as Record<string, unknown>;
	if (typeof obj.pid !== 'number' || typeof obj.instanceId !== 'string') {
		return undefined;
	}
	return { pid: obj.pid, instanceId: obj.instanceId };
}

function isSameLockOwner(a: IAgentHostEndpointIdentity | ILockOwner, b: IAgentHostEndpointIdentity | ILockOwner): boolean {
	return a.pid === b.pid && a.instanceId === b.instanceId;
}

function isAlreadyExists(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/** Synchronous bounded sleep, only used on the shutdown/cleanup path where an `async` wait is not usable (dispose() is synchronous). */
function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// #endregion

function isNotFound(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

async function applyWindowsOwnerOnlyAcl(path: string): Promise<void> {
	const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
	if (!systemRoot) {
		throw new Error('Unable to resolve the Windows system directory for local agent host metadata.');
	}
	const systemDirectory = join(systemRoot, 'System32');
	const whoAmI = await runWindowsCommand(join(systemDirectory, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
	const sid = whoAmI.match(/S-\d+(?:-\d+)+/)?.[0];
	if (!sid) {
		throw new Error('Unable to determine the current Windows user SID for local agent host metadata.');
	}
	const icacls = join(systemDirectory, 'icacls.exe');
	await runWindowsCommand(icacls, [path, '/reset']);
	await runWindowsCommand(icacls, [
		path,
		'/inheritance:r',
		'/grant:r',
		`*${sid}:(OI)(CI)F`,
		'*S-1-5-18:(OI)(CI)F',
		'*S-1-5-32-544:(OI)(CI)F',
	]);
}

function runWindowsCommand(command: string, args: readonly string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, [...args], { encoding: 'utf8', windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(String(stdout)));
	});
}
