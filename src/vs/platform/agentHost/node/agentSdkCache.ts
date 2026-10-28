/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentSdkProductConfig } from '../../../base/common/product.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationResult, IFileService, IFileStatWithMetadata, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';

/**
 * Written into a cached SDK (`<cacheRoot>/<packageId>/<version>/<sdkTarget>`)
 * once it is fully extracted. Its modification time records the SDK's last use.
 */
export const AGENT_SDK_CACHE_SENTINEL = '.complete';

/**
 * How long a cached SDK version that the product doesn't request is kept after
 * its last use. Remote servers of different versions share one cache, so an
 * older server that is still running can still need its version.
 */
const UNUSED_SDK_VERSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Scratch dirs (`<sdkTarget>.tmp.<pid>`) older than this belong to an interrupted download. */
const ABANDONED_DOWNLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Suffix of a version dir that was renamed out of the way to be deleted. */
const DELETING_SUFFIX = '.deleting';

/**
 * Deletes cached SDK versions under `cacheRoot` that `requestedSdks` doesn't
 * request and that no process has used for a week, and scratch dirs of
 * interrupted downloads. Every target of a requested version is kept. Best
 * effort: a version that can't be removed now, such as one whose binary is
 * running on Windows, is left for the next call.
 */
export async function removeUnusedAgentSdkVersions(
	cacheRoot: URI,
	requestedSdks: { readonly [packageId: string]: IAgentSdkProductConfig } | undefined,
	fileService: IFileService,
	logService: ILogService,
): Promise<void> {
	const now = Date.now();
	for (const packageDir of await listDirectories(cacheRoot, fileService, logService)) {
		const requestedVersion = requestedSdks?.[packageDir.name]?.version;
		for (const versionDir of await listDirectories(packageDir.resource, fileService, logService)) {
			try {
				await cleanUpVersion(versionDir, requestedVersion, now, fileService, logService);
			} catch (err) {
				logService.trace(`[AgentSdkCache] could not clean up ${versionDir.resource.fsPath}: ${err}`);
			}
		}
	}
}

async function cleanUpVersion(
	versionDir: IFileStatWithMetadata,
	requestedVersion: string | undefined,
	now: number,
	fileService: IFileService,
	logService: ILogService,
): Promise<void> {
	if (versionDir.name.endsWith(DELETING_SUFFIX)) {
		await fileService.del(versionDir.resource, { recursive: true });
		return;
	}
	await removeAbandonedDownloads(versionDir.resource, now, fileService, logService);
	if (versionDir.name !== requestedVersion && now - await lastUsed(versionDir, fileService, logService) > UNUSED_SDK_VERSION_MAX_AGE_MS) {
		// Rename first so that a version is either complete or gone. On Windows the
		// rename fails while any of its files is in use, before anything is deleted.
		// Elsewhere, a process still running this version finds its sentinel gone
		// and downloads the version again on next use.
		const deleting = URI.file(`${versionDir.resource.fsPath}.${process.pid}${DELETING_SUFFIX}`);
		await fileService.move(versionDir.resource, deleting);
		await fileService.del(deleting, { recursive: true });
		logService.info(`[AgentSdkCache] removed ${versionDir.resource.fsPath}, which no process has used for over a week`);
	}
}

/**
 * The latest use of a cached version: the newest sentinel of its targets, or
 * the version dir's own time if later, which changes whenever a download adds
 * a target to it.
 */
async function lastUsed(versionDir: IFileStatWithMetadata, fileService: IFileService, logService: ILogService): Promise<number> {
	let latest = versionDir.mtime;
	for (const targetDir of await listDirectories(versionDir.resource, fileService, logService)) {
		const sentinel = await fileService.stat(URI.joinPath(targetDir.resource, AGENT_SDK_CACHE_SENTINEL)).catch(() => undefined);
		latest = Math.max(latest, sentinel?.mtime ?? 0);
	}
	return latest;
}

async function removeAbandonedDownloads(versionDir: URI, now: number, fileService: IFileService, logService: ILogService): Promise<void> {
	for (const entry of await listDirectories(versionDir, fileService, logService)) {
		if (/\.tmp\.\d+$/.test(entry.name) && now - entry.mtime > ABANDONED_DOWNLOAD_MAX_AGE_MS) {
			await fileService.del(entry.resource, { recursive: true });
		}
	}
}

async function listDirectories(dir: URI, fileService: IFileService, logService: ILogService): Promise<IFileStatWithMetadata[]> {
	try {
		const stat = await fileService.resolve(dir, { resolveMetadata: true });
		return stat.children?.filter(child => child.isDirectory) ?? [];
	} catch (err) {
		if (toFileOperationResult(err as Error) !== FileOperationResult.FILE_NOT_FOUND) {
			logService.trace(`[AgentSdkCache] could not list ${dir.fsPath}: ${err}`);
		}
		return [];
	}
}
