/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * Session value (central only, never mirrored to older builds) listing the worktrees a session works in that
 * another session recorded, as the move that shared them recorded them (Move Chats, Block 5). A session whose
 * primary folder is one of them presents as a worktree session; an entry for a folder the session no longer
 * uses is ignored.
 */
export const WORKTREE_FOLDERS_KEY = 'agentHost.worktreeFolders';

/** A worktree folder a session works in since a move shared it (URI strings). */
export interface ISessionWorktreeFolder {
	readonly workingDirectory: string;
	readonly repositoryRoot: string;
	readonly branch: string;
}

/** Parses a recorded worktree folder list; a missing or invalid value yields none. */
export function parseSessionWorktreeFolders(raw: string | undefined): readonly ISessionWorktreeFolder[] {
	if (!raw) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isSessionWorktreeFolder) : [];
	} catch {
		return [];
	}
}

/** The recorded list with `added` merged in (one entry per folder, the newer wins), as a session value; `null` when empty. */
export function withSessionWorktreeFolders(raw: string | undefined, added: readonly ISessionWorktreeFolder[]): string | null {
	const merged = [...parseSessionWorktreeFolders(raw).filter(entry => !added.some(candidate => sameFolder(candidate.workingDirectory, entry.workingDirectory))), ...added];
	return merged.length > 0 ? JSON.stringify(merged) : null;
}

/** The repository of the recorded worktree that `primary` (a session's primary folder) is, if it is one. */
export function sessionWorktreeFolderRepositoryRoot(raw: string | undefined, primary: string | URI | undefined): string | undefined {
	if (primary === undefined) {
		return undefined;
	}
	const folder = typeof primary === 'string' ? URI.parse(primary) : primary;
	// The primary folder is the recorded worktree, or a folder inside it.
	return parseSessionWorktreeFolders(raw).find(entry => extUriBiasedIgnorePathCase.isEqualOrParent(folder, URI.parse(entry.workingDirectory)))?.repositoryRoot;
}

function sameFolder(a: string, b: string): boolean {
	try {
		return isEqual(URI.parse(a), URI.parse(b));
	} catch {
		return a === b;
	}
}

function isSessionWorktreeFolder(value: unknown): value is ISessionWorktreeFolder {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Partial<ISessionWorktreeFolder>;
	return typeof candidate.workingDirectory === 'string' && candidate.workingDirectory.length > 0
		&& typeof candidate.repositoryRoot === 'string' && candidate.repositoryRoot.length > 0
		&& typeof candidate.branch === 'string';
}
