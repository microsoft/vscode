/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createHash } from 'crypto';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { Event, Emitter } from 'vs/base/common/event';
import * as pfs from 'vs/base/node/pfs';
import * as errors from 'vs/base/common/errors';
import * as collections from 'vs/base/common/collections';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler, Delayer } from 'vs/base/common/async';
import { FileChangeType, FileChangesEvent, IContent, IFileService } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { ConfigWatcher } from 'vs/base/node/config';
import { ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationModelParser, FolderSettingsModelParser, StandaloneConfigurationModelParser } from 'vs/workbench/services/configuration/common/configurationModels';
import { FOLDER_SETTINGS_PATH, TASKS_CONFIGURATION_KEY, FOLDER_SETTINGS_NAME, LAUNCH_CONFIGURATION_KEY } from 'vs/workbench/services/configuration/common/configuration';
import { IStoredWorkspace, IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import * as extfs from 'vs/base/node/extfs';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { relative } from 'path';
import { equals } from 'vs/base/common/objects';
import { Schemas } from 'vs/base/common/network';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationModel } from 'vs/platform/configuration/common/configuration';

export class WorkspaceConfiguration extends Disposable {

	private _workspaceConfigPath: URI;
	private _workspaceConfigurationWatcher: ConfigWatcher<WorkspaceConfigurationModelParser>;
	private _workspaceConfigurationWatcherDisposables: IDisposable[] = [];

	private readonly _onDidUpdateConfiguration: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateConfiguration: Event<void> = this._onDidUpdateConfiguration.event;

	private _workspaceConfigurationModelParser: WorkspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(this._workspaceConfigPath ? this._workspaceConfigPath.fsPath : '');
	private _cache: ConfigurationModel = new ConfigurationModel();

	load(workspaceConfigPath: URI): Promise<void> {
		if (this._workspaceConfigPath && this._workspaceConfigPath.fsPath === workspaceConfigPath.fsPath) {
			return this.reload();
		}

		this._workspaceConfigPath = workspaceConfigPath;

		return new Promise<void>((c, e) => {
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
				}, initCallback: () => c(undefined)
			});
			this.listenToWatcher();
		});
	}

	reload(): Promise<void> {
		this.stopListeningToWatcher();
		return new Promise<void>(c => this._workspaceConfigurationWatcher.reload(() => {
			this.listenToWatcher();
			c(undefined);
		}));
	}

	getFolders(): IStoredWorkspaceFolder[] {
		return this._workspaceConfigurationModelParser.folders;
	}

	setFolders(folders: IStoredWorkspaceFolder[], jsonEditingService: JSONEditingService): Promise<void> {
		return jsonEditingService.write(this._workspaceConfigPath, { key: 'folders', value: folders }, true)
			.then(() => this.reload());
	}

	getConfiguration(): ConfigurationModel {
		return this._cache;
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

function isFolderConfigurationFile(resource: URI): boolean {
	const configurationNameResource = URI.from({ scheme: resource.scheme, path: resources.basename(resource) });
	return [`${FOLDER_SETTINGS_NAME}.json`, `${TASKS_CONFIGURATION_KEY}.json`, `${LAUNCH_CONFIGURATION_KEY}.json`].some(configurationFileName =>
		resources.isEqual(configurationNameResource, URI.from({ scheme: resource.scheme, path: configurationFileName })));  // only workspace config files
}

function isFolderSettingsConfigurationFile(resource: URI): boolean {
	return resources.isEqual(URI.from({ scheme: resource.scheme, path: resources.basename(resource) }), URI.from({ scheme: resource.scheme, path: `${FOLDER_SETTINGS_NAME}.json` }));
}

export interface IFolderConfiguration {
	readonly onDidChange: Event<void>;
	readonly loaded: boolean;
	loadConfiguration(): Promise<ConfigurationModel>;
	reprocess(): ConfigurationModel;
	dispose(): void;
}

export abstract class AbstractFolderConfiguration extends Disposable implements IFolderConfiguration {

	private _folderSettingsModelParser: FolderSettingsModelParser;
	private _standAloneConfigurations: ConfigurationModel[];
	private _cache: ConfigurationModel;
	private _loaded: boolean = false;

	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(protected readonly folder: URI, workbenchState: WorkbenchState, from?: AbstractFolderConfiguration) {
		super();

		this._folderSettingsModelParser = from ? from._folderSettingsModelParser : new FolderSettingsModelParser(FOLDER_SETTINGS_PATH, WorkbenchState.WORKSPACE === workbenchState ? [ConfigurationScope.RESOURCE] : [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE]);
		this._standAloneConfigurations = from ? from._standAloneConfigurations : [];
		this._cache = from ? from._cache : new ConfigurationModel();
	}

	get loaded(): boolean {
		return this._loaded;
	}

	loadConfiguration(): Promise<ConfigurationModel> {
		return this.loadFolderConfigurationContents()
			.then((contents) => {

				// reset
				this._standAloneConfigurations = [];
				this._folderSettingsModelParser.parse('');

				// parse
				this.parseContents(contents);

				// Consolidate (support *.json files in the workspace settings folder)
				this.consolidate();

				this._loaded = true;
				return this._cache;
			});
	}

	reprocess(): ConfigurationModel {
		const oldContents = this._folderSettingsModelParser.configurationModel.contents;
		this._folderSettingsModelParser.reprocess();
		if (!equals(oldContents, this._folderSettingsModelParser.configurationModel.contents)) {
			this.consolidate();
		}
		return this._cache;
	}

	private consolidate(): void {
		this._cache = this._folderSettingsModelParser.configurationModel.merge(...this._standAloneConfigurations);
	}

	private parseContents(contents: { resource: URI, value: string }[]): void {
		for (const content of contents) {
			if (isFolderSettingsConfigurationFile(content.resource)) {
				this._folderSettingsModelParser.parse(content.value);
			} else {
				const name = resources.basename(content.resource);
				const matches = /([^\.]*)*\.json/.exec(name);
				if (matches && matches[1]) {
					const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(content.resource.toString(), matches[1]);
					standAloneConfigurationModelParser.parse(content.value);
					this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
				}
			}
		}
	}

	protected abstract loadFolderConfigurationContents(): Promise<{ resource: URI, value: string }[]>;
}

export class NodeBasedFolderConfiguration extends AbstractFolderConfiguration {

	private readonly folderConfigurationPath: URI;

	constructor(folder: URI, configFolderRelativePath: string, workbenchState: WorkbenchState) {
		super(folder, workbenchState);
		this.folderConfigurationPath = resources.joinPath(folder, configFolderRelativePath);
	}

	protected loadFolderConfigurationContents(): Promise<{ resource: URI, value: string }[]> {
		return this.resolveStat(this.folderConfigurationPath).then(stat => {
			if (!stat.isDirectory || !stat.children) {
				return Promise.resolve([]);
			}
			return this.resolveContents(stat.children.filter(stat => isFolderConfigurationFile(stat.resource))
				.map(stat => stat.resource));
		}, err => [] /* never fail this call */)
			.then(undefined, e => {
				errors.onUnexpectedError(e);
				return [];
			});
	}

	private resolveContents(resources: URI[]): Promise<{ resource: URI, value: string }[]> {
		return Promise.all(resources.map(resource =>
			pfs.readFile(resource.fsPath)
				.then(contents => ({ resource, value: contents.toString() }))));
	}

	private resolveStat(resource: URI): Promise<{ resource: URI, isDirectory?: boolean, children?: { resource: URI; }[] }> {
		return new Promise<{ resource: URI, isDirectory?: boolean, children?: { resource: URI; }[] }>((c, e) => {
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
						children: children.map(child => { return { resource: resources.joinPath(resource, child) }; })
					});
				}
			});
		});
	}
}

export class FileServiceBasedFolderConfiguration extends AbstractFolderConfiguration {

	private reloadConfigurationScheduler: RunOnceScheduler;
	private readonly folderConfigurationPath: URI;
	private readonly loadConfigurationDelayer = new Delayer<Array<{ resource: URI, value: string }>>(50);

	constructor(folder: URI, private configFolderRelativePath: string, workbenchState: WorkbenchState, private fileService: IFileService, from?: AbstractFolderConfiguration) {
		super(folder, workbenchState, from);
		this.folderConfigurationPath = resources.joinPath(folder, configFolderRelativePath);
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
		this._register(fileService.onFileChanges(e => this.handleWorkspaceFileEvents(e)));
	}

	protected loadFolderConfigurationContents(): Promise<Array<{ resource: URI, value: string }>> {
		return Promise.resolve(this.loadConfigurationDelayer.trigger(() => this.doLoadFolderConfigurationContents()));
	}

	private doLoadFolderConfigurationContents(): Promise<Array<{ resource: URI, value: string }>> {
		const workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: Promise<IContent> } = Object.create(null);
		const bulkContentFetchromise = Promise.resolve(this.fileService.resolveFile(this.folderConfigurationPath))
			.then(stat => {
				if (stat.isDirectory && stat.children) {
					stat.children
						.filter(child => isFolderConfigurationFile(child.resource))
						.forEach(child => {
							const folderRelativePath = this.toFolderRelativePath(child.resource);
							if (folderRelativePath) {
								workspaceFilePathToConfiguration[folderRelativePath] = Promise.resolve(this.fileService.resolveContent(child.resource)).then(undefined, errors.onUnexpectedError);
							}
						});
				}
			}).then(undefined, err => [] /* never fail this call */);

		return bulkContentFetchromise.then(() => Promise.all(collections.values(workspaceFilePathToConfiguration)));
	}

	private handleWorkspaceFileEvents(event: FileChangesEvent): void {
		const events = event.changes;
		let affectedByChanges = false;

		// Find changes that affect workspace configuration files
		for (let i = 0, len = events.length; i < len; i++) {

			const resource = events[i].resource;
			const basename = resources.basename(resource);
			const isJson = paths.extname(basename) === '.json';
			const isDeletedSettingsFolder = (events[i].type === FileChangeType.DELETED && basename === this.configFolderRelativePath);

			if (!isJson && !isDeletedSettingsFolder) {
				continue; // only JSON files or the actual settings folder
			}

			const folderRelativePath = this.toFolderRelativePath(resource);
			if (!folderRelativePath) {
				continue; // event is not inside folder
			}

			// Handle case where ".vscode" got deleted
			if (isDeletedSettingsFolder) {
				affectedByChanges = true;
			}

			// only valid workspace config files
			if (!isFolderConfigurationFile(resource)) {
				continue;
			}

			switch (events[i].type) {
				case FileChangeType.DELETED:
				case FileChangeType.UPDATED:
				case FileChangeType.ADDED:
					affectedByChanges = true;
			}
		}

		if (affectedByChanges) {
			this.reloadConfigurationScheduler.schedule();
		}
	}

	private toFolderRelativePath(resource: URI): string | null {
		if (resource.scheme === Schemas.file) {
			if (paths.isEqualOrParent(resource.fsPath, this.folderConfigurationPath.fsPath, !isLinux /* ignorecase */)) {
				return paths.normalize(relative(this.folderConfigurationPath.fsPath, resource.fsPath));
			}
		} else {
			if (resources.isEqualOrParent(resource, this.folderConfigurationPath)) {
				return paths.normalize(relative(this.folderConfigurationPath.path, resource.path));
			}
		}
		return null;
	}
}

export class CachedFolderConfiguration extends Disposable implements IFolderConfiguration {

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly cachedFolderPath: string;
	private readonly cachedConfigurationPath: string;
	private configurationModel: ConfigurationModel;

	loaded: boolean = false;

	constructor(
		folder: URI,
		configFolderRelativePath: string,
		environmentService: IEnvironmentService) {
		super();
		this.cachedFolderPath = paths.join(environmentService.appSettingsHome, createHash('md5').update(paths.join(folder.path, configFolderRelativePath)).digest('hex'));
		this.cachedConfigurationPath = paths.join(this.cachedFolderPath, 'configuration.json');
		this.configurationModel = new ConfigurationModel();
	}

	loadConfiguration(): Promise<ConfigurationModel> {
		return pfs.readFile(this.cachedConfigurationPath)
			.then(contents => {
				const parsed: IConfigurationModel = JSON.parse(contents.toString());
				this.configurationModel = new ConfigurationModel(parsed.contents, parsed.keys, parsed.overrides);
				this.loaded = true;
				return this.configurationModel;
			}, () => this.configurationModel);
	}

	updateConfiguration(configurationModel: ConfigurationModel): Promise<void> {
		const raw = JSON.stringify(configurationModel.toJSON());
		return this.createCachedFolder().then(created => {
			if (created) {
				return configurationModel.keys.length ? pfs.writeFile(this.cachedConfigurationPath, raw) : pfs.rimraf(this.cachedFolderPath);
			}
			return undefined;
		});
	}

	reprocess(): ConfigurationModel {
		return this.configurationModel;
	}

	getUnsupportedKeys(): string[] {
		return [];
	}

	private createCachedFolder(): Promise<boolean> {
		return Promise.resolve(pfs.exists(this.cachedFolderPath))
			.then(undefined, () => false)
			.then(exists => exists ? exists : pfs.mkdirp(this.cachedFolderPath).then(() => true, () => false));
	}
}

export class FolderConfiguration extends Disposable implements IFolderConfiguration {

	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private folderConfiguration: IFolderConfiguration;
	private cachedFolderConfiguration: CachedFolderConfiguration;
	private _loaded: boolean = false;

	constructor(
		readonly workspaceFolder: IWorkspaceFolder,
		private readonly configFolderRelativePath: string,
		private readonly workbenchState: WorkbenchState,
		private environmentService: IEnvironmentService,
		fileService?: IFileService
	) {
		super();

		this.cachedFolderConfiguration = new CachedFolderConfiguration(this.workspaceFolder.uri, this.configFolderRelativePath, this.environmentService);
		this.folderConfiguration = this.cachedFolderConfiguration;
		if (fileService) {
			this.folderConfiguration = new FileServiceBasedFolderConfiguration(this.workspaceFolder.uri, this.configFolderRelativePath, this.workbenchState, fileService);
		} else if (this.workspaceFolder.uri.scheme === Schemas.file) {
			this.folderConfiguration = new NodeBasedFolderConfiguration(this.workspaceFolder.uri, this.configFolderRelativePath, this.workbenchState);
		}
		this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
	}

	loadConfiguration(): Promise<ConfigurationModel> {
		return this.folderConfiguration.loadConfiguration()
			.then(model => {
				this._loaded = this.folderConfiguration.loaded;
				return model;
			});
	}

	reprocess(): ConfigurationModel {
		return this.folderConfiguration.reprocess();
	}

	get loaded(): boolean {
		return this._loaded;
	}

	adopt(fileService: IFileService): Promise<boolean> {
		if (fileService) {
			if (this.folderConfiguration instanceof CachedFolderConfiguration) {
				return this.adoptFromCachedConfiguration(fileService);
			}

			if (this.folderConfiguration instanceof NodeBasedFolderConfiguration) {
				return this.adoptFromNodeBasedConfiguration(fileService);
			}
		}
		return Promise.resolve(false);
	}

	private adoptFromCachedConfiguration(fileService: IFileService): Promise<boolean> {
		const folderConfiguration = new FileServiceBasedFolderConfiguration(this.workspaceFolder.uri, this.configFolderRelativePath, this.workbenchState, fileService);
		return folderConfiguration.loadConfiguration()
			.then(() => {
				this.folderConfiguration = folderConfiguration;
				this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
				this.updateCache();
				return true;
			});
	}

	private adoptFromNodeBasedConfiguration(fileService: IFileService): Promise<boolean> {
		const oldFolderConfiguration = this.folderConfiguration;
		this.folderConfiguration = new FileServiceBasedFolderConfiguration(this.workspaceFolder.uri, this.configFolderRelativePath, this.workbenchState, fileService, <AbstractFolderConfiguration>oldFolderConfiguration);
		oldFolderConfiguration.dispose();
		this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
		return Promise.resolve(false);
	}

	private onDidFolderConfigurationChange(): void {
		this.updateCache();
		this._onDidChange.fire();
	}

	private updateCache(): Promise<void> {
		if (this.workspaceFolder.uri.scheme !== Schemas.file && this.folderConfiguration instanceof FileServiceBasedFolderConfiguration) {
			return this.folderConfiguration.loadConfiguration()
				.then(configurationModel => this.cachedFolderConfiguration.updateConfiguration(configurationModel));
		}
		return Promise.resolve(undefined);
	}
}
