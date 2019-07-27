/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { Event, Emitter } from 'vs/base/common/event';
import * as errors from 'vs/base/common/errors';
import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { FileChangeType, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { ConfigurationModel, ConfigurationModelParser } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationModelParser, StandaloneConfigurationModelParser } from 'vs/workbench/services/configuration/common/configurationModels';
import { FOLDER_SETTINGS_PATH, TASKS_CONFIGURATION_KEY, FOLDER_SETTINGS_NAME, LAUNCH_CONFIGURATION_KEY, IConfigurationCache, ConfigurationKey, REMOTE_MACHINE_SCOPES, FOLDER_SCOPES, WORKSPACE_SCOPES } from 'vs/workbench/services/configuration/common/configuration';
import { IStoredWorkspaceFolder, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { JSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditingService';
import { WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { extname, join } from 'vs/base/common/path';
import { equals } from 'vs/base/common/objects';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationModel } from 'vs/platform/configuration/common/configuration';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { hash } from 'vs/base/common/hash';

function whenProviderRegistered(scheme: string, fileService: IFileService): Promise<void> {
	if (fileService.canHandleResource(URI.from({ scheme }))) {
		return Promise.resolve();
	}
	return new Promise((c, e) => {
		const disposable = fileService.onDidChangeFileSystemProviderRegistrations(e => {
			if (e.scheme === scheme && e.added) {
				disposable.dispose();
				c();
			}
		});
	});
}

export class UserConfiguration extends Disposable {

	private readonly parser: ConfigurationModelParser;
	private readonly reloadConfigurationScheduler: RunOnceScheduler;
	protected readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	constructor(
		private readonly userSettingsResource: URI,
		private readonly scopes: ConfigurationScope[] | undefined,
		private readonly fileService: IFileService
	) {
		super();

		this.parser = new ConfigurationModelParser(this.userSettingsResource.toString(), this.scopes);
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)), 50));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.userSettingsResource))(() => this.reloadConfigurationScheduler.schedule()));
	}

	async initialize(): Promise<ConfigurationModel> {
		return this.reload();
	}

	async reload(): Promise<ConfigurationModel> {
		try {
			const content = await this.fileService.readFile(this.userSettingsResource);
			this.parser.parseContent(content.value.toString() || '{}');
			return this.parser.configurationModel;
		} catch (e) {
			return new ConfigurationModel();
		}
	}

	reprocess(): ConfigurationModel {
		this.parser.parse();
		return this.parser.configurationModel;
	}
}

export class RemoteUserConfiguration extends Disposable {

	private readonly _cachedConfiguration: CachedRemoteUserConfiguration;
	private readonly _fileService: IFileService;
	private _userConfiguration: FileServiceBasedRemoteUserConfiguration | CachedRemoteUserConfiguration;
	private _userConfigurationInitializationPromise: Promise<ConfigurationModel> | null = null;

	private readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	public readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	constructor(
		remoteAuthority: string,
		configurationCache: IConfigurationCache,
		fileService: IFileService,
		remoteAgentService: IRemoteAgentService
	) {
		super();
		this._fileService = fileService;
		this._userConfiguration = this._cachedConfiguration = new CachedRemoteUserConfiguration(remoteAuthority, configurationCache);
		remoteAgentService.getEnvironment().then(async environment => {
			if (environment) {
				const userConfiguration = this._register(new FileServiceBasedRemoteUserConfiguration(environment.settingsPath, REMOTE_MACHINE_SCOPES, this._fileService));
				this._register(userConfiguration.onDidChangeConfiguration(configurationModel => this.onDidUserConfigurationChange(configurationModel)));
				this._userConfigurationInitializationPromise = userConfiguration.initialize();
				const configurationModel = await this._userConfigurationInitializationPromise;
				this._userConfiguration.dispose();
				this._userConfiguration = userConfiguration;
				this.onDidUserConfigurationChange(configurationModel);
			}
		});
	}

	async initialize(): Promise<ConfigurationModel> {
		if (this._userConfiguration instanceof FileServiceBasedRemoteUserConfiguration) {
			return this._userConfiguration.initialize();
		}

		// Initialize cached configuration
		let configurationModel = await this._userConfiguration.initialize();
		if (this._userConfigurationInitializationPromise) {
			// Use user configuration
			configurationModel = await this._userConfigurationInitializationPromise;
			this._userConfigurationInitializationPromise = null;
		}

		return configurationModel;
	}

	reload(): Promise<ConfigurationModel> {
		return this._userConfiguration.reload();
	}

	reprocess(): ConfigurationModel {
		return this._userConfiguration.reprocess();
	}

	private onDidUserConfigurationChange(configurationModel: ConfigurationModel): void {
		this.updateCache(configurationModel);
		this._onDidChangeConfiguration.fire(configurationModel);
	}

	private updateCache(configurationModel: ConfigurationModel): Promise<void> {
		return this._cachedConfiguration.updateConfiguration(configurationModel);
	}
}

class FileServiceBasedRemoteUserConfiguration extends Disposable {

	private readonly parser: ConfigurationModelParser;
	private readonly reloadConfigurationScheduler: RunOnceScheduler;
	protected readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	private fileWatcherDisposable: IDisposable = Disposable.None;
	private directoryWatcherDisposable: IDisposable = Disposable.None;

	constructor(
		private readonly configurationResource: URI,
		private readonly scopes: ConfigurationScope[] | undefined,
		private readonly fileService: IFileService
	) {
		super();

		this.parser = new ConfigurationModelParser(this.configurationResource.toString(), this.scopes);
		this._register(fileService.onFileChanges(e => this.handleFileEvents(e)));
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)), 50));
		this._register(toDisposable(() => {
			this.stopWatchingResource();
			this.stopWatchingDirectory();
		}));
	}

	private watchResource(): void {
		this.fileWatcherDisposable = this.fileService.watch(this.configurationResource);
	}

	private stopWatchingResource(): void {
		this.fileWatcherDisposable.dispose();
		this.fileWatcherDisposable = Disposable.None;
	}

	private watchDirectory(): void {
		const directory = resources.dirname(this.configurationResource);
		this.directoryWatcherDisposable = this.fileService.watch(directory);
	}

	private stopWatchingDirectory(): void {
		this.directoryWatcherDisposable.dispose();
		this.directoryWatcherDisposable = Disposable.None;
	}

	async initialize(): Promise<ConfigurationModel> {
		const exists = await this.fileService.exists(this.configurationResource);
		this.onResourceExists(exists);
		return this.reload();
	}

	async reload(): Promise<ConfigurationModel> {
		try {
			const content = await this.fileService.readFile(this.configurationResource);
			this.parser.parseContent(content.value.toString());
			return this.parser.configurationModel;
		} catch (e) {
			return new ConfigurationModel();
		}
	}

	reprocess(): ConfigurationModel {
		this.parser.parse();
		return this.parser.configurationModel;
	}

	private async handleFileEvents(event: FileChangesEvent): Promise<void> {
		const events = event.changes;

		let affectedByChanges = false;

		// Find changes that affect the resource
		for (const event of events) {
			affectedByChanges = resources.isEqual(this.configurationResource, event.resource);
			if (affectedByChanges) {
				if (event.type === FileChangeType.ADDED) {
					this.onResourceExists(true);
				} else if (event.type === FileChangeType.DELETED) {
					this.onResourceExists(false);
				}
				break;
			}
		}

		if (affectedByChanges) {
			this.reloadConfigurationScheduler.schedule();
		}
	}

	private onResourceExists(exists: boolean): void {
		if (exists) {
			this.stopWatchingDirectory();
			this.watchResource();
		} else {
			this.stopWatchingResource();
			this.watchDirectory();
		}
	}
}

class CachedRemoteUserConfiguration extends Disposable {

	private readonly _onDidChange: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChange: Event<ConfigurationModel> = this._onDidChange.event;

	private readonly key: ConfigurationKey;
	private configurationModel: ConfigurationModel;

	constructor(
		remoteAuthority: string,
		private readonly configurationCache: IConfigurationCache
	) {
		super();
		this.key = { type: 'user', key: remoteAuthority };
		this.configurationModel = new ConfigurationModel();
	}

	getConfigurationModel(): ConfigurationModel {
		return this.configurationModel;
	}

	initialize(): Promise<ConfigurationModel> {
		return this.reload();
	}

	reprocess(): ConfigurationModel {
		return this.configurationModel;
	}

	async reload(): Promise<ConfigurationModel> {
		const content = await this.configurationCache.read(this.key);
		try {
			const parsed: IConfigurationModel = JSON.parse(content);
			this.configurationModel = new ConfigurationModel(parsed.contents, parsed.keys, parsed.overrides);
		} catch (e) {
		}
		return this.configurationModel;
	}

	updateConfiguration(configurationModel: ConfigurationModel): Promise<void> {
		if (configurationModel.keys.length) {
			return this.configurationCache.write(this.key, JSON.stringify(configurationModel.toJSON()));
		} else {
			return this.configurationCache.remove(this.key);
		}
	}
}

export class WorkspaceConfiguration extends Disposable {

	private readonly _fileService: IFileService;
	private readonly _cachedConfiguration: CachedWorkspaceConfiguration;
	private _workspaceConfiguration: IWorkspaceConfiguration;
	private _workspaceConfigurationChangeDisposable: IDisposable = Disposable.None;
	private _workspaceIdentifier: IWorkspaceIdentifier | null = null;

	private readonly _onDidUpdateConfiguration: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateConfiguration: Event<void> = this._onDidUpdateConfiguration.event;

	private _loaded: boolean = false;
	get loaded(): boolean { return this._loaded; }

	constructor(
		configurationCache: IConfigurationCache,
		fileService: IFileService
	) {
		super();
		this._fileService = fileService;
		this._workspaceConfiguration = this._cachedConfiguration = new CachedWorkspaceConfiguration(configurationCache);
	}

	async load(workspaceIdentifier: IWorkspaceIdentifier): Promise<void> {
		this._workspaceIdentifier = workspaceIdentifier;
		if (!(this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration)) {
			if (this._workspaceIdentifier.configPath.scheme === Schemas.file) {
				this.switch(new FileServiceBasedWorkspaceConfiguration(this._fileService));
			} else {
				this.waitAndSwitch(this._workspaceIdentifier);
			}
		}
		this._loaded = this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration;
		await this._workspaceConfiguration.load(this._workspaceIdentifier);
	}

	reload(): Promise<void> {
		return this._workspaceIdentifier ? this.load(this._workspaceIdentifier) : Promise.resolve();
	}

	getFolders(): IStoredWorkspaceFolder[] {
		return this._workspaceConfiguration.getFolders();
	}

	setFolders(folders: IStoredWorkspaceFolder[], jsonEditingService: JSONEditingService): Promise<void> {
		if (this._workspaceIdentifier) {
			return jsonEditingService.write(this._workspaceIdentifier.configPath, { key: 'folders', value: folders }, true)
				.then(() => this.reload());
		}
		return Promise.resolve();
	}

	getConfiguration(): ConfigurationModel {
		return this._workspaceConfiguration.getWorkspaceSettings();
	}

	reprocessWorkspaceSettings(): ConfigurationModel {
		this._workspaceConfiguration.reprocessWorkspaceSettings();
		return this.getConfiguration();
	}

	private async waitAndSwitch(workspaceIdentifier: IWorkspaceIdentifier): Promise<void> {
		await whenProviderRegistered(workspaceIdentifier.configPath.scheme, this._fileService);
		if (!(this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration)) {
			const fileServiceBasedWorkspaceConfiguration = this._register(new FileServiceBasedWorkspaceConfiguration(this._fileService));
			await fileServiceBasedWorkspaceConfiguration.load(workspaceIdentifier);
			this.switch(fileServiceBasedWorkspaceConfiguration);
			this._loaded = true;
			this.onDidWorkspaceConfigurationChange(false);
		}
	}

	private switch(fileServiceBasedWorkspaceConfiguration: FileServiceBasedWorkspaceConfiguration): void {
		this._workspaceConfiguration.dispose();
		this._workspaceConfigurationChangeDisposable.dispose();
		this._workspaceConfiguration = this._register(fileServiceBasedWorkspaceConfiguration);
		this._workspaceConfigurationChangeDisposable = this._register(this._workspaceConfiguration.onDidChange(e => this.onDidWorkspaceConfigurationChange(true)));
	}

	private async onDidWorkspaceConfigurationChange(reload: boolean): Promise<void> {
		if (reload) {
			await this.reload();
		}
		this.updateCache();
		this._onDidUpdateConfiguration.fire();
	}

	private updateCache(): Promise<void> {
		if (this._workspaceIdentifier && this._workspaceIdentifier.configPath.scheme !== Schemas.file && this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration) {
			return this._workspaceConfiguration.load(this._workspaceIdentifier)
				.then(() => this._cachedConfiguration.updateWorkspace(this._workspaceIdentifier!, this._workspaceConfiguration.getConfigurationModel()));
		}
		return Promise.resolve(undefined);
	}
}

interface IWorkspaceConfiguration extends IDisposable {
	readonly onDidChange: Event<void>;
	workspaceConfigurationModelParser: WorkspaceConfigurationModelParser;
	workspaceSettings: ConfigurationModel;
	workspaceIdentifier: IWorkspaceIdentifier | null;
	load(workspaceIdentifier: IWorkspaceIdentifier): Promise<void>;
	getConfigurationModel(): ConfigurationModel;
	getFolders(): IStoredWorkspaceFolder[];
	getWorkspaceSettings(): ConfigurationModel;
	reprocessWorkspaceSettings(): ConfigurationModel;
}

class FileServiceBasedWorkspaceConfiguration extends Disposable implements IWorkspaceConfiguration {

	workspaceConfigurationModelParser: WorkspaceConfigurationModelParser;
	workspaceSettings: ConfigurationModel;
	private _workspaceIdentifier: IWorkspaceIdentifier | null = null;
	private workspaceConfigWatcher: IDisposable;
	private readonly reloadConfigurationScheduler: RunOnceScheduler;

	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(private fileService: IFileService) {
		super();

		this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser('');
		this.workspaceSettings = new ConfigurationModel();

		this._register(fileService.onFileChanges(e => this.handleWorkspaceFileEvents(e)));
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
		this.workspaceConfigWatcher = this._register(this.watchWorkspaceConfigurationFile());
	}

	get workspaceIdentifier(): IWorkspaceIdentifier | null {
		return this._workspaceIdentifier;
	}

	async load(workspaceIdentifier: IWorkspaceIdentifier): Promise<void> {
		if (!this._workspaceIdentifier || this._workspaceIdentifier.id !== workspaceIdentifier.id) {
			this._workspaceIdentifier = workspaceIdentifier;
			this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(this._workspaceIdentifier.id);
			dispose(this.workspaceConfigWatcher);
			this.workspaceConfigWatcher = this._register(this.watchWorkspaceConfigurationFile());
		}
		let contents = '';
		try {
			const content = await this.fileService.readFile(this._workspaceIdentifier.configPath);
			contents = content.value.toString();
		} catch (error) {
			const exists = await this.fileService.exists(this._workspaceIdentifier.configPath);
			if (exists) {
				errors.onUnexpectedError(error);
			}
		}
		this.workspaceConfigurationModelParser.parseContent(contents);
		this.consolidate();
	}

	getConfigurationModel(): ConfigurationModel {
		return this.workspaceConfigurationModelParser.configurationModel;
	}

	getFolders(): IStoredWorkspaceFolder[] {
		return this.workspaceConfigurationModelParser.folders;
	}

	getWorkspaceSettings(): ConfigurationModel {
		return this.workspaceSettings;
	}

	reprocessWorkspaceSettings(): ConfigurationModel {
		this.workspaceConfigurationModelParser.reprocessWorkspaceSettings();
		this.consolidate();
		return this.getWorkspaceSettings();
	}

	private consolidate(): void {
		this.workspaceSettings = this.workspaceConfigurationModelParser.settingsModel.merge(this.workspaceConfigurationModelParser.launchModel);
	}

	private watchWorkspaceConfigurationFile(): IDisposable {
		return this._workspaceIdentifier ? this.fileService.watch(this._workspaceIdentifier.configPath) : Disposable.None;
	}

	private handleWorkspaceFileEvents(event: FileChangesEvent): void {
		if (this._workspaceIdentifier) {
			const events = event.changes;

			let affectedByChanges = false;
			// Find changes that affect workspace file
			for (let i = 0, len = events.length; i < len && !affectedByChanges; i++) {
				affectedByChanges = resources.isEqual(this._workspaceIdentifier.configPath, events[i].resource);
			}

			if (affectedByChanges) {
				this.reloadConfigurationScheduler.schedule();
			}
		}
	}
}

class CachedWorkspaceConfiguration extends Disposable implements IWorkspaceConfiguration {

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	workspaceConfigurationModelParser: WorkspaceConfigurationModelParser;
	workspaceSettings: ConfigurationModel;

	constructor(private readonly configurationCache: IConfigurationCache) {
		super();
		this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser('');
		this.workspaceSettings = new ConfigurationModel();
	}

	async load(workspaceIdentifier: IWorkspaceIdentifier): Promise<void> {
		try {
			const key = this.getKey(workspaceIdentifier);
			const contents = await this.configurationCache.read(key);
			this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(key.key);
			this.workspaceConfigurationModelParser.parseContent(contents);
			this.workspaceSettings = this.workspaceConfigurationModelParser.settingsModel.merge(this.workspaceConfigurationModelParser.launchModel);
		} catch (e) {
		}
	}

	get workspaceIdentifier(): IWorkspaceIdentifier | null {
		return null;
	}

	getConfigurationModel(): ConfigurationModel {
		return this.workspaceConfigurationModelParser.configurationModel;
	}

	getFolders(): IStoredWorkspaceFolder[] {
		return this.workspaceConfigurationModelParser.folders;
	}

	getWorkspaceSettings(): ConfigurationModel {
		return this.workspaceSettings;
	}

	reprocessWorkspaceSettings(): ConfigurationModel {
		return this.workspaceSettings;
	}

	async updateWorkspace(workspaceIdentifier: IWorkspaceIdentifier, configurationModel: ConfigurationModel): Promise<void> {
		try {
			const key = this.getKey(workspaceIdentifier);
			if (configurationModel.keys.length) {
				await this.configurationCache.write(key, JSON.stringify(configurationModel.toJSON().contents));
			} else {
				await this.configurationCache.remove(key);
			}
		} catch (error) {
		}
	}

	private getKey(workspaceIdentifier: IWorkspaceIdentifier): ConfigurationKey {
		return {
			type: 'workspaces',
			key: workspaceIdentifier.id
		};
	}
}

export interface IFolderConfiguration extends IDisposable {
	readonly onDidChange: Event<void>;
	loadConfiguration(): Promise<ConfigurationModel>;
	reprocess(): ConfigurationModel;
}

class FileServiceBasedFolderConfiguration extends Disposable implements IFolderConfiguration {

	private _folderSettingsModelParser: ConfigurationModelParser;
	private _standAloneConfigurations: ConfigurationModel[];
	private _cache: ConfigurationModel;

	private readonly configurationNames: string[];
	protected readonly configurationResources: URI[];
	private changeEventTriggerScheduler: RunOnceScheduler;
	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(protected readonly configurationFolder: URI, workbenchState: WorkbenchState, private fileService: IFileService) {
		super();

		this.configurationNames = [FOLDER_SETTINGS_NAME /*First one should be settings */, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY];
		this.configurationResources = this.configurationNames.map(name => resources.joinPath(this.configurationFolder, `${name}.json`));
		this._folderSettingsModelParser = new ConfigurationModelParser(FOLDER_SETTINGS_PATH, WorkbenchState.WORKSPACE === workbenchState ? FOLDER_SCOPES : WORKSPACE_SCOPES);
		this._standAloneConfigurations = [];
		this._cache = new ConfigurationModel();

		this.changeEventTriggerScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
		this._register(fileService.onFileChanges(e => this.handleWorkspaceFileEvents(e)));
	}

	async loadConfiguration(): Promise<ConfigurationModel> {
		const configurationContents = await Promise.all(this.configurationResources.map(async resource => {
			try {
				const content = await this.fileService.readFile(resource);
				return content.value.toString();
			} catch (error) {
				const exists = await this.fileService.exists(resource);
				if (exists) {
					errors.onUnexpectedError(error);
				}
			}
			return undefined;
		}));

		// reset
		this._standAloneConfigurations = [];
		this._folderSettingsModelParser.parseContent('');

		// parse
		if (configurationContents[0]) {
			this._folderSettingsModelParser.parseContent(configurationContents[0]);
		}
		for (let index = 1; index < configurationContents.length; index++) {
			const contents = configurationContents[index];
			if (contents) {
				const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(this.configurationResources[index].toString(), this.configurationNames[index]);
				standAloneConfigurationModelParser.parseContent(contents);
				this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
			}
		}

		// Consolidate (support *.json files in the workspace settings folder)
		this.consolidate();

		return this._cache;
	}

	reprocess(): ConfigurationModel {
		const oldContents = this._folderSettingsModelParser.configurationModel.contents;
		this._folderSettingsModelParser.parse();
		if (!equals(oldContents, this._folderSettingsModelParser.configurationModel.contents)) {
			this.consolidate();
		}
		return this._cache;
	}

	private consolidate(): void {
		this._cache = this._folderSettingsModelParser.configurationModel.merge(...this._standAloneConfigurations);
	}

	private handleWorkspaceFileEvents(event: FileChangesEvent): void {
		const events = event.changes;
		let affectedByChanges = false;

		// Find changes that affect workspace configuration files
		for (let i = 0, len = events.length; i < len; i++) {
			const resource = events[i].resource;
			const basename = resources.basename(resource);
			const isJson = extname(basename) === '.json';
			const isConfigurationFolderDeleted = (events[i].type === FileChangeType.DELETED && resources.isEqual(resource, this.configurationFolder));

			if (!isJson && !isConfigurationFolderDeleted) {
				continue; // only JSON files or the actual settings folder
			}

			const folderRelativePath = this.toFolderRelativePath(resource);
			if (!folderRelativePath) {
				continue; // event is not inside folder
			}

			// Handle case where ".vscode" got deleted
			if (isConfigurationFolderDeleted) {
				affectedByChanges = true;
				break;
			}

			// only valid workspace config files
			if (this.configurationResources.some(configurationResource => resources.isEqual(configurationResource, resource))) {
				affectedByChanges = true;
				break;
			}
		}

		if (affectedByChanges) {
			this.changeEventTriggerScheduler.schedule();
		}
	}

	private toFolderRelativePath(resource: URI): string | undefined {
		if (resources.isEqualOrParent(resource, this.configurationFolder)) {
			return resources.relativePath(this.configurationFolder, resource);
		}
		return undefined;
	}
}

class CachedFolderConfiguration extends Disposable implements IFolderConfiguration {

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private configurationModel: ConfigurationModel;
	private readonly key: ConfigurationKey;

	constructor(
		folder: URI,
		configFolderRelativePath: string,
		private readonly configurationCache: IConfigurationCache
	) {
		super();
		this.key = { type: 'folder', key: hash(join(folder.path, configFolderRelativePath)).toString(16) };
		this.configurationModel = new ConfigurationModel();
	}

	async loadConfiguration(): Promise<ConfigurationModel> {
		try {
			const contents = await this.configurationCache.read(this.key);
			const parsed: IConfigurationModel = JSON.parse(contents.toString());
			this.configurationModel = new ConfigurationModel(parsed.contents, parsed.keys, parsed.overrides);
		} catch (e) {
		}
		return this.configurationModel;
	}

	async updateConfiguration(configurationModel: ConfigurationModel): Promise<void> {
		if (configurationModel.keys.length) {
			await this.configurationCache.write(this.key, JSON.stringify(configurationModel.toJSON()));
		} else {
			await this.configurationCache.remove(this.key);
		}
	}

	reprocess(): ConfigurationModel {
		return this.configurationModel;
	}

	getUnsupportedKeys(): string[] {
		return [];
	}
}

export class FolderConfiguration extends Disposable implements IFolderConfiguration {

	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private folderConfiguration: IFolderConfiguration;
	private folderConfigurationDisposable: IDisposable = Disposable.None;
	private readonly configurationFolder: URI;
	private cachedFolderConfiguration: CachedFolderConfiguration;

	constructor(
		readonly workspaceFolder: IWorkspaceFolder,
		configFolderRelativePath: string,
		private readonly workbenchState: WorkbenchState,
		fileService: IFileService,
		configurationCache: IConfigurationCache
	) {
		super();

		this.configurationFolder = resources.joinPath(workspaceFolder.uri, configFolderRelativePath);
		this.folderConfiguration = this.cachedFolderConfiguration = new CachedFolderConfiguration(workspaceFolder.uri, configFolderRelativePath, configurationCache);
		if (workspaceFolder.uri.scheme === Schemas.file) {
			this.folderConfiguration = new FileServiceBasedFolderConfiguration(this.configurationFolder, this.workbenchState, fileService);
		} else {
			whenProviderRegistered(workspaceFolder.uri.scheme, fileService)
				.then(() => {
					this.folderConfiguration.dispose();
					this.folderConfigurationDisposable.dispose();
					this.folderConfiguration = new FileServiceBasedFolderConfiguration(this.configurationFolder, this.workbenchState, fileService);
					this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
					this.onDidFolderConfigurationChange();
				});
		}
		this.folderConfigurationDisposable = this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
	}

	loadConfiguration(): Promise<ConfigurationModel> {
		return this.folderConfiguration.loadConfiguration();
	}

	reprocess(): ConfigurationModel {
		return this.folderConfiguration.reprocess();
	}

	private onDidFolderConfigurationChange(): void {
		this.updateCache();
		this._onDidChange.fire();
	}

	private updateCache(): Promise<void> {
		if (this.configurationFolder.scheme !== Schemas.file && this.folderConfiguration instanceof FileServiceBasedFolderConfiguration) {
			return this.folderConfiguration.loadConfiguration()
				.then(configurationModel => this.cachedFolderConfiguration.updateConfiguration(configurationModel));
		}
		return Promise.resolve(undefined);
	}
}
