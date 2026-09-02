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
	AgentHostServerType,
	IAgentHostEndpointIdentity,
	IAgentHostEndpointMetadata,
	dedupeAgentHostEndpointMetadata,
	getAgentHostEndpointIdentityHashInput,
	parseAgentHostEndpointMetadataEntry,
	parseAgentHostEndpointRegistry,
} from '../common/agentHostEndpointRegistry.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { isPidAlive } from './agentHostLockfile.js';

const metadataDirectoryName = 'agent-host';
const endpointDirectoryName = 'local-endpoint';
const entriesDirectoryName = 'entries';
const legacyMetadataFileName = 'metadata.json';

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
	// Secure both the registry root and the entries directory beneath it.
	await prepareOwnerOnlyDirectory(getMetadataDirectory(userDataPath));
	await prepareOwnerOnlyDirectory(getEntriesDirectory(userDataPath));
}

async function prepareOwnerOnlyDirectory(directory: string): Promise<void> {
	await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
	const stat = await fs.promises.lstat(directory);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`Local agent host endpoint directory is not a directory: ${directory}`);
	}

	if (process.platform === 'win32') {
		await applyWindowsOwnerOnlyAcl(directory);
	} else {
		if (process.getuid && stat.uid !== process.getuid()) {
			throw new Error(`Local agent host endpoint directory is not owned by the current user: ${directory}`);
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
 * Publishes (or refreshes) this host's own `entries/<sha256hex>.json` file by
 * atomically renaming a freshly written temp file into place. Throws on any
 * filesystem failure; callers must stay running but undiscoverable rather than
 * retrying non-atomically.
 */
export async function publishLocalAgentHostEndpointMetadata(userDataPath: string, metadata: ILocalAgentHostEndpointMetadata, logService?: ILogService): Promise<void> {
	await prepareLocalAgentHostEndpointMetadataDirectory(userDataPath);
	const entriesDirectory = getEntriesDirectory(userDataPath);
	const entryPath = join(entriesDirectory, getAgentHostEndpointEntryFileName(metadata));
	await writeEntryFileAtomicAsync(entriesDirectory, entryPath, metadata, logService);
}

/**
 * Removes exactly `owner`'s own entry file. The path is derived from `owner`'s
 * identity, so this can never delete another writer's entry. Best-effort: the
 * shared entries directory is left in place to avoid racing concurrent
 * publishers, and failures are logged, never thrown.
 */
export function cleanupLocalAgentHostEndpointMetadataSync(userDataPath: string, owner: ILocalAgentHostEndpointMetadata, logService?: ILogService): void {
	const entryPath = join(getEntriesDirectory(userDataPath), getAgentHostEndpointEntryFileName(owner));
	try {
		fs.rmSync(entryPath, { force: true });
	} catch (error) {
		logService?.error(`[AgentHost] Failed to remove our local agent host endpoint entry ${entryPath}`, error);
	}
}

export function cleanupLocalAgentHostEndpointSocketSync(endpointPath: string): void {
	if (process.platform !== 'win32') {
		fs.rmSync(endpointPath, { force: true });
	}
}

/**
 * Reads and validates every live entry in the registry without taking a lock,
 * merging a read-only legacy `metadata.json` array left by older builds.
 * Confirmed-dead entries are pruned (and their own files best-effort removed);
 * the rest are deduped by identity — a live entry file winning over a colliding
 * legacy entry — and returned in a deterministic order.
 */
export async function readLocalAgentHostEndpointRegistry(userDataPath: string, logService?: ILogService): Promise<IAgentHostEndpointMetadata[]> {
	const entryFiles = await readEntryFilesAsync(getEntriesDirectory(userDataPath), logService);
	const legacy = await readLegacyRegistryAsync(getLegacyMetadataPath(userDataPath), logService);

	const live: IAgentHostEndpointMetadata[] = [];
	// Legacy entries first so a live entry file wins the dedupe on collision.
	for (const entry of legacy) {
		if (isPidAlive(entry.pid)) {
			live.push(entry);
		}
	}
	for (const { entry, path } of entryFiles) {
		if (isPidAlive(entry.pid)) {
			live.push(entry);
		} else {
			logService?.info(`[AgentHost] Pruning stale local endpoint registry entry: ${entry.type} PID ${entry.pid} (instance ${entry.instanceId}) is no longer running`);
			await fs.promises.rm(path, { force: true }).catch(() => { /* best effort */ });
		}
	}

	return sortForDeterministicOrder(dedupeAgentHostEndpointMetadata(live));
}

function getMetadataDirectory(userDataPath: string): string {
	return join(userDataPath, metadataDirectoryName, endpointDirectoryName);
}

function getEntriesDirectory(userDataPath: string): string {
	return join(getMetadataDirectory(userDataPath), entriesDirectoryName);
}

function getLegacyMetadataPath(userDataPath: string): string {
	return join(getMetadataDirectory(userDataPath), legacyMetadataFileName);
}

/**
 * The canonical `<sha256hex>.json` file name for `identity`, hashed over the
 * cross-language encoding from {@link getAgentHostEndpointIdentityHashInput} so
 * the editor and Rust CLI agree and the raw `instanceId` stays out of the path.
 */
function getAgentHostEndpointEntryFileName(identity: IAgentHostEndpointIdentity): string {
	const hash = createHash('sha256').update(getAgentHostEndpointIdentityHashInput(identity), 'utf8').digest('hex');
	return `${hash}.json`;
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

async function readEntryFilesAsync(entriesDirectory: string, logService?: ILogService): Promise<{ readonly entry: IAgentHostEndpointMetadata; readonly path: string }[]> {
	let names: string[];
	try {
		names = await fs.promises.readdir(entriesDirectory);
	} catch (error) {
		if (isNotFound(error)) {
			return [];
		}
		throw error;
	}

	const results: { entry: IAgentHostEndpointMetadata; path: string }[] = [];
	for (const name of names) {
		// Ignore temp staging files and other non-entry files quietly.
		if (!name.endsWith('.json')) {
			continue;
		}
		const path = join(entriesDirectory, name);
		const entry = await readEntryFileAsync(path, logService);
		if (!entry) {
			continue;
		}
		// A valid entry must live under its own canonical identity file name;
		// otherwise a misnamed copy could shadow or delete the real entry.
		if (name !== getAgentHostEndpointEntryFileName(entry)) {
			logService?.warn(`[AgentHost] Ignoring local agent host endpoint entry ${path} whose file name does not match its identity`);
			continue;
		}
		results.push({ entry, path });
	}
	return results;
}

async function readEntryFileAsync(path: string, logService?: ILogService): Promise<IAgentHostEndpointMetadata | undefined> {
	let raw: string;
	try {
		const stat = await fs.promises.lstat(path);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			return undefined;
		}
		raw = await fs.promises.readFile(path, 'utf8');
	} catch (error) {
		if (isNotFound(error)) {
			return undefined;
		}
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		if (error instanceof SyntaxError) {
			logService?.warn(`[AgentHost] Ignoring malformed local agent host endpoint entry ${path}`);
			return undefined;
		}
		throw error;
	}

	const entry = parseAgentHostEndpointMetadataEntry(parsed);
	if (!entry) {
		logService?.warn(`[AgentHost] Ignoring invalid or unsupported local agent host endpoint entry ${path}`);
		return undefined;
	}
	return entry;
}

async function readLegacyRegistryAsync(metadataPath: string, logService?: ILogService): Promise<IAgentHostEndpointMetadata[]> {
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

	try {
		return parseAgentHostEndpointRegistry(JSON.parse(raw));
	} catch (error) {
		if (error instanceof SyntaxError) {
			logService?.warn(`[AgentHost] Ignoring malformed legacy local agent host endpoint registry ${metadataPath}`);
			return [];
		}
		throw error;
	}
}

/** Atomically writes `metadata` to `entryPath` via a mode-`0600` temp file. */
async function writeEntryFileAtomicAsync(entriesDirectory: string, entryPath: string, metadata: IAgentHostEndpointMetadata, logService?: ILogService): Promise<void> {
	const temporaryPath = join(entriesDirectory, `${randomBytes(16).toString('hex')}.tmp`);
	const handle = await fs.promises.open(temporaryPath, 'wx', 0o600);
	try {
		await handle.writeFile(JSON.stringify(metadata), 'utf8');
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await renameReplacingAsync(temporaryPath, entryPath, logService);
	} finally {
		await fs.promises.rm(temporaryPath, { force: true }).catch(() => { /* best effort */ });
	}
}

/** Renames `from` onto `to`, retrying once past a transient Windows lock on our own file. */
async function renameReplacingAsync(from: string, to: string, logService?: ILogService): Promise<void> {
	try {
		await fs.promises.rename(from, to);
	} catch (error) {
		if (process.platform === 'win32' && isWindowsRenameContention(error)) {
			logService?.info(`[AgentHost] Replacing our own local agent host endpoint entry ${to} after a rename contention`);
			await fs.promises.rm(to, { force: true });
			await fs.promises.rename(from, to);
			return;
		}
		throw error;
	}
}

/** Deterministic order (standalone before editor, then `instanceId`), matching the Rust reader. */
function sortForDeterministicOrder(entries: IAgentHostEndpointMetadata[]): IAgentHostEndpointMetadata[] {
	return entries.sort((a, b) => {
		const rankDelta = serverTypeSortRank(a.type) - serverTypeSortRank(b.type);
		if (rankDelta !== 0) {
			return rankDelta;
		}
		return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
	});
}

function serverTypeSortRank(type: AgentHostServerType): number {
	return type === 'standalone' ? 0 : 1;
}

function isNotFound(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function isWindowsRenameContention(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === 'EPERM' || code === 'EACCES' || code === 'EEXIST';
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
