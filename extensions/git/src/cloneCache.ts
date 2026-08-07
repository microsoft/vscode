/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface CachedCloneInfo {
	readonly repositoryPath: string;
	readonly workspacePath: string;
}

/**
 * Keep cache entries whose clone root (`repositoryPath`) still exists.
 * `workspacePath` alone is not sufficient — it may be a parent folder or `.code-workspace`.
 */
export async function filterExistingCachedRepositories<T extends CachedCloneInfo>(
	cachedRepository: readonly T[],
	options: {
		pathExists: (path: string) => Promise<boolean>;
		onMissing?: (info: T) => void;
	}
): Promise<T[]> {
	const checks = await Promise.all(cachedRepository.map(async (folder) => {
		const exists = await options.pathExists(folder.repositoryPath);
		if (!exists) {
			options.onMissing?.(folder);
		}
		return { folder, exists };
	}));
	return checks.filter(check => check.exists).map(check => check.folder);
}

/**
 * Prefer the cached workspace association when it still exists; otherwise open the clone root.
 */
export async function resolveCachedCloneOpenPath(
	info: CachedCloneInfo,
	pathExists: (path: string) => Promise<boolean>
): Promise<string> {
	if (info.workspacePath !== info.repositoryPath && await pathExists(info.workspacePath)) {
		return info.workspacePath;
	}
	return info.repositoryPath;
}
