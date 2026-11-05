/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs, type BigIntStats, type Dir } from 'fs';
import { Limiter, Promises, SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorCode } from '../../../base/common/errors.js';
import { join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { SessionStatus } from '../common/state/sessionState.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

interface IWorktreeFileSystem {
	lstat(path: string): Promise<BigIntStats>;
	opendir(path: string): Promise<Dir>;
}

interface ILinkedFileUsage {
	readonly allocatedBytes: bigint;
	linkCount: bigint;
	measuredLinks: bigint;
}

const nodeFileSystem: IWorktreeFileSystem = {
	lstat: path => fs.lstat(path, { bigint: true }),
	opendir: fs.opendir,
};

export const IAgentHostWorktreeDiskUsageService = createDecorator<IAgentHostWorktreeDiskUsageService>('agentHostWorktreeDiskUsageService');

export interface IAgentHostWorktreeDiskUsageService {
	readonly _serviceBrand: undefined;
	measure(root: URI, token: CancellationToken, session?: URI): Promise<number | undefined>;
}

/** Owns the scan limit shared by every protocol endpoint in one host runtime. */
export class AgentHostWorktreeDiskUsageService extends Disposable implements IAgentHostWorktreeDiskUsageService {
	declare readonly _serviceBrand: undefined;
	private readonly _limiter = this._register(new Limiter<number | undefined>(2));
	private readonly _measurements = new SequencerByKey<string>();

	constructor(
		private readonly _fileSystem: IWorktreeFileSystem | undefined,
		@IAgentHostDatabase private readonly _database: IAgentHostDatabase,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	measure(root: URI, token: CancellationToken, session?: URI): Promise<number | undefined> {
		const measure = () => this._limiter.queue(async () => {
			throwIfCancelled(token);
			const fileSystem = this._fileSystem ?? nodeFileSystem;
			if (!session) {
				return measureWorktreeDiskUsage(root, token, fileSystem);
			}
			const rootStat = await statPath(root.fsPath, fileSystem);
			if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
				return undefined;
			}
			const sessionKey = session.toString();
			const worktree = root.toString();
			const owners = [sessionKey, ...(await this._database.readWorktreeCoOwners(worktree)).map(owner => owner.session)];
			const activityRevision = this._getIdleOwnersRevision(owners);
			const sessionRevision = await this._database.getWorktreeDiskUsageRevision(sessionKey, worktree);
			const currentActivityRevision = this._getIdleOwnersRevision(owners);
			let revision = sessionRevision === undefined || activityRevision === undefined || currentActivityRevision !== activityRevision || rootStat.birthtimeNs <= 0n
				? undefined : `${sessionRevision}\0${rootStat.dev}:${rootStat.ino}:${rootStat.birthtimeNs}`;
			if (activityRevision === undefined || currentActivityRevision !== activityRevision) {
				await this._database.deleteWorktreeDiskUsage(worktree);
			}
			if (revision !== undefined) {
				const cached = await this._database.readWorktreeDiskUsage(sessionKey, worktree, revision);
				throwIfCancelled(token);
				if (this._getIdleOwnersRevision(owners) !== activityRevision) {
					await this._database.deleteWorktreeDiskUsage(worktree);
					revision = undefined;
				} else if (cached !== undefined) {
					return cached;
				}
			}
			const sizeBytes = await measureWorktreeDiskUsage(root, token, fileSystem);
			if (revision !== undefined && sizeBytes !== undefined) {
				const currentSessionRevision = await this._database.getWorktreeDiskUsageRevision(sessionKey, worktree);
				throwIfCancelled(token);
				if (this._getIdleOwnersRevision(owners) !== activityRevision) {
					await this._database.deleteWorktreeDiskUsage(worktree);
				} else if (currentSessionRevision === sessionRevision) {
					await this._database.writeWorktreeDiskUsage(sessionKey, worktree, revision, sizeBytes);
				}
			}
			return sizeBytes;
		});
		return session ? this._measurements.queue(root.toString(), measure) : measure();
	}

	private _getIdleOwnersRevision(owners: readonly string[]): string | undefined {
		const summaries = owners.map(owner => this._stateManager.getSessionSummary(owner) ?? this._stateManager.getSurfacedSessionSummary(owner));
		if (summaries.some(summary => summary && (summary.status & SessionStatus.InProgress) !== 0)) {
			return undefined;
		}
		return JSON.stringify(summaries.map(summary => summary?.modifiedAt));
	}
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

function isMissing(error: unknown): boolean {
	const code = getErrorCode(error);
	return code === 'ENOENT' || code === 'ENOTDIR';
}

async function statPath(path: string, fileSystem: IWorktreeFileSystem): Promise<BigIntStats | undefined> {
	return fileSystem.lstat(path).catch(error => {
		if (isMissing(error)) {
			return undefined;
		}
		throw error;
	});
}

async function measureFiles(paths: string[], token: CancellationToken, fileSystem: IWorktreeFileSystem, device: bigint, linkedFiles: Map<string, ILinkedFileUsage>): Promise<bigint> {
	throwIfCancelled(token);
	const stats = await Promises.settled(paths.map(path => statPath(path, fileSystem)));
	let total = 0n;
	for (const stat of stats) {
		if (!stat?.isFile() || stat.dev !== device) {
			continue;
		}
		if (stat.blocks < 0n) {
			throw new Error('Allocated file size is unavailable');
		}
		// Node/libuv reports allocated blocks in 512-byte units, including on Windows.
		const allocatedBytes = stat.blocks * 512n;
		if (stat.nlink > 1n) {
			const key = `${stat.dev}:${stat.ino}`;
			const existing = linkedFiles.get(key);
			if (existing) {
				existing.measuredLinks++;
				if (stat.nlink > existing.linkCount) {
					existing.linkCount = stat.nlink;
				}
			} else {
				linkedFiles.set(key, { allocatedBytes, linkCount: stat.nlink, measuredLinks: 1n });
			}
		} else {
			total += allocatedBytes;
		}
	}
	return total;
}

/** Estimates reclaimable regular-file allocation on the root volume, excluding files linked outside the worktree. */
export async function measureWorktreeDiskUsage(root: URI, token: CancellationToken, fileSystem: IWorktreeFileSystem = nodeFileSystem): Promise<number | undefined> {
	throwIfCancelled(token);
	const rootStat = await statPath(root.fsPath, fileSystem);
	if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
		return undefined;
	}

	const pending = [root.fsPath];
	const linkedFiles = new Map<string, ILinkedFileUsage>();
	let total = 0n;
	while (pending.length > 0) {
		throwIfCancelled(token);
		const path = pending.pop()!;
		if (path !== root.fsPath) {
			const stat = await statPath(path, fileSystem);
			if (!stat?.isDirectory() || stat.isSymbolicLink() || stat.dev !== rootStat.dev) {
				continue;
			}
		}
		throwIfCancelled(token);
		const directory = await fileSystem.opendir(path).catch(error => {
			if (isMissing(error)) {
				return undefined;
			}
			throw error;
		});
		if (!directory) {
			continue;
		}
		let files: string[] = [];
		for await (const entry of directory) {
			throwIfCancelled(token);
			const path = join(directory.path, entry.name);
			if (entry.isDirectory()) {
				pending.push(path);
			} else if (entry.isFile()) {
				files.push(path);
				if (files.length === 8) {
					total += await measureFiles(files, token, fileSystem, rootStat.dev, linkedFiles);
					files = [];
				}
			}
		}
		total += await measureFiles(files, token, fileSystem, rootStat.dev, linkedFiles);
	}
	for (const usage of linkedFiles.values()) {
		if (usage.measuredLinks === usage.linkCount) {
			total += usage.allocatedBytes;
		}
	}
	throwIfCancelled(token);
	const sizeBytes = Number(total);
	if (!Number.isSafeInteger(sizeBytes)) {
		throw new RangeError('Worktree disk usage exceeds the supported byte range');
	}
	return sizeBytes;
}
