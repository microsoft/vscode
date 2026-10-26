/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { parse, ParsedPattern } from '../../../../base/common/glob.js';
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
 * derives from the `.gitignore` file at the root of each workspace folder.
 *
 * The service tracks the setting, the workspace folders and their `.gitignore`
 * files. Consumers read the current excludes and react to
 * {@link onDidChangeExcludes}, so that they do not need to track any of these.
 */
export interface IGitIgnoreWatcherExcludesService {

	readonly _serviceBrand: undefined;

	/**
	 * Fires with the root of a workspace folder when the result of
	 * {@link getExcludes} may have changed for it, for example because its
	 * `.gitignore` file or the setting changed or because the folder was
	 * removed.
	 */
	readonly onDidChangeExcludes: Event<URI>;

	/**
	 * Returns the excludes of the root of a workspace folder, relative to the
	 * folder (see `getWatcherExcludesFromGitIgnore`), or `undefined` while its
	 * `.gitignore` file is read for the first time.
	 *
	 * Returns an empty array when `folder` is not the root of a workspace folder
	 * or when `files.watcherExcludeGitIgnore` is disabled for it.
	 */
	getExcludes(folder: URI): readonly string[] | undefined;

	/**
	 * Whether the excludes of the workspace folder that contains `resource`
	 * exclude it.
	 */
	isExcluded(resource: URI): boolean;
}

class FolderExcludes extends Disposable {

	private readonly refreshScheduler: RunOnceScheduler;
	private refreshSequence = 0;

	private _excludes: readonly string[] | undefined = undefined;
	get excludes(): readonly string[] | undefined { return this._excludes; }

	private matchers: ParsedPattern[] = [];

	constructor(
		private readonly folder: URI,
		refreshDelay: number,
		private readonly fileService: IFileService,
		private readonly onDidChange: () => void
	) {
		super();

		this.refreshScheduler = this._register(new RunOnceScheduler(() => this.refresh(), refreshDelay));
		this.refresh();
	}

	scheduleRefresh(): void {
		this.refreshScheduler.schedule();
	}

	isExcluded(relativePath: string): boolean {
		return this.matchers.some(matcher => matcher(relativePath));
	}

	private async refresh(): Promise<void> {
		const sequence = ++this.refreshSequence;
		const excludes = await readGitIgnoreWatcherExcludes(this.fileService, this.folder);
		if (this._store.isDisposed || sequence !== this.refreshSequence || (this._excludes && equals(this._excludes, excludes))) {
			return; // disposed, superseded by a newer refresh or unchanged
		}

		this._excludes = excludes;

		// Match case sensitively like the recursive file watcher, which still
		// reports events for paths that only match when ignoring case
		this.matchers = excludes.map(exclude => parse(exclude));

		this.onDidChange();
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
		this.updateFolders();
	}

	private registerListeners(): void {
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.updateFolders()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('files.watcherExcludeGitIgnore')) {
				this.updateFolders();
			}
		}));
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		for (const [folder, excludes] of this.folders) {
			if (e.contains(joinPath(folder, GIT_IGNORE_FILE_NAME))) {
				excludes.scheduleRefresh();
			}
		}
	}

	private updateFolders(): void {

		// Stop tracking folders that are no longer enabled or no longer in the workspace
		for (const folder of [...this.folders.keys()]) {
			if (!this.isEnabled(folder)) {
				this.folders.deleteAndDispose(folder);
				this._onDidChangeExcludes.fire(folder);
			}
		}

		// Start tracking enabled workspace folders
		for (const folder of this.contextService.getWorkspace().folders) {
			if (this.isEnabled(folder.uri)) {
				this.track(folder.uri);
			}
		}
	}

	private track(folder: URI): FolderExcludes {
		let excludes = this.folders.get(folder);
		if (!excludes) {
			excludes = new FolderExcludes(folder, GitIgnoreWatcherExcludesService.REFRESH_DELAY, this.fileService, () => this._onDidChangeExcludes.fire(folder));
			this.folders.set(folder, excludes);
		}

		return excludes;
	}

	getExcludes(folder: URI): readonly string[] | undefined {
		if (!this.isEnabled(folder)) {
			return [];
		}

		// Consumers may react to a workspace or setting change before this
		// service does, so a folder is tracked when it is first asked for
		return this.track(folder).excludes;
	}

	isExcluded(resource: URI): boolean {
		const folder = this.contextService.getWorkspaceFolder(resource);
		if (!folder || !this.isEnabled(folder.uri)) {
			return false;
		}

		const relativePath = this.uriIdentityService.extUri.relativePath(folder.uri, resource);

		return !!relativePath && !!this.folders.get(folder.uri)?.isExcluded(relativePath);
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
