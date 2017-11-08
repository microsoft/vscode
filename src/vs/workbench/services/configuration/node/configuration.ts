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
import { CustomConfigurationModel, ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationModel, ScopedConfigurationModel, FolderConfigurationModel, FolderSettingsModel, WorkspaceSettingsModel } from 'vs/workbench/services/configuration/common/configurationModels';
import { WORKSPACE_STANDALONE_CONFIGURATIONS, WORKSPACE_CONFIG_DEFAULT_PATH, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY } from 'vs/workbench/services/configuration/common/configuration';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IStoredWorkspace, IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import * as extfs from 'vs/base/node/extfs';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';

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
	private _workspaceConfigurationWatcher: ConfigWatcher<WorkspaceConfigurationModel>;
	private _workspaceConfigurationWatcherDisposables: IDisposable[] = [];

	private _onDidUpdateConfiguration: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateConfiguration: Event<void> = this._onDidUpdateConfiguration.event;

	load(workspaceConfigPath: URI): TPromise<void> {
		if (this._workspaceConfigPath && this._workspaceConfigPath.fsPath === workspaceConfigPath.fsPath) {
			return this.reload();
		}

		this._workspaceConfigPath = workspaceConfigPath;

		this.stopListeningToWatcher();
		return new TPromise<void>((c, e) => {
			this._workspaceConfigurationWatcher = new ConfigWatcher(this._workspaceConfigPath.fsPath, {
				changeBufferDelay: 300,
				onError: error => errors.onUnexpectedError(error),
				defaultConfig: new WorkspaceConfigurationModel(JSON.stringify({ folders: [] } as IStoredWorkspace, null, '\t'), this._workspaceConfigPath.fsPath),
				parse: (content: string, parseErrors: any[]) => {
					const workspaceConfigurationModel = new WorkspaceConfigurationModel(content, this._workspaceConfigPath.fsPath);
					parseErrors = [...workspaceConfigurationModel.errors];
					return workspaceConfigurationModel;
				}, initCallback: () => c(null)
			});
			this.listenToWatcher();
		});
	}

	private get workspaceConfigurationModel(): WorkspaceConfigurationModel {
		return this._workspaceConfigurationWatcher ? this._workspaceConfigurationWatcher.getConfig() : new WorkspaceConfigurationModel();
	}

	reload(): TPromise<void> {
		this.stopListeningToWatcher();
		return new TPromise<void>(c => this._workspaceConfigurationWatcher.reload(() => {
			this.listenToWatcher();
			c(null);
		}));
	}

	getFolders(): IStoredWorkspaceFolder[] {
		return this.workspaceConfigurationModel.folders;
	}

	setFolders(folders: IStoredWorkspaceFolder[], jsonEditingService: JSONEditingService): TPromise<void> {
		return jsonEditingService.write(this._workspaceConfigPath, { key: 'folders', value: folders }, true)
			.then(() => this.reload());
	}

	getConfiguration(): ConfigurationModel {
		return this.workspaceConfigurationModel.workspaceConfiguration;
	}

	getWorkspaceSettings(): WorkspaceSettingsModel {
		return this.workspaceConfigurationModel.workspaceSettingsModel;
	}

	private listenToWatcher() {
		this._workspaceConfigurationWatcherDisposables.push(this._workspaceConfigurationWatcher);
		this._workspaceConfigurationWatcher.onDidUpdateConfiguration(() => this._onDidUpdateConfiguration.fire(), this, this._workspaceConfigurationWatcherDisposables);
	}

	private stopListeningToWatcher() {
		this._workspaceConfigurationWatcherDisposables = dispose(this._workspaceConfigurationWatcherDisposables);
	}

	dispose(): void {
		dispose(this._workspaceConfigurationWatcherDisposables);
		super.dispose();
	}
}

export class FolderConfiguration extends Disposable {

	private static RELOAD_CONFIGURATION_DELAY = 50;

	private bulkFetchFromWorkspacePromise: TPromise;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<ConfigurationModel> };

	private reloadConfigurationScheduler: RunOnceScheduler;
	private reloadConfigurationEventEmitter: Emitter<FolderConfigurationModel> = new Emitter<FolderConfigurationModel>();

	constructor(private folder: URI, private configFolderRelativePath: string, private scope: ConfigurationScope) {
		super();

		this.workspaceFilePathToConfiguration = Object.create(null);
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.loadConfiguration().then(configuration => this.reloadConfigurationEventEmitter.fire(configuration), errors.onUnexpectedError), FolderConfiguration.RELOAD_CONFIGURATION_DELAY));
	}

	loadConfiguration(): TPromise<FolderConfigurationModel> {
		// Load workspace locals
		return this.loadWorkspaceConfigFiles().then(workspaceConfigFiles => {
			// Consolidate (support *.json files in the workspace settings folder)
			const workspaceSettingsConfig = <FolderSettingsModel>workspaceConfigFiles[WORKSPACE_CONFIG_DEFAULT_PATH] || new FolderSettingsModel(null);
			const otherConfigModels = Object.keys(workspaceConfigFiles).filter(key => key !== WORKSPACE_CONFIG_DEFAULT_PATH).map(key => <ScopedConfigurationModel>workspaceConfigFiles[key]);
			return new FolderConfigurationModel(workspaceSettingsConfig, otherConfigModels, this.scope);
		});
	}

	private loadWorkspaceConfigFiles(): TPromise<{ [relativeWorkspacePath: string]: ConfigurationModel }> {
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
					contents.forEach(content => this.workspaceFilePathToConfiguration[this.toFolderRelativePath(content.resource)] = TPromise.as(this.createConfigModel(content)));
				}, errors.onUnexpectedError);
		}

		// on change: join on *all* configuration file promises so that we can merge them into a single configuration object. this
		// happens whenever a config file changes, is deleted, or added
		return this.bulkFetchFromWorkspacePromise.then(() => TPromise.join(this.workspaceFilePathToConfiguration));
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): TPromise<FolderConfigurationModel> {
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
					this.workspaceFilePathToConfiguration[workspacePath] = resolveContent(resource).then(content => this.createConfigModel(content), errors.onUnexpectedError);
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

	private createConfigModel(content: IContent): ConfigurationModel {
		const path = this.toFolderRelativePath(content.resource);
		if (path === WORKSPACE_CONFIG_DEFAULT_PATH) {
			return new FolderSettingsModel(content.value, content.resource.toString());
		} else {
			const matches = /\/([^\.]*)*\.json/.exec(path);
			if (matches && matches[1]) {
				return new ScopedConfigurationModel(content.value, content.resource.toString(), matches[1]);
			}
		}

		return new CustomConfigurationModel(null);
	}

	private isWorkspaceConfigurationFile(folderRelativePath: string): boolean {
		return [WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY], WORKSPACE_STANDALONE_CONFIGURATIONS[LAUNCH_CONFIGURATION_KEY]].some(p => p === folderRelativePath);
	}

	private toResource(folderRelativePath: string): URI {
		if (typeof folderRelativePath === 'string') {
			return URI.file(paths.join(this.folder.fsPath, folderRelativePath));
		}

		return null;
	}

	private toFolderRelativePath(resource: URI, toOSPath?: boolean): string {
		if (this.contains(resource)) {
			return paths.normalize(paths.relative(this.folder.fsPath, resource.fsPath), toOSPath);
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