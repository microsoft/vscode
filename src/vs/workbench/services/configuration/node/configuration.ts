/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import { Event, Emitter } from 'vs/base/common/event';
import { readFile } from 'vs/base/node/pfs';
import * as errors from 'vs/base/common/errors';
import * as collections from 'vs/base/common/collections';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { FileChangeType, FileChangesEvent, IContent, IFileService } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { ConfigWatcher } from 'vs/base/node/config';
import { ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationModelParser, FolderSettingsModelParser, StandaloneConfigurationModelParser } from 'vs/workbench/services/configuration/common/configurationModels';
import { FOLDER_SETTINGS_PATH, TASKS_CONFIGURATION_KEY, FOLDER_SETTINGS_NAME, LAUNCH_CONFIGURATION_KEY } from 'vs/workbench/services/configuration/common/configuration';
import { IStoredWorkspace, IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import * as extfs from 'vs/base/node/extfs';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { relative } from 'path';
import { equals } from 'vs/base/common/objects';

export class WorkspaceConfiguration extends Disposable {

	private _workspaceConfigPath: URI;
	private _workspaceConfigurationWatcher: ConfigWatcher<WorkspaceConfigurationModelParser>;
	private _workspaceConfigurationWatcherDisposables: IDisposable[] = [];

	private readonly _onDidUpdateConfiguration: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateConfiguration: Event<void> = this._onDidUpdateConfiguration.event;

	private _workspaceConfigurationModelParser: WorkspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(this._workspaceConfigPath ? this._workspaceConfigPath.fsPath : '');
	private _cache: ConfigurationModel = new ConfigurationModel();

	load(workspaceConfigPath: URI): TPromise<void> {
		if (this._workspaceConfigPath && this._workspaceConfigPath.fsPath === workspaceConfigPath.fsPath) {
			return this.reload();
		}

		this._workspaceConfigPath = workspaceConfigPath;

		return new TPromise<void>((c, e) => {
			const defaultConfig = new WorkspaceConfigurationModelParser(this._workspaceConfigPath.fsPath);
			defaultConfig.parse(JSON.stringify({ folders: [] } as IStoredWorkspace, null, '\t'));
			if (this._workspaceConfigurationWatcher) {
				this.disposeConfigurationWatcher();
			}
			this._workspaceConfigurationWatcher = new ConfigWatcher(this._workspaceConfigPath.fsPath, {
				changeBufferDelay: 300,
				onError: error => errors.onUnexpectedError(error),
				defaultConfig,
				parse: (content: string, parseErrors: any[]) => {
					this._workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(this._workspaceConfigPath.fsPath);
					this._workspaceConfigurationModelParser.parse(content);
					parseErrors = [...this._workspaceConfigurationModelParser.errors];
					this.consolidate();
					return this._workspaceConfigurationModelParser;
				}, initCallback: () => c(null)
			});
			this.listenToWatcher();
		});
	}

	reload(): TPromise<void> {
		this.stopListeningToWatcher();
		return new TPromise<void>(c => this._workspaceConfigurationWatcher.reload(() => {
			this.listenToWatcher();
			c(null);
		}));
	}

	getFolders(): IStoredWorkspaceFolder[] {
		return this._workspaceConfigurationModelParser.folders;
	}

	setFolders(folders: IStoredWorkspaceFolder[], jsonEditingService: JSONEditingService): TPromise<void> {
		return jsonEditingService.write(this._workspaceConfigPath, { key: 'folders', value: folders }, true)
			.then(() => this.reload());
	}

	getConfiguration(): ConfigurationModel {
		return this._cache;
	}

	getUnsupportedKeys(): string[] {
		return this._workspaceConfigurationModelParser.settingsModel.unsupportedKeys;
	}

	reprocessWorkspaceSettings(): ConfigurationModel {
		this._workspaceConfigurationModelParser.reprocessWorkspaceSettings();
		this.consolidate();
		return this.getConfiguration();
	}

	private listenToWatcher() {
		this._workspaceConfigurationWatcher.onDidUpdateConfiguration(() => this._onDidUpdateConfiguration.fire(), this, this._workspaceConfigurationWatcherDisposables);
	}

	private stopListeningToWatcher() {
		this._workspaceConfigurationWatcherDisposables = dispose(this._workspaceConfigurationWatcherDisposables);
	}

	private consolidate(): void {
		this._cache = this._workspaceConfigurationModelParser.settingsModel.merge(this._workspaceConfigurationModelParser.launchModel);
	}

	private disposeConfigurationWatcher(): void {
		this.stopListeningToWatcher();
		if (this._workspaceConfigurationWatcher) {
			this._workspaceConfigurationWatcher.dispose();
		}
	}

	dispose(): void {
		this.disposeConfigurationWatcher();
		super.dispose();
	}
}

function isWorkspaceConfigurationFile(resource: URI): boolean {
	const name = paths.basename(resource.fsPath);
	return [`${FOLDER_SETTINGS_NAME}.json`, `${TASKS_CONFIGURATION_KEY}.json`, `${LAUNCH_CONFIGURATION_KEY}.json`].some(p => p === name);// only workspace config files
}

export abstract class FolderConfiguration extends Disposable {

	private _folderSettingsModelParser: FolderSettingsModelParser;
	private _standAloneConfigurations: ConfigurationModel[] = [];
	private _cache: ConfigurationModel = new ConfigurationModel();

	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(protected readonly folder: URI, workbenchState: WorkbenchState) {
		super();
		this._folderSettingsModelParser = new FolderSettingsModelParser(FOLDER_SETTINGS_PATH, WorkbenchState.WORKSPACE === workbenchState ? [ConfigurationScope.RESOURCE] : [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE]);
	}

	loadConfiguration(): TPromise<ConfigurationModel> {
		return this.loadFolderConfigurationContents()
			.then((contents) => {
				this.parseContents(contents);
				// Consolidate (support *.json files in the workspace settings folder)
				this.consolidate();
				return this._cache;
			});
	}

	reprocess(): ConfigurationModel {
		const oldContents = this._folderSettingsModelParser.settingsModel.contents;
		this._folderSettingsModelParser.reprocess();
		if (!equals(oldContents, this._folderSettingsModelParser.settingsModel.contents)) {
			this.consolidate();
		}
		return this._cache;
	}

	getUnsupportedKeys(): string[] {
		return this._folderSettingsModelParser.settingsModel.unsupportedKeys;
	}

	private consolidate(): void {
		this._cache = this._folderSettingsModelParser.settingsModel.merge(...this._standAloneConfigurations);
	}

	private parseContents(contents: { resource: URI, value: string }[]): void {
		this._standAloneConfigurations = [];
		for (const content of contents) {
			const name = paths.basename(content.resource.fsPath);
			if (name === `${FOLDER_SETTINGS_NAME}.json`) {
				this._folderSettingsModelParser.parse(content.value);
			} else {
				const matches = /([^\.]*)*\.json/.exec(name);
				if (matches && matches[1]) {
					const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(content.resource.toString(), matches[1]);
					standAloneConfigurationModelParser.parse(content.value);
					this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
				}
			}
		}
	}

	protected abstract loadFolderConfigurationContents(): TPromise<{ resource: URI, value: string }[]>;
}

export class NodeBasedFolderConfiguration extends FolderConfiguration {

	private readonly folderConfigurationPath: URI;

	constructor(folder: URI, configFolderRelativePath: string, workbenchState: WorkbenchState) {
		super(folder, workbenchState);
		this.folderConfigurationPath = URI.file(paths.join(this.folder.fsPath, configFolderRelativePath));
	}

	protected loadFolderConfigurationContents(): TPromise<{ resource: URI, value: string }[]> {
		return this.resolveStat(this.folderConfigurationPath).then(stat => {
			if (!stat.isDirectory) {
				return TPromise.as([]);
			}
			return this.resolveContents(stat.children.filter(stat => isWorkspaceConfigurationFile(stat.resource))
				.map(stat => stat.resource));
		}, err => [] /* never fail this call */)
			.then(null, errors.onUnexpectedError);
	}

	private resolveContents(resources: URI[]): TPromise<{ resource: URI, value: string }[]> {
		return TPromise.join(resources.map(resource =>
			readFile(resource.fsPath)
				.then(contents => ({ resource, value: contents.toString() }))));
	}

	private resolveStat(resource: URI): TPromise<{ resource: URI, isDirectory?: boolean, children?: { resource: URI; }[] }> {
		return new TPromise<{ resource: URI, isDirectory?: boolean, children?: { resource: URI; }[] }>((c, e) => {
			extfs.readdir(resource.fsPath, (error, children) => {
				if (error) {
					if ((<any>error).code === 'ENOTDIR') {
						c({ resource });
					} else {
						e(error);
					}
				} else {
					c({
						resource,
						isDirectory: true,
						children: children.map(child => { return { resource: URI.file(paths.join(resource.fsPath, child)) }; })
					});
				}
			});
		});
	}
}

export class FileServiceBasedFolderConfiguration extends FolderConfiguration {

	private bulkContentFetchromise: TPromise<IContent[]>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<IContent> };
	private reloadConfigurationScheduler: RunOnceScheduler;
	private readonly folderConfigurationPath: URI;

	constructor(folder: URI, private configFolderRelativePath: string, workbenchState: WorkbenchState, private fileService: IFileService) {
		super(folder, workbenchState);
		this.folderConfigurationPath = URI.file(paths.join(this.folder.fsPath, configFolderRelativePath));
		this.workspaceFilePathToConfiguration = Object.create(null);
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
		this._register(fileService.onFileChanges(e => this.handleWorkspaceFileEvents(e)));
	}

	protected loadFolderConfigurationContents(): TPromise<{ resource: URI, value: string }[]> {
		// once: when invoked for the first time we fetch json files that contribute settings
		if (!this.bulkContentFetchromise) {
			this.bulkContentFetchromise = this.fileService.resolveFile(this.folderConfigurationPath)
				.then(stat => {
					if (!stat.isDirectory || !stat.children) {
						return TPromise.as([]);
					}
					return TPromise.join(stat.children.filter(child => isWorkspaceConfigurationFile(child.resource))
						.map(child => this.fileService.resolveContent(child.resource)));
				}).then(null, err => [] /* never fail this call */);
		}
		return this.bulkContentFetchromise;
	}

	private handleWorkspaceFileEvents(event: FileChangesEvent): void {
		const events = event.changes;
		let affectedByChanges = false;

		// Find changes that affect workspace configuration files
		for (let i = 0, len = events.length; i < len; i++) {
			const resource = events[i].resource;
			const isJson = paths.extname(resource.fsPath) === '.json';
			const isDeletedSettingsFolder = (events[i].type === FileChangeType.DELETED && paths.basename(resource.fsPath) === this.configFolderRelativePath);
			if (!isJson && !isDeletedSettingsFolder) {
				continue; // only JSON files or the actual settings folder
			}

			const workspacePath = this.toFolderRelativePath(resource);
			if (!workspacePath) {
				continue; // event is not inside workspace
			}

			// Handle case where ".vscode" got deleted
			if (isDeletedSettingsFolder) {
				this.workspaceFilePathToConfiguration = Object.create(null);
				affectedByChanges = true;
			}

			// only valid workspace config files
			if (!isWorkspaceConfigurationFile(resource)) {
				continue;
			}

			// insert 'fetch-promises' for add and update events and
			// remove promises for delete events
			switch (events[i].type) {
				case FileChangeType.DELETED:
					affectedByChanges = collections.remove(this.workspaceFilePathToConfiguration, workspacePath);
					break;
				case FileChangeType.UPDATED:
				case FileChangeType.ADDED:
					this.workspaceFilePathToConfiguration[workspacePath] = this.fileService.resolveContent(resource).then(null, errors.onUnexpectedError);
					affectedByChanges = true;
			}
		}

		if (affectedByChanges) {
			this.reloadConfigurationScheduler.schedule();
		}
	}

	private toFolderRelativePath(resource: URI): string {
		if (paths.isEqualOrParent(resource.fsPath, this.folder.fsPath, !isLinux /* ignorecase */)) {
			return paths.normalize(relative(this.folder.fsPath, resource.fsPath));
		}
		return null;
	}
}

export class VoidFolderConfiguration extends FolderConfiguration {
	protected loadFolderConfigurationContents(): TPromise<{ resource: URI, value: string }[]> {
		return TPromise.as([]);
	}
}