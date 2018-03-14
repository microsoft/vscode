/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { readFile } from 'vs/base/node/pfs';
import * as errors from 'vs/base/common/errors';
import * as collections from 'vs/base/common/collections';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { ConfigWatcher } from 'vs/base/node/config';
import { ConfigurationModel, ConfigurationModelParser } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationModelParser, FolderSettingsModelParser, StandaloneConfigurationModelParser } from 'vs/workbench/services/configuration/common/configurationModels';
import { WORKSPACE_STANDALONE_CONFIGURATIONS, FOLDER_SETTINGS_PATH, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY } from 'vs/workbench/services/configuration/common/configuration';
import { IStoredWorkspace, IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import * as extfs from 'vs/base/node/extfs';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { relative } from 'path';
import { equals } from 'vs/base/common/objects';

// node.hs helper functions

interface IStat {
	resource: URI;
	isDirectory?: boolean;
	children?: { resource: URI; }[];
}

interface IContent {
	resource: URI;
	value: string;
}

function resolveContents(resources: URI[]): TPromise<IContent[]> {
	const contents: IContent[] = [];

	return TPromise.join(resources.map(resource => {
		return resolveContent(resource).then(content => {
			contents.push(content);
		});
	})).then(() => contents);
}

function resolveContent(resource: URI): TPromise<IContent> {
	return readFile(resource.fsPath).then(contents => ({ resource, value: contents.toString() }));
}

function resolveStat(resource: URI): TPromise<IStat> {
	return new TPromise<IStat>((c, e) => {
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

export class FolderConfiguration extends Disposable {

	private static readonly RELOAD_CONFIGURATION_DELAY = 50;

	private bulkFetchFromWorkspacePromise: TPromise;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<ConfigurationModelParser> };

	private _folderSettingsModelParser: FolderSettingsModelParser;
	private _standAloneConfigurations: ConfigurationModel[] = [];
	private _cache: ConfigurationModel = new ConfigurationModel();

	private reloadConfigurationScheduler: RunOnceScheduler;
	private readonly reloadConfigurationEventEmitter: Emitter<ConfigurationModel> = new Emitter<ConfigurationModel>();

	constructor(private folder: URI, private configFolderRelativePath: string, workbenchState: WorkbenchState) {
		super();

		this._folderSettingsModelParser = new FolderSettingsModelParser(FOLDER_SETTINGS_PATH, WorkbenchState.WORKSPACE === workbenchState ? ConfigurationScope.RESOURCE : void 0);
		this.workspaceFilePathToConfiguration = Object.create(null);
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.loadConfiguration().then(configuration => this.reloadConfigurationEventEmitter.fire(configuration), errors.onUnexpectedError), FolderConfiguration.RELOAD_CONFIGURATION_DELAY));
	}

	loadConfiguration(): TPromise<ConfigurationModel> {
		// Load workspace locals
		return this.loadWorkspaceConfigFiles().then(workspaceConfigFiles => {
			this._standAloneConfigurations = Object.keys(workspaceConfigFiles).filter(key => key !== FOLDER_SETTINGS_PATH).map(key => <ConfigurationModel>workspaceConfigFiles[key].configurationModel);
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

	private loadWorkspaceConfigFiles(): TPromise<{ [relativeWorkspacePath: string]: ConfigurationModelParser }> {
		// once: when invoked for the first time we fetch json files that contribute settings
		if (!this.bulkFetchFromWorkspacePromise) {
			this.bulkFetchFromWorkspacePromise = resolveStat(this.toResource(this.configFolderRelativePath)).then(stat => {
				if (!stat.isDirectory) {
					return TPromise.as([]);
				}

				return resolveContents(stat.children.filter(stat => {
					const isJson = paths.extname(stat.resource.fsPath) === '.json';
					if (!isJson) {
						return false; // only JSON files
					}

					return this.isWorkspaceConfigurationFile(this.toFolderRelativePath(stat.resource)); // only workspace config files
				}).map(stat => stat.resource));
			}, err => [] /* never fail this call */)
				.then((contents: IContent[]) => {
					contents.forEach(content => this.workspaceFilePathToConfiguration[this.toFolderRelativePath(content.resource)] = TPromise.as(this.createConfigurationModelParser(content)));
				}, errors.onUnexpectedError);
		}

		// on change: join on *all* configuration file promises so that we can merge them into a single configuration object. this
		// happens whenever a config file changes, is deleted, or added
		return this.bulkFetchFromWorkspacePromise.then(() => TPromise.join(this.workspaceFilePathToConfiguration));
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): TPromise<ConfigurationModel> {
		const events = event.changes;
		let affectedByChanges = false;

		// Find changes that affect workspace configuration files
		for (let i = 0, len = events.length; i < len; i++) {
			const resource = events[i].resource;
			const isJson = paths.extname(resource.fsPath) === '.json';
			const isDeletedSettingsFolder = (events[i].type === FileChangeType.DELETED && paths.isEqual(paths.basename(resource.fsPath), this.configFolderRelativePath));
			if (!isJson && !isDeletedSettingsFolder) {
				continue; // only JSON files or the actual settings folder
			}

			const workspacePath = this.toFolderRelativePath(resource);
			if (!workspacePath) {
				continue; // event is not inside workspace
			}

			// Handle case where ".vscode" got deleted
			if (workspacePath === this.configFolderRelativePath && events[i].type === FileChangeType.DELETED) {
				this.workspaceFilePathToConfiguration = Object.create(null);
				affectedByChanges = true;
			}

			// only valid workspace config files
			if (!this.isWorkspaceConfigurationFile(workspacePath)) {
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
					this.workspaceFilePathToConfiguration[workspacePath] = resolveContent(resource).then(content => this.createConfigurationModelParser(content), errors.onUnexpectedError);
					affectedByChanges = true;
			}
		}

		if (!affectedByChanges) {
			return TPromise.as(null);
		}

		return new TPromise((c, e) => {
			let disposable = this.reloadConfigurationEventEmitter.event(configuration => {
				disposable.dispose();
				c(configuration);
			});
			// trigger reload of the configuration if we are affected by changes
			if (!this.reloadConfigurationScheduler.isScheduled()) {
				this.reloadConfigurationScheduler.schedule();
			}
		});
	}

	private createConfigurationModelParser(content: IContent): ConfigurationModelParser {
		const path = this.toFolderRelativePath(content.resource);
		if (path === FOLDER_SETTINGS_PATH) {
			this._folderSettingsModelParser.parse(content.value);
			return this._folderSettingsModelParser;
		} else {
			const matches = /\/([^\.]*)*\.json/.exec(path);
			if (matches && matches[1]) {
				const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(content.resource.toString(), matches[1]);
				standAloneConfigurationModelParser.parse(content.value);
				return standAloneConfigurationModelParser;
			}
		}
		return new ConfigurationModelParser(null);
	}

	private isWorkspaceConfigurationFile(folderRelativePath: string): boolean {
		return [FOLDER_SETTINGS_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY], WORKSPACE_STANDALONE_CONFIGURATIONS[LAUNCH_CONFIGURATION_KEY]].some(p => p === folderRelativePath);
	}

	private toResource(folderRelativePath: string): URI {
		if (typeof folderRelativePath === 'string') {
			return URI.file(paths.join(this.folder.fsPath, folderRelativePath));
		}

		return null;
	}

	private toFolderRelativePath(resource: URI, toOSPath?: boolean): string {
		if (this.contains(resource)) {
			return paths.normalize(relative(this.folder.fsPath, resource.fsPath), toOSPath);
		}

		return null;
	}

	private contains(resource: URI): boolean {
		if (resource) {
			return paths.isEqualOrParent(resource.fsPath, this.folder.fsPath, !isLinux /* ignorecase */);
		}

		return false;
	}
}