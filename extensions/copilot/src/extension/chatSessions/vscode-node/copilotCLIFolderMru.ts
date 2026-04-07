/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Uri } from 'vscode';
import { IGitService } from '../../../platform/git/common/gitService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { raceTimeout } from '../../../util/vs/base/common/async';
import { ResourceMap, ResourceSet } from '../../../util/vs/base/common/map';
import { ChatSessionStatus } from '../../../vscodeTypes';
import { FolderRepositoryMRUEntry } from '../common/folderRepositoryManager';
import { ICopilotCLISessionService } from '../copilotcli/node/copilotcliSessionService';


type Mutable<T> = {
	-readonly [K in keyof T]: T[K];
};

export interface ICopilotCLIFolderMruService {
	readonly _serviceBrand: undefined;
	getRecentlyUsedFolders(token: CancellationToken): Promise<FolderRepositoryMRUEntry[]>;
	deleteRecentlyUsedFolder(folder: Uri): Promise<void>;
}
export const ICopilotCLIFolderMruService = createServiceIdentifier<ICopilotCLIFolderMruService>('ICopilotCLIFolderMruService');

export class CopilotCLIFolderMruService implements ICopilotCLIFolderMruService {
	declare _serviceBrand: undefined;
	private readonly removedFolders = new ResourceSet();
	private cachedEntries: FolderRepositoryMRUEntry[] | undefined = undefined;
	constructor(
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IGitService private readonly gitService: IGitService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) { }

	async getRecentlyUsedFolders(token: CancellationToken): Promise<FolderRepositoryMRUEntry[]> {
		const cachedEntries = this.cachedEntries;
		const entries = this.getRecentlyUsedFoldersImpl(token).then(entries => {
			this.cachedEntries = entries;
			return entries;
		});

		return (cachedEntries ? cachedEntries : await entries).filter(e => {
			if (this.removedFolders.has(e.folder)) {
				return false;
			}
			return true;
		});
	}

	async getRecentlyUsedFoldersImpl(token: CancellationToken): Promise<FolderRepositoryMRUEntry[]> {
		const mruEntries = new ResourceMap<Mutable<FolderRepositoryMRUEntry>>();

		// We're getting MRU, don't delay session retrieve by more than 5s
		const sessions = await raceTimeout(this.sessionService.getAllSessions(token), 5_000);

		for (const session of (sessions ?? [])) {
			if (!session.workingDirectory) {
				continue;
			}
			if (session.workingDirectory.path.includes('.worktrees/copilot-')) {
				continue;
			}
			const isActive = session.status === ChatSessionStatus.InProgress;
			const lastAccessed = session.timing?.lastRequestEnded ?? session.timing?.endTime ?? session.timing?.startTime ?? session.timing?.startTime ?? (isActive ? Date.now() : 0);
			mruEntries.set(session.workingDirectory, {
				folder: session.workingDirectory,
				repository: undefined,
				lastAccessed,
			});
		}

		// Add recent git repositories
		for (const repo of this.gitService.getRecentRepositories()) {
			if (repo.rootUri.path.includes('.worktrees/copilot-')) {
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

		// If in mult-root folder add the folders as well, but on top.
		for (const folder of this.workspaceService.getWorkspaceFolders()) {
			const existingEntry = mruEntries.get(folder);
			if (existingEntry) {
				continue;
			}
			mruEntries.set(folder, {
				folder: folder,
				repository: undefined,
				lastAccessed: Date.now(),
			});
		}

		return Array.from(mruEntries.values())
			.sort((a, b) => b.lastAccessed - a.lastAccessed);
	}

	async deleteRecentlyUsedFolder(folder: Uri): Promise<void> {
		this.removedFolders.add(folder);
	}
}
