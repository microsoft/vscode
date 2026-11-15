/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../base/common/async.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { RepositoryRef } from '../../../../platform/github/common/client/types.js';
import { GitTreeEntry, GitTreeEntryMode, IContentClient } from '../../../../platform/github/common/content/content.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const MAX_PARALLEL_BLOB_FETCHES = 10;

export function parseGitHubCloneUrl(cloneUrl: string): RepositoryRef | undefined {
	let url: URL;
	try {
		url = new URL(cloneUrl);
	} catch {
		return undefined;
	}
	if (url.protocol !== 'https:' || !GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
		return undefined;
	}
	const path = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
	const segments = path.split('/');
	if (segments.length !== 2 || !segments[0] || !segments[1]) {
		return undefined;
	}
	return { owner: segments[0], repo: segments[1] };
}

/** Stages a repository's files and replaces the target only after every supported blob has been written. */
export async function fetchAndExtractGitHubRepo(
	content: IContentClient,
	fileService: IFileService,
	logService: ILogService,
	repo: RepositoryRef,
	sha: string,
	targetDir: URI,
	signal: AbortSignal,
): Promise<void> {
	const tree = await content.getTree(repo, sha, signal, { caller: 'pluginGit.tree', noCache: true, query: { recursive: true } });
	if (tree.truncated) {
		logService.warn(`[GitHubRepoFetcher] Tree for ${repo.owner}/${repo.repo}@${sha} is truncated; some files will be missing from the install`);
	}

	const stagingDir = joinPath(dirname(targetDir), `.staging-${generateUuid()}`);
	const resources = new DisposableStore();
	const limiter = resources.add(new Limiter<void>(MAX_PARALLEL_BLOB_FETCHES));
	const controller = new AbortController();
	const operationSignal = AbortSignal.any([signal, controller.signal]);
	try {
		operationSignal.throwIfAborted();
		await fileService.createFolder(stagingDir);
		const blobsToFetch: { entry: GitTreeEntry; dest: URI }[] = [];
		const createdDirs = new Set<string>([stagingDir.toString()]);

		for (const entry of tree.tree) {
			operationSignal.throwIfAborted();
			if (entry.type === 'commit') {
				logService.trace(`[GitHubRepoFetcher] Skipping submodule entry ${entry.path}`);
				continue;
			}
			if (entry.mode === GitTreeEntryMode.SymbolicLink) {
				logService.trace(`[GitHubRepoFetcher] Skipping symlink entry ${entry.path}`);
				continue;
			}
			const dest = safeJoinUnderTarget(stagingDir, entry.path);
			if (!dest) {
				logService.warn(`[GitHubRepoFetcher] Skipping unsafe tree entry path: ${entry.path}`);
				continue;
			}
			if (entry.type === 'tree') {
				if (!createdDirs.has(dest.toString())) {
					await fileService.createFolder(dest);
					createdDirs.add(dest.toString());
				}
				continue;
			}
			const parent = dirname(dest);
			if (parent.toString() !== dest.toString() && !createdDirs.has(parent.toString())) {
				await fileService.createFolder(parent);
				createdDirs.add(parent.toString());
			}
			blobsToFetch.push({ entry, dest });
		}

		await Promise.all(blobsToFetch.map(({ entry, dest }) => limiter.queue(async () => {
			operationSignal.throwIfAborted();
			const blob = await content.getBlob(repo, entry.sha, operationSignal, { caller: 'pluginGit.blob', noCache: true });
			operationSignal.throwIfAborted();
			await fileService.writeFile(dest, decodeBase64(blob.content.replace(/\s+/g, '')));
		})));

		operationSignal.throwIfAborted();
		await fileService.move(stagingDir, targetDir, true);
	} catch (error) {
		controller.abort(new CancellationError());
		// A late write must settle before cleanup or an authentication retry starts.
		await limiter.whenIdle();
		try {
			if (await fileService.exists(stagingDir)) {
				await fileService.del(stagingDir, { recursive: true });
			}
		} catch (cleanupError) {
			logService.warn(`[GitHubRepoFetcher] Failed to clean up staging dir ${stagingDir.toString()}:`, cleanupError);
		}
		throw error;
	} finally {
		resources.dispose();
	}
}

function safeJoinUnderTarget(targetDir: URI, inner: string): URI | undefined {
	if (inner.includes('\0') || inner.startsWith('/') || inner.startsWith('\\')) {
		return undefined;
	}
	const segments: string[] = [];
	for (const segment of inner.split('/')) {
		if (segment.length === 0 || segment === '.') {
			continue;
		}
		if (segment === '..' || segment.includes('\\')) {
			return undefined;
		}
		segments.push(segment);
	}
	if (segments.length === 0) {
		return undefined;
	}
	const dest = joinPath(targetDir, ...segments);
	return isEqualOrParent(dest, targetDir) ? dest : undefined;
}
