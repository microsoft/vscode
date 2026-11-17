/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, IExtUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { getRepositoryRootFromWorktree } from '../../../../platform/agentHost/common/worktreePaths.js';

/**
 * Where a session works, as the sessions lists' Worktrees filter sees it: `folder` is a worktree of the git repository at
 * `repository`, or that repository's own folder when they are the same.
 */
export interface ISessionWorktreeFolder {
	readonly repository: URI;
	readonly folder: URI;
}

/**
 * The worktree folder of a session that works in `folder`. Its repository is `repository` where the session knows it,
 * else the repository that `folder` is a VS Code-created worktree of (`<repo>.worktrees/<name>`), else `folder` itself.
 */
export function getSessionWorktreeFolder(folder: URI | undefined, repository?: URI): ISessionWorktreeFolder | undefined {
	return folder && { folder, repository: repository ?? getRepositoryRootFromWorktree(folder) ?? folder };
}

/**
 * The key the Worktrees filter keeps for the sessions of `folder`, as `extUri` compares it: pass the URI identity service's `extUri`,
 * which ignores path case only where the folder's file system does.
 */
export function getWorktreeFilterKey(folder: URI, extUri: IExtUri): string {
	return extUri.getComparisonKey(folder);
}

export interface IWorktreeFilterOption {
	readonly key: string;
	readonly label: string;
	/** Whether this is the repository's own folder rather than one of its worktrees. */
	readonly isRepository: boolean;
}

/**
 * The options of the Worktrees filter for sessions that work in `folders`: of each repository that some of them work in
 * a worktree of, its own folder and those worktrees. Repositories without worktree sessions offer nothing, so a list
 * without any offers no Worktrees filter. Folders are labelled by their name, and where names clash also by as many of
 * their parent folders as tell them apart.
 */
export function getWorktreeFilterOptions(folders: Iterable<ISessionWorktreeFolder | undefined>, extUri: IExtUri): IWorktreeFilterOption[] {
	const repositories = new Map<string, { readonly repository: URI; readonly worktrees: Map<string, URI> }>();
	for (const entry of folders) {
		if (!entry) {
			continue;
		}
		const repositoryKey = getWorktreeFilterKey(entry.repository, extUri);
		let repository = repositories.get(repositoryKey);
		if (!repository) {
			repository = { repository: entry.repository, worktrees: new Map() };
			repositories.set(repositoryKey, repository);
		}
		const key = getWorktreeFilterKey(entry.folder, extUri);
		if (key !== repositoryKey) {
			repository.worktrees.set(key, entry.folder);
		}
	}
	const byName = (a: [string, URI], b: [string, URI]) => basename(a[1]).localeCompare(basename(b[1])) || a[0].localeCompare(b[0]);
	const entries: { readonly key: string; readonly folder: URI; readonly isRepository: boolean }[] = [];
	const sorted = [...repositories].sort((a, b) => byName([a[0], a[1].repository], [b[0], b[1].repository]));
	for (const [key, { repository, worktrees }] of sorted) {
		if (worktrees.size === 0) {
			continue;
		}
		entries.push({ key, folder: repository, isRepository: true });
		for (const [worktreeKey, folder] of [...worktrees].sort(byName)) {
			entries.push({ key: worktreeKey, folder, isRepository: false });
		}
	}
	const sameName = new Map<string, URI[]>();
	for (const { folder } of entries) {
		sameName.set(basename(folder), [...sameName.get(basename(folder)) ?? [], folder]);
	}
	const parents = new Map<URI, string>();
	for (const folders of sameName.values()) {
		if (folders.length > 1) {
			getDistinguishingParents(folders).forEach((parent, index) => parents.set(folders[index], parent));
		}
	}
	return entries.map(({ key, folder, isRepository }) => {
		const parent = parents.get(folder);
		return { key, isRepository, label: parent ? localize('worktreeFilter.labelWithParent', "{0} ({1})", basename(folder), parent) : basename(folder) };
	});
}

/**
 * The fewest trailing parent folders of each of `folders`, which share a name, that tell them apart, such as `one/repo.worktrees`
 * and `two/repo.worktrees`; else their whole parent paths, with their authorities.
 */
function getDistinguishingParents(folders: readonly URI[]): string[] {
	const segments = folders.map(folder => dirname(folder).path.split('/').filter(segment => segment.length > 0));
	const depth = Math.max(...segments.map(parent => parent.length));
	for (let count = 1; count <= depth; count++) {
		const parents = segments.map(parent => parent.slice(-count).join('/'));
		if (new Set(parents).size === parents.length) {
			return parents;
		}
	}
	// Join the segments rather than use the parent's path, which keeps a trailing separator at a root, such as `\\server\share\` on Windows
	return segments.map((parent, index) => `${folders[index].authority}/${parent.join('/')}`);
}

/** A session as the Worktrees filter picks one to open: its folder's filter key, if it has one, and how recently it was used. */
export interface IWorktreeFilterSession {
	readonly id: string;
	/** Its folder's Worktrees filter key ({@link getWorktreeFilterKey}); none for sessions without a folder. */
	readonly worktree: string | undefined;
	readonly isArchived: boolean;
	/** When it was last used, for the most recent one. */
	readonly time: number;
}

/**
 * The session last shown of each worktree folder, by its Worktrees filter key ({@link getWorktreeFilterKey}): the most recent
 * folders only, the most recent last. A session is the last one of one folder only, the one it was last shown in.
 */
export class WorktreeLastSessions {

	private readonly _sessions = new Map<string, string>();

	constructor(private readonly _limit = 50) { }

	/** Remembers `session` as the last one of `worktree`, and returns whether that changed anything. */
	remember(worktree: string, session: string): boolean {
		const latest = [...this._sessions].at(-1);
		if (latest && latest[0] === worktree && latest[1] === session) {
			return false;
		}
		for (const [known, remembered] of [...this._sessions]) {
			if (remembered === session) {
				this._sessions.delete(known);
			}
		}
		this._sessions.delete(worktree);
		this._sessions.set(worktree, session);
		for (const oldest of this._sessions.keys()) {
			if (this._sessions.size <= this._limit) {
				break;
			}
			this._sessions.delete(oldest);
		}
		return true;
	}

	get(worktree: string): string | undefined {
		return this._sessions.get(worktree);
	}

	/** Remembers `to` where `from` is remembered, such as a session that replaced it; returns whether it was. */
	replace(from: string, to: string): boolean {
		let changed = false;
		for (const [worktree, session] of this._sessions) {
			if (session === from) {
				this._sessions.set(worktree, to);
				changed = true;
			}
		}
		return changed;
	}

	/** Forgets `session` wherever it is remembered; returns whether it was. */
	forget(session: string): boolean {
		let changed = false;
		for (const [worktree, remembered] of [...this._sessions]) {
			if (remembered === session) {
				this._sessions.delete(worktree);
				changed = true;
			}
		}
		return changed;
	}

	/** The remembered folders and their sessions, the oldest first. */
	entries(): readonly (readonly [worktree: string, session: string])[] {
		return [...this._sessions];
	}
}

/**
 * The session to open as the user picks the worktree folder `worktree` in the Worktrees filter: none while the shown session
 * works in it already; else the one last shown of it, while it still works there and is not archived; else its most recent
 * session not archived. Archived sessions are never picked.
 */
export function getWorktreeSessionToOpen(worktree: string, shown: IWorktreeFilterSession | undefined, sessions: readonly IWorktreeFilterSession[], last: string | undefined): IWorktreeFilterSession | undefined {
	if (shown?.worktree === worktree) {
		return undefined;
	}
	const candidates = sessions.filter(session => session.worktree === worktree && !session.isArchived);
	return candidates.find(session => session.id === last)
		?? candidates.reduce<IWorktreeFilterSession | undefined>((latest, session) => !latest || session.time > latest.time ? session : latest, undefined);
}
