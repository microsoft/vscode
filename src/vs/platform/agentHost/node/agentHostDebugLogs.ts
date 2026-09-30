/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { copyFile, mkdir, open, readdir, rm, stat } from 'fs/promises';
import { disposableTimeout } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { zip, type IFile } from '../../../base/node/zip.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import type { ILogService } from '../../log/common/log.js';
import type { IAgent } from '../common/agent.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../common/agentService.js';

type DebugLogsProvider = Pick<IAgent, 'id' | 'collectDebugLogs'>;
type LocalZipFile = IFile & { readonly localPath: string };
const DEFAULT_ARTIFACT_LEASE_MS = 10 * 60 * 1000;

export interface IAgentHostDebugLogsEnvironment {
	readonly logsHome: URI;
	readonly tmpDir: URI;
}

export class AgentHostDebugLogsCollector extends Disposable {
	private readonly _retainedArtifacts = new Map<string, boolean>();
	private readonly _readableArtifacts = new Set<string>();

	constructor(
		private readonly _environment: IAgentHostDebugLogsEnvironment,
		private readonly _logService: ILogService,
		private readonly _artifactLeaseMs = DEFAULT_ARTIFACT_LEASE_MS,
	) {
		super();
		this._register(toDisposable(() => void this.cleanup()));
	}

	async collect(providers: readonly DebugLogsProvider[], session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact> {
		const id = generateUuid();
		const staging = join(this._environment.tmpDir.fsPath, `agent-host-debug-logs-${id}`);
		await mkdir(staging, { recursive: true });
		this._retainedArtifacts.set(artifactKey(staging), true);
		let providerLogsIncluded = false;
		let retainStaging = false;
		const archive = join(this._environment.tmpDir.fsPath, `agent-host-debug-logs-${id}.zip`);
		try {
			for (const provider of providers) {
				if (!provider.collectDebugLogs) {
					continue;
				}
				// An implemented provider contributor is part of this collection,
				// so its failure must fail the export. Providers without additional
				// diagnostics still get the Agent Host process log below.
				providerLogsIncluded = await provider.collectDebugLogs(session, URI.file(staging), chat) || providerLogsIncluded;
			}

			await this._copyAgentHostLogs(staging);

			const files = await collectFiles(staging);
			let uncompressedSize = 0;
			const artifactEntries: { path: string; size: number }[] = [];
			for (const file of files) {
				const { size } = await stat(file.localPath);
				uncompressedSize += size;
				artifactEntries.push({ path: file.path, size });
			}
			if (kind === 'directory') {
				retainStaging = true;
				this._scheduleCleanup(staging, true, files.map(file => file.localPath));
				return { kind, resource: URI.file(staging), providerLogsIncluded, size: uncompressedSize, uncompressedSize, entries: artifactEntries };
			}

			await zip(archive, files);
			const archiveSize = (await stat(archive)).size;
			this._scheduleCleanup(archive, false, [archive]);
			return { kind, resource: URI.file(archive), providerLogsIncluded, size: archiveSize, uncompressedSize, entries: artifactEntries };
		} catch (error) {
			await rm(archive, { force: true });
			throw error;
		} finally {
			if (!retainStaging) {
				await rm(staging, { recursive: true, force: true });
				this._retainedArtifacts.delete(artifactKey(staging));
			}
		}
	}

	/**
	 * Read one bounded slice of an artifact this collector produced. The
	 * resource must be a currently retained *file* artifact, so this cannot be
	 * used as a general-purpose file read.
	 */
	async readArtifactChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		if (resource.scheme !== Schemas.file) {
			throw new Error(`Unsupported debug-log artifact scheme: ${resource.scheme}`);
		}
		if (!Number.isSafeInteger(position) || position < 0) {
			throw new Error(`Invalid debug-log artifact position: ${position}`);
		}
		const path = resource.fsPath;
		if (!this._readableArtifacts.has(artifactKey(path))) {
			throw new Error('Unknown or expired Agent Host debug-log artifact');
		}

		const handle = await open(path, 'r');
		try {
			const buffer = Buffer.allocUnsafe(AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES);
			const { bytesRead } = await handle.read(buffer, 0, AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, position);
			const { size } = await handle.stat();
			return {
				data: VSBuffer.wrap(buffer.subarray(0, bytesRead)),
				eof: position + bytesRead >= size,
			};
		} finally {
			await handle.close();
		}
	}

	async cleanup(): Promise<void> {
		const artifacts = [...this._retainedArtifacts];
		this._retainedArtifacts.clear();
		this._readableArtifacts.clear();
		await Promise.all(artifacts.map(async ([path, recursive]) => {
			try {
				await rm(path, { recursive, force: true });
			} catch (error) {
				this._logService.warn(`[AgentHostDebugLogs] Failed to remove temporary artifact during shutdown ${path}`, error);
			}
		}));
	}

	private async _copyAgentHostLogs(staging: string): Promise<void> {
		let names: string[];
		try {
			names = (await readdir(this._environment.logsHome.fsPath, { withFileTypes: true }))
				.filter(entry => entry.isFile() && (
					isRotatedLogFile(entry.name, 'agenthost.log')
					|| isRotatedLogFile(entry.name, 'agenthost-server.log')
				))
				.map(entry => entry.name);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				this._logService.warn(`[AgentHostDebugLogs] Failed to enumerate Agent Host process logs`, error);
			}
			return;
		}
		for (const name of names) {
			const source = join(this._environment.logsHome.fsPath, name);
			try {
				await copyFile(source, join(staging, name));
			} catch (error) {
				this._logService.warn(`[AgentHostDebugLogs] Failed to include ${source}`, error);
			}
		}
	}

	private _scheduleCleanup(path: string, recursive: boolean, readablePaths: readonly string[]): void {
		this._retainedArtifacts.set(artifactKey(path), recursive);
		for (const readablePath of readablePaths) {
			this._readableArtifacts.add(artifactKey(readablePath));
		}
		this._register(disposableTimeout(() => {
			this._retainedArtifacts.delete(artifactKey(path));
			for (const readablePath of readablePaths) {
				this._readableArtifacts.delete(artifactKey(readablePath));
			}
			rm(path, { recursive, force: true }).catch(error => {
				this._logService.warn(`[AgentHostDebugLogs] Failed to expire temporary artifact ${path}`, error);
			});
		}, this._artifactLeaseMs));
	}
}

/**
 * Normalizes a path for artifact bookkeeping. `URI.file(…).fsPath` lower-cases
 * Windows drive letters, so keys must be derived the same way on both the
 * writing and the lookup side or reads would never match on Windows.
 */
function artifactKey(path: string): string {
	return URI.file(path).fsPath;
}

async function collectFiles(root: string, relative = '', files: LocalZipFile[] = []): Promise<LocalZipFile[]> {
	const directory = join(root, relative);
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries) {
		const path = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			await collectFiles(root, path, files);
		} else if (entry.isFile()) {
			files.push({ path, localPath: join(root, path) });
			if (files.length > AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES) {
				throw new Error(`Agent Host debug logs contain too many files (${files.length}; limit ${AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES})`);
			}
		}
	}
	return files;
}

function isRotatedLogFile(candidate: string, current: string): boolean {
	if (candidate === current) {
		return true;
	}
	const stem = current.endsWith('.log') ? current.slice(0, -'.log'.length) : current;
	const prefix = `${stem}.`;
	if (!candidate.startsWith(prefix) || !candidate.endsWith('.log')) {
		return false;
	}
	const rotation = candidate.slice(prefix.length, -'.log'.length);
	return /^[1-9]\d*$/.test(rotation);
}
