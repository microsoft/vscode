/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How a session folder's Git repositories are found, from that folder's `git.autoRepositoryDetection`,
 * `git.repositoryScanMaxDepth`, `git.repositoryScanIgnoredFolders` and `git.detectSubmodules` settings. A client sends
 * them in the session's `repositoryDetection` configuration, by working-directory key. Without options for a folder,
 * only the folder's own repository is used.
 */
export interface IRepositoryDetectionOptions {
	/** Whether repositories in the folder's subfolders are found (`git.autoRepositoryDetection` `true` or `subFolders`). */
	readonly scanSubfolders: boolean;
	/** How many folder levels below the folder are scanned (`git.repositoryScanMaxDepth`); `-1` for no limit. */
	readonly scanMaxDepth: number;
	/** Folder names that are not scanned (`git.repositoryScanIgnoredFolders`). */
	readonly scanIgnoredFolders: readonly string[];
	/** Whether the submodules of a found repository are repositories too (`git.detectSubmodules`). */
	readonly detectSubmodules: boolean;
}

/** Reads the options of each folder from the session's `repositoryDetection` configuration value, dropping malformed entries. */
export function readRepositoryDetectionOptions(value: unknown): Readonly<Record<string, IRepositoryDetectionOptions>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const result: Record<string, IRepositoryDetectionOptions> = {};
	for (const [folderKey, options] of Object.entries(value)) {
		if (!options || typeof options !== 'object') {
			continue;
		}
		const { scanSubfolders, scanMaxDepth, scanIgnoredFolders, detectSubmodules } = options as Record<string, unknown>;
		if (typeof scanSubfolders === 'boolean' && typeof scanMaxDepth === 'number' && Number.isInteger(scanMaxDepth) && typeof detectSubmodules === 'boolean'
			&& Array.isArray(scanIgnoredFolders) && scanIgnoredFolders.every(folder => typeof folder === 'string')) {
			result[folderKey] = { scanSubfolders, scanMaxDepth, scanIgnoredFolders, detectSubmodules };
		}
	}
	return result;
}

/**
 * VS Code-owned session metadata listing the Git repositories the host found for each session folder, by
 * working-directory key: the folder's own repository first, when it is in one, then the repositories nested in it and
 * their submodules, as its {@link IRepositoryDetectionOptions} say. Each repository's Git state is the folder-scope Git
 * state of its root. Absent metadata, from another or an older host, means each folder is its own repository.
 */
export const VSCODE_SESSION_REPOSITORIES_META_KEY = 'vscode.sessionRepositories';

/** How a repository was found; see {@link ISessionRepositoryEntry}. */
export type SessionRepositoryEntryKind = 'folder' | 'nested' | 'submodule';

/** A repository of a session folder. */
export interface ISessionRepositoryEntry {
	/** The repository's root folder, a host URI. */
	readonly root: string;
	readonly kind: SessionRepositoryEntryKind;
}

const MAX_FOLDERS = 64;
const MAX_REPOSITORIES = 64;
const KINDS: ReadonlySet<string> = new Set<SessionRepositoryEntryKind>(['folder', 'nested', 'submodule']);

/** Reads the repositories of each folder; `undefined` when the host has not said, including for a malformed value. */
export function readSessionRepositories(meta: Record<string, unknown> | undefined): Readonly<Record<string, readonly ISessionRepositoryEntry[]>> | undefined {
	const value = meta?.[VSCODE_SESSION_REPOSITORIES_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const result: Record<string, readonly ISessionRepositoryEntry[]> = {};
	for (const [folderKey, entries] of Object.entries(value).slice(0, MAX_FOLDERS)) {
		if (Array.isArray(entries)) {
			result[folderKey] = entries.slice(0, MAX_REPOSITORIES).filter((entry): entry is ISessionRepositoryEntry =>
				!!entry && typeof entry === 'object' && typeof entry.root === 'string' && entry.root.length > 0 && KINDS.has(entry.kind)).map(({ root, kind }) => ({ root, kind }));
		}
	}
	return result;
}

/** Returns `meta` with `repositories` as the repositories of each folder; preserves every other entry. */
export function withSessionRepositories(meta: Record<string, unknown> | undefined, repositories: Readonly<Record<string, readonly ISessionRepositoryEntry[]>>): Record<string, unknown> {
	return { ...meta, [VSCODE_SESSION_REPOSITORIES_META_KEY]: Object.fromEntries(Object.entries(repositories).map(([folderKey, entries]) => [folderKey, entries.map(({ root, kind }) => ({ root, kind }))])) };
}
