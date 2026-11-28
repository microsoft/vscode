/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VS Code-owned session metadata listing the Git repositories the host found for each session folder, by
 * working-directory key: the folder's own repository, when it is in one, or else the repositories in its immediate
 * subfolders (for example `app` and `lib` in a `work` folder). The host records it only when a folder has such nested
 * repositories. Absent metadata, from another or an older host, means each folder is its own repository.
 *
 * Where each repository's Git state is: a folder's own repository (`folder`) has the folder's Git state, under the
 * folder's working directory (the session's Git state for its first folder), also when its root is above the folder;
 * every other repository has the folder-scope Git state of its root.
 */
export const VSCODE_SESSION_REPOSITORIES_META_KEY = 'vscode.sessionRepositories';

/** How a repository was found; see {@link ISessionRepositoryEntry}. */
export type SessionRepositoryEntryKind = 'folder' | 'nested';

/** A repository of a session folder. */
export interface ISessionRepositoryEntry {
	/** The repository's root folder, a host URI. */
	readonly root: string;
	readonly kind: SessionRepositoryEntryKind;
}

const MAX_FOLDERS = 64;
const MAX_REPOSITORIES = 64;
const KINDS: ReadonlySet<string> = new Set<SessionRepositoryEntryKind>(['folder', 'nested']);

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

/** Returns `meta` with `repositories` as the repositories of each folder, or without them; preserves every other entry. */
export function withSessionRepositories(meta: Record<string, unknown> | undefined, repositories: Readonly<Record<string, readonly ISessionRepositoryEntry[]>> | undefined): Record<string, unknown> | undefined {
	const next: Record<string, unknown> = { ...meta };
	if (repositories) {
		next[VSCODE_SESSION_REPOSITORIES_META_KEY] = Object.fromEntries(Object.entries(repositories).map(([folderKey, entries]) => [folderKey, entries.map(({ root, kind }) => ({ root, kind }))]));
	} else {
		delete next[VSCODE_SESSION_REPOSITORIES_META_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}
