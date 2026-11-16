/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { getRepositoryRootFromWorktree } from './worktreePaths.js';

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

/** The key the Worktrees filter keeps for the sessions of `folder`. */
export function getWorktreeFilterKey(folder: URI): string {
	return extUriBiasedIgnorePathCase.getComparisonKey(folder);
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
 * without any offers no Worktrees filter. Folders are labelled by their name, and by their parent folder's name too where
 * names clash.
 */
export function getWorktreeFilterOptions(folders: Iterable<ISessionWorktreeFolder | undefined>): IWorktreeFilterOption[] {
	const repositories = new Map<string, { readonly repository: URI; readonly worktrees: Map<string, URI> }>();
	for (const entry of folders) {
		if (!entry) {
			continue;
		}
		const repositoryKey = getWorktreeFilterKey(entry.repository);
		let repository = repositories.get(repositoryKey);
		if (!repository) {
			repository = { repository: entry.repository, worktrees: new Map() };
			repositories.set(repositoryKey, repository);
		}
		const key = getWorktreeFilterKey(entry.folder);
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
	const names = new Map<string, number>();
	for (const { folder } of entries) {
		names.set(basename(folder), (names.get(basename(folder)) ?? 0) + 1);
	}
	return entries.map(({ key, folder, isRepository }) => ({
		key,
		isRepository,
		label: names.get(basename(folder))! > 1
			? localize('worktreeFilter.labelWithParent', "{0} ({1})", basename(folder), basename(dirname(folder)))
			: basename(folder),
	}));
}
