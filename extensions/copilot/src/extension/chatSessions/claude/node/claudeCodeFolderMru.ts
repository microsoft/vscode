/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitService } from '../../../../platform/git/common/gitService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { raceTimeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ResourceMap, ResourceSet } from '../../../../util/vs/base/common/map';
import { URI } from '../../../../util/vs/base/common/uri';
import { FolderRepositoryMRUEntry, IChatFolderMruService } from '../../common/folderRepositoryManager';
import { IClaudeCodeSessionService } from './sessionParser/claudeCodeSessionService';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const WORKTREE_PATH_PATTERNS = ['.claude/worktrees/', '.worktrees/copilot-'] as const;

function isWorktreePath(path: string): boolean {
	return WORKTREE_PATH_PATTERNS.some(pattern => path.includes(pattern));
}

export class ClaudeCodeFolderMruService implements IChatFolderMruService {
	declare _serviceBrand: undefined;
	private readonly removedFolders = new ResourceSet();
	private cachedEntries: FolderRepositoryMRUEntry[] | undefined = undefined;

	constructor(
		@IClaudeCodeSessionService private readonly sessionService: IClaudeCodeSessionService,
		@IGitService private readonly gitService: IGitService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) { }

	async getRecentlyUsedFolders(token: CancellationToken): Promise<FolderRepositoryMRUEntry[]> {
		const cachedEntries = this.cachedEntries;
		const entries = this.getRecentlyUsedFoldersImpl(token).then(entries => {
			this.cachedEntries = entries;
			return entries;
		});

		return (cachedEntries ? cachedEntries : await entries).filter(e => !this.removedFolders.has(e.folder));
	}

	private async getRecentlyUsedFoldersImpl(token: CancellationToken): Promise<FolderRepositoryMRUEntry[]> {
		const mruEntries = new ResourceMap<Mutable<FolderRepositoryMRUEntry>>();

		// We're getting MRU, don't delay session retrieve by more than 5s
		const sessions = await raceTimeout(this.sessionService.getAllSessions(token), 5_000);

		for (const session of (sessions ?? [])) {
			if (!session.cwd) {
				continue;
			}
			if (isWorktreePath(session.cwd)) {
				continue;
			}
			const folderUri = URI.file(session.cwd);
			const lastAccessed = session.lastRequestEnded ?? session.lastRequestStarted ?? session.created ?? 0;
			mruEntries.set(folderUri, {
				folder: folderUri,
				repository: undefined,
				lastAccessed,
			});
		}

		// Add recent git repositories
		for (const repo of this.gitService.getRecentRepositories()) {
			if (isWorktreePath(repo.rootUri.path)) {
				continue;
			}
			const existingEntry = mruEntries.get(repo.rootUri);
			if (existingEntry) {
				existingEntry.lastAccessed = Math.max(existingEntry.lastAccessed, repo.lastAccessTime);
				existingEntry.repository = repo.rootUri;
				continue;
			}
			mruEntries.set(repo.rootUri, {
				folder: repo.rootUri,
				repository: repo.rootUri,
				lastAccessed: repo.lastAccessTime,
			});
		}

		// If in multi-root folder add the folders as well, but on top.
		for (const folder of this.workspaceService.getWorkspaceFolders()) {
			const existingEntry = mruEntries.get(folder);
			if (existingEntry) {
				continue;
			}
			mruEntries.set(folder, {
				folder,
				repository: undefined,
				lastAccessed: Date.now(),
			});
		}

		return Array.from(mruEntries.values())
			.sort((a, b) => b.lastAccessed - a.lastAccessed);
	}

	async deleteRecentlyUsedFolder(folder: URI): Promise<void> {
		this.removedFolders.add(folder);
	}
}
