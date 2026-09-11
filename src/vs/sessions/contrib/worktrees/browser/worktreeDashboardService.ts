/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, RunOnceScheduler, Throttler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { WorktreeContainsChangesError } from '../common/worktreeDashboardErrors.js';
import { IDiscoveredWorktreeDirectory, correlateWorktrees } from '../common/worktreeDashboardModel.js';
import { IRemoveWorktreeOptions, IWorktreeDashboardEntry, IWorktreeDashboardService } from '../common/worktreeDashboard.js';

/** Maximum number of concurrent `_git.getFolderSize` calls while computing worktree disk usage. */
const SIZE_SCAN_CONCURRENCY = 4;

class WorktreeDashboardService extends Disposable implements IWorktreeDashboardService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = observableValue<IWorktreeDashboardEntry[]>(this, []);
	readonly entries: IObservable<IWorktreeDashboardEntry[]> = this._entries;
	private readonly _hasRefreshed = observableValue(this, false);
	readonly hasRefreshed: IObservable<boolean> = this._hasRefreshed;
	private readonly _refreshThrottler = this._register(new Throttler());
	private readonly _refreshScheduler = this._register(new RunOnceScheduler(() => void this._refreshWithLogging(), 30_000));

	private _refreshGeneration = 0;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IFileService private readonly fileService: IFileService,
		@ICommandService private readonly commandService: ICommandService,
		@IHostService private readonly hostService: IHostService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			if (this._hasRefreshed.read(undefined)) {
				this._refreshScheduler.schedule();
			} else {
				void this._refreshWithLogging();
			}
		}));
	}

	async refresh(): Promise<void> {
		this._refreshScheduler.cancel();
		await this._refreshThrottler.queue(() => this._refresh());
	}

	private async _refresh(): Promise<void> {
		const generation = ++this._refreshGeneration;
		const sessions = this.sessionsManagementService.getSessions();
		const repositoryRoots = this._collectRepositoryRoots(sessions);
		await this.extensionService.activateByEvent('onCommand:_git.listWorktrees');
		const [perRepoDirectories, existingWorktreePaths] = await Promise.all([
			this._scanRepositoryWorktrees(repositoryRoots),
			this._scanExistingSessionWorktreePaths(sessions),
		]);
		const sizesByPath = await this._scanWorktreeSizes(perRepoDirectories, existingWorktreePaths);
		const entries = correlateWorktrees(sessions, perRepoDirectories, { existingWorktreePaths, sizesByPath });
		if (generation !== this._refreshGeneration) {
			return;
		}
		transaction(tx => {
			this._entries.set(entries, tx);
			this._hasRefreshed.set(true, tx);
		});
	}

	async removeWorktree(entry: IWorktreeDashboardEntry, options?: IRemoveWorktreeOptions): Promise<void> {
		await this.extensionService.activateByEvent('onCommand:_git.deleteWorktree');
		const result = await this.commandService.executeCommand<{ ok: true } | { ok: false; reason: 'dirty' }>(
			'_git.deleteWorktree',
			entry.repositoryRoot.fsPath,
			entry.worktreePath.fsPath,
			options?.force,
		);

		if (!result) {
			throw new Error('Git worktree delete command did not return a result.');
		}

		if (!result.ok && result.reason === 'dirty' && !options?.force) {
			throw new WorktreeContainsChangesError(entry.worktreePath);
		}

		await this.refresh();
	}

	async revealSession(entry: IWorktreeDashboardEntry): Promise<void> {
		if (!entry.session) {
			return;
		}

		await this.sessionsService.openSession(entry.session.resource);
	}

	async openWorktreeFolder(entry: IWorktreeDashboardEntry): Promise<void> {
		await this.hostService.openWindow([{ folderUri: entry.worktreePath }], { forceNewWindow: true });
	}

	private async _refreshWithLogging(): Promise<void> {
		try {
			await this.refresh();
		} catch (error) {
			this.logService.error('[WorktreeDashboardService] Failed to refresh worktree dashboard', error);
		}
	}

	private _collectRepositoryRoots(sessions: readonly ISession[]): Map<string, URI> {
		const repositoryRoots = new Map<string, URI>();
		for (const session of sessions) {
			const workspace = session.workspace.get();
			if (!workspace) {
				continue;
			}

			for (const folder of workspace.folders) {
				const repositoryRoot = folder.gitRepository?.uri;
				if (repositoryRoot) {
					repositoryRoots.set(repositoryRoot.toString(), repositoryRoot);
				}
			}
		}
		return repositoryRoots;
	}

	private async _scanRepositoryWorktrees(repositoryRoots: ReadonlyMap<string, URI>): Promise<Map<string, readonly IDiscoveredWorktreeDirectory[]>> {
		const scannedRepositories = await Promise.all(Array.from(repositoryRoots.entries(), async ([key, repositoryRoot]) => {
			return [key, await this._scanRepositoryWorktreeDirectories(repositoryRoot)] as const;
		}));
		return new Map(scannedRepositories);
	}

	private async _scanRepositoryWorktreeDirectories(repositoryRoot: URI): Promise<readonly IDiscoveredWorktreeDirectory[]> {
		try {
			const worktrees = await this.commandService.executeCommand<readonly { name: string; path: string; branchName: string | undefined }[]>(
				'_git.listWorktrees',
				repositoryRoot.fsPath,
			);
			return (worktrees ?? []).map(worktree => ({
				repositoryRoot,
				path: URI.file(worktree.path),
				name: worktree.name,
				branchName: worktree.branchName,
			}));
		} catch (error) {
			this.logService.warn(`[WorktreeDashboardService] Failed to list worktrees for ${repositoryRoot.fsPath}`, error);
			return [];
		}
	}

	private async _scanExistingSessionWorktreePaths(sessions: readonly ISession[]): Promise<Set<string>> {
		const worktreePaths = collectSessionWorktreePaths(sessions);
		const existingPaths = await Promise.all(worktreePaths.map(async worktreePath => {
			return await this.fileService.exists(worktreePath) ? worktreePath.toString() : undefined;
		}));
		return new Set(existingPaths.filter((path): path is string => !!path));
	}

	/**
	 * Computes the on-disk size of every worktree directory that exists —
	 * both discovered directories (which may be orphaned) and session
	 * worktree paths confirmed to exist by {@link _scanExistingSessionWorktreePaths}.
	 * Delegates the actual byte counting to the git extension's
	 * `_git.getFolderSize` command, which runs a plain recursive `fs` walk in
	 * the extension host (much faster than resolving every file over the
	 * {@link IFileService} bridge from this layer).
	 */
	private async _scanWorktreeSizes(perRepoDirectories: ReadonlyMap<string, readonly IDiscoveredWorktreeDirectory[]>, existingWorktreePaths: ReadonlySet<string>): Promise<Map<string, number>> {
		const pathsToSize = new Map<string, URI>();
		for (const directories of perRepoDirectories.values()) {
			for (const directory of directories) {
				pathsToSize.set(directory.path.toString(), directory.path);
			}
		}
		for (const pathString of existingWorktreePaths) {
			if (!pathsToSize.has(pathString)) {
				pathsToSize.set(pathString, URI.parse(pathString));
			}
		}

		if (pathsToSize.size === 0) {
			return new Map();
		}

		await this.extensionService.activateByEvent('onCommand:_git.getFolderSize');

		const limiter = new Limiter<void>(SIZE_SCAN_CONCURRENCY);
		const sizesByPath = new Map<string, number>();
		await Promise.all(Array.from(pathsToSize.entries(), ([pathString, path]) => limiter.queue(async () => {
			try {
				const size = await this.commandService.executeCommand<number>('_git.getFolderSize', path.fsPath);
				if (typeof size === 'number') {
					sizesByPath.set(pathString, size);
				}
			} catch (error) {
				this.logService.warn(`[WorktreeDashboardService] Failed to compute worktree size for ${path.fsPath}`, error);
			}
		})));
		return sizesByPath;
	}
}

function collectSessionWorktreePaths(sessions: readonly ISession[]): URI[] {
	const worktreePaths = new Map<string, URI>();
	for (const session of sessions) {
		const workspace = session.workspace.get();
		if (!workspace) {
			continue;
		}

		for (const folder of workspace.folders) {
			const worktreePath = folder.gitRepository?.workTreeUri;
			const repositoryRoot = folder.gitRepository?.uri;
			if (worktreePath && repositoryRoot && !isEqual(repositoryRoot, worktreePath)) {
				worktreePaths.set(worktreePath.toString(), worktreePath);
			}
		}
	}
	return Array.from(worktreePaths.values());
}

registerSingleton(IWorktreeDashboardService, WorktreeDashboardService, InstantiationType.Delayed);
