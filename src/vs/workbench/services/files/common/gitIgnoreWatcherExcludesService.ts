/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileChangesEvent, IFileService, IFilesConfiguration } from '../../../../platform/files/common/files.js';
import { GIT_IGNORE_FILE_NAME, readGitIgnoreWatcherExcludes } from '../../../../platform/files/common/watcherGitIgnore.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export const IGitIgnoreWatcherExcludesService = createDecorator<IGitIgnoreWatcherExcludesService>('gitIgnoreWatcherExcludesService');

/**
 * Provides the file watcher excludes that `files.watcherExcludeGitIgnore`
 * derives from the `.gitignore` file at the root of a workspace folder.
 *
 * Consumers are expected to handle changes of the setting themselves.
 */
export interface IGitIgnoreWatcherExcludesService {

	readonly _serviceBrand: undefined;

	/**
	 * Fires with the root of a workspace folder after a change to its
	 * `.gitignore` file changed the excludes of that folder.
	 */
	readonly onDidChangeExcludes: Event<URI>;

	/**
	 * Resolves the excludes of the root of a workspace folder. The patterns
	 * are relative to the folder (see `getWatcherExcludesFromGitIgnore`).
	 *
	 * Resolves to an empty array when `folder` is not the root of a workspace
	 * folder or when `files.watcherExcludeGitIgnore` is disabled for it.
	 */
	getExcludes(folder: URI): Promise<readonly string[]>;
}

class FolderExcludes extends Disposable {

	private readonly refreshScheduler: RunOnceScheduler;
	private refreshSequence = 0;

	private _excludes: Promise<readonly string[]>;
	get excludes(): Promise<readonly string[]> { return this._excludes; }

	constructor(
		private readonly folder: URI,
		refreshDelay: number,
		private readonly fileService: IFileService,
		private readonly onDidChange: (folder: URI) => void
	) {
		super();

		this.refreshScheduler = this._register(new RunOnceScheduler(() => this.refresh(), refreshDelay));
		this._excludes = readGitIgnoreWatcherExcludes(this.fileService, this.folder);
	}

	scheduleRefresh(): void {
		this.refreshScheduler.schedule();
	}

	private async refresh(): Promise<void> {
		const sequence = ++this.refreshSequence;
		const [previous, next] = await Promise.all([this._excludes, readGitIgnoreWatcherExcludes(this.fileService, this.folder)]);
		if (this._store.isDisposed || sequence !== this.refreshSequence || equals(previous, next)) {
			return; // disposed, superseded by a newer refresh or unchanged
		}

		this._excludes = Promise.resolve(next);
		this.onDidChange(this.folder);
	}
}

export class GitIgnoreWatcherExcludesService extends Disposable implements IGitIgnoreWatcherExcludesService {

	declare readonly _serviceBrand: undefined;

	private static readonly REFRESH_DELAY = 500;

	private readonly _onDidChangeExcludes = this._register(new Emitter<URI>());
	readonly onDidChangeExcludes = this._onDidChangeExcludes.event;

	private readonly folders: DisposableMap<URI, FolderExcludes>;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		this.folders = this._register(new DisposableMap(new ResourceMap<FolderExcludes>(resource => this.uriIdentityService.extUri.getComparisonKey(resource))));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Stop tracking folders that are no longer enabled or no longer in the workspace
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('files.watcherExcludeGitIgnore')) {
				this.removeDisabledFolders();
			}
		}));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.removeDisabledFolders()));
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		for (const [folder, excludes] of this.folders) {
			if (e.contains(joinPath(folder, GIT_IGNORE_FILE_NAME))) {
				excludes.scheduleRefresh();
			}
		}
	}

	private removeDisabledFolders(): void {
		for (const folder of [...this.folders.keys()]) {
			if (!this.isEnabled(folder)) {
				this.folders.deleteAndDispose(folder);
			}
		}
	}

	getExcludes(folder: URI): Promise<readonly string[]> {
		if (!this.isEnabled(folder)) {
			this.folders.deleteAndDispose(folder);

			return Promise.resolve([]);
		}

		let excludes = this.folders.get(folder);
		if (!excludes) {
			excludes = new FolderExcludes(folder, GitIgnoreWatcherExcludesService.REFRESH_DELAY, this.fileService, folder => this._onDidChangeExcludes.fire(folder));
			this.folders.set(folder, excludes);
		}

		return excludes.excludes;
	}

	private isEnabled(folder: URI): boolean {
		const workspaceFolder = this.contextService.getWorkspaceFolder(folder);
		if (!workspaceFolder || !this.uriIdentityService.extUri.isEqual(workspaceFolder.uri, folder)) {
			return false; // only the root `.gitignore` of a workspace folder is considered
		}

		return this.configurationService.getValue<IFilesConfiguration>({ resource: folder }).files?.watcherExcludeGitIgnore === true;
	}
}

registerSingleton(IGitIgnoreWatcherExcludesService, GitIgnoreWatcherExcludesService, InstantiationType.Delayed);
