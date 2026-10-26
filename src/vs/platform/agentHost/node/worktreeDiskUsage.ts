/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs, type BigIntStats, type Dir } from 'fs';
import { Limiter, Promises } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorCode } from '../../../base/common/errors.js';
import { join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

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
	measure(root: URI, token: CancellationToken): Promise<number | undefined>;
}

/** Owns the scan limit shared by every protocol endpoint in one host runtime. */
export class AgentHostWorktreeDiskUsageService extends Disposable implements IAgentHostWorktreeDiskUsageService {
	declare readonly _serviceBrand: undefined;
	private readonly _limiter = this._register(new Limiter<number | undefined>(2));

	constructor(private readonly _fileSystem: IWorktreeFileSystem = nodeFileSystem) {
		super();
	}

	measure(root: URI, token: CancellationToken): Promise<number | undefined> {
		return this._limiter.queue(() => measureWorktreeDiskUsage(root, token, this._fileSystem));
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
