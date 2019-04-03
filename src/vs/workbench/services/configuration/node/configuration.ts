/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { Event, Emitter } from 'vs/base/common/event';
import * as pfs from 'vs/base/node/pfs';
import * as errors from 'vs/base/common/errors';
import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { FileChangeType, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { ConfigurationModel, ConfigurationModelParser } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationModelParser, FolderSettingsModelParser, StandaloneConfigurationModelParser } from 'vs/workbench/services/configuration/common/configurationModels';
import { FOLDER_SETTINGS_PATH, TASKS_CONFIGURATION_KEY, FOLDER_SETTINGS_NAME, LAUNCH_CONFIGURATION_KEY, IConfigurationCache, ConfigurationKey } from 'vs/workbench/services/configuration/common/configuration';
import { IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { JSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditingService';
import { WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { extname, join } from 'vs/base/common/path';
import { equals } from 'vs/base/common/objects';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationModel, compare } from 'vs/platform/configuration/common/configuration';
import { NodeBasedUserConfiguration } from 'vs/platform/configuration/node/configuration';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';

export class LocalUserConfiguration extends Disposable {

	private readonly userConfigurationResource: URI;
	private userConfiguration: NodeBasedUserConfiguration | FileServiceBasedUserConfiguration;
	private changeDisposable: IDisposable = Disposable.None;

	private readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	public readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	constructor(
		userSettingsPath: string
	) {
		super();
		this.userConfigurationResource = URI.file(userSettingsPath);
		this.userConfiguration = this._register(new NodeBasedUserConfiguration(userSettingsPath));
	}

	initialize(): Promise<ConfigurationModel> {
		return this.userConfiguration.initialize();
	}

	reload(): Promise<ConfigurationModel> {
		return this.userConfiguration.reload();
	}

	async adopt(fileService: IFileService): Promise<ConfigurationModel | null> {
		if (this.userConfiguration instanceof NodeBasedUserConfiguration) {
			const oldConfigurationModel = this.userConfiguration.getConfigurationModel();
			this.userConfiguration.dispose();
			dispose(this.changeDisposable);

			let newConfigurationModel = new ConfigurationModel();
			this.userConfiguration = this._register(new FileServiceBasedUserConfiguration(this.userConfigurationResource, fileService));
			this.changeDisposable = this._register(this.userConfiguration.onDidChangeConfiguration(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)));
			newConfigurationModel = await this.userConfiguration.initialize();

			const { added, updated, removed } = compare(oldConfigurationModel, newConfigurationModel);
			if (added.length > 0 || updated.length > 0 || removed.length > 0) {
				return newConfigurationModel;
			}
		}
		return null;
	}
}

export class RemoteUserConfiguration extends Disposable {

	private readonly _cachedConfiguration: CachedUserConfiguration;
	private _userConfiguration: FileServiceBasedUserConfiguration | CachedUserConfiguration;

	private readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	public readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	constructor(
		remoteAuthority: string,
		configurationCache: IConfigurationCache
	) {
		super();
		this._userConfiguration = this._cachedConfiguration = new CachedUserConfiguration(remoteAuthority, configurationCache);
	}

	initialize(): Promise<ConfigurationModel> {
		return this._userConfiguration.initialize();
	}

	reload(): Promise<ConfigurationModel> {
		return this._userConfiguration.reload();
	}

	async adopt(configurationResource: URI | null, fileService: IFileService): Promise<ConfigurationModel | null> {
		if (this._userConfiguration instanceof CachedUserConfiguration) {
			const oldConfigurationModel = this._userConfiguration.getConfigurationModel();
			let newConfigurationModel = new ConfigurationModel();
			if (configurationResource) {
				this._userConfiguration = new FileServiceBasedUserConfiguration(configurationResource, fileService);
				this._register(this._userConfiguration.onDidChangeConfiguration(configurationModel => this.onDidUserConfigurationChange(configurationModel)));
				newConfigurationModel = await this._userConfiguration.initialize();
			}
			const { added, updated, removed } = compare(oldConfigurationModel, newConfigurationModel);
			if (added.length > 0 || updated.length > 0 || removed.length > 0) {
				this.updateCache(newConfigurationModel);
				return newConfigurationModel;
			}
		}
		return null;
	}

	private onDidUserConfigurationChange(configurationModel: ConfigurationModel): void {
		this.updateCache(configurationModel);
		this._onDidChangeConfiguration.fire(configurationModel);
	}

	private updateCache(configurationModel: ConfigurationModel): Promise<void> {
		return this._cachedConfiguration.updateConfiguration(configurationModel);
	}
}

export class FileServiceBasedUserConfiguration extends Disposable {

	private readonly reloadConfigurationScheduler: RunOnceScheduler;
	protected readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	private fileWatcherDisposable: IDisposable = Disposable.None;
	private directoryWatcherDisposable: IDisposable = Disposable.None;

	constructor(
		private readonly configurationResource: URI,
		private readonly fileService: IFileService
	) {
		super();

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
			const content = await this.fileService.resolveContent(this.configurationResource);
			const parser = new ConfigurationModelParser(this.configurationResource.toString());
			parser.parse(content.value);
			return parser.configurationModel;
		} catch (e) {
			return new ConfigurationModel();
		}
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

class CachedUserConfiguration extends Disposable {

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

export interface IWorkspaceIdentifier {
	id: string;
	configPath: URI;
}

export class WorkspaceConfiguration extends Disposable {

	private readonly _cachedConfiguration: CachedWorkspaceConfiguration;
	private _workspaceConfiguration: IWorkspaceConfiguration;
	private _workspaceIdentifier: IWorkspaceIdentifier | null = null;
	private _fileService: IFileService | null = null;

	private readonly _onDidUpdateConfiguration: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateConfiguration: Event<void> = this._onDidUpdateConfiguration.event;

	constructor(
		configurationCache: IConfigurationCache
	) {
		super();
		this._cachedConfiguration = new CachedWorkspaceConfiguration(configurationCache);
		this._workspaceConfiguration = this._cachedConfiguration;
	}

	adopt(fileService: IFileService): Promise<boolean> {
		if (!this._fileService) {
			this._fileService = fileService;
			if (this.adoptWorkspaceConfiguration()) {
				if (this._workspaceIdentifier) {
					return this._workspaceConfiguration.load(this._workspaceIdentifier).then(() => true);
				}
			}
		}
		return Promise.resolve(false);
	}

	load(workspaceIdentifier: IWorkspaceIdentifier): Promise<void> {
		this._workspaceIdentifier = workspaceIdentifier;
		this.adoptWorkspaceConfiguration();
		return this._workspaceConfiguration.load(this._workspaceIdentifier);
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

	private adoptWorkspaceConfiguration(): boolean {
		if (this._workspaceIdentifier) {
			if (this._fileService) {
				if (!(this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration)) {
					const oldWorkspaceConfiguration = this._workspaceConfiguration;
					this._workspaceConfiguration = new FileServiceBasedWorkspaceConfiguration(this._fileService, oldWorkspaceConfiguration);
					this._register(this._workspaceConfiguration.onDidChange(e => this.onDidWorkspaceConfigurationChange()));
					if (oldWorkspaceConfiguration instanceof CachedWorkspaceConfiguration) {
						this.updateCache();
						return true;
					} else {
						dispose(oldWorkspaceConfiguration);
						return false;
					}
				}
				return false;
			}
			if (this._workspaceIdentifier.configPath.scheme === Schemas.file) {
				if (!(this._workspaceConfiguration instanceof NodeBasedWorkspaceConfiguration)) {
					dispose(this._workspaceConfiguration);
					this._workspaceConfiguration = new NodeBasedWorkspaceConfiguration();
					return true;
				}
				return false;
			}
		}
		return false;
	}

	private onDidWorkspaceConfigurationChange(): void {
		this.updateCache();
		this.reload().then(() => this._onDidUpdateConfiguration.fire());
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

abstract class AbstractWorkspaceConfiguration extends Disposable implements IWorkspaceConfiguration {

	workspaceConfigurationModelParser: WorkspaceConfigurationModelParser;
	workspaceSettings: ConfigurationModel;
	private _workspaceIdentifier: IWorkspaceIdentifier | null = null;

	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(from?: IWorkspaceConfiguration) {
		super();

		this.workspaceConfigurationModelParser = from ? from.workspaceConfigurationModelParser : new WorkspaceConfigurationModelParser('');
		this.workspaceSettings = from ? from.workspaceSettings : new ConfigurationModel();
	}

	get workspaceIdentifier(): IWorkspaceIdentifier | null {
		return this._workspaceIdentifier;
	}

	async load(workspaceIdentifier: IWorkspaceIdentifier): Promise<void> {
		this._workspaceIdentifier = workspaceIdentifier;
		this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(workspaceIdentifier.id);
		let contents = '';
		try {
			contents = (await this.loadWorkspaceConfigurationContents(workspaceIdentifier.configPath)) || '';
		} catch (e) {
			errors.onUnexpectedError(e);
		}
		this.workspaceConfigurationModelParser.parse(contents);
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

	protected abstract loadWorkspaceConfigurationContents(workspaceConfigurationResource: URI): Promise<string | undefined>;
}

class NodeBasedWorkspaceConfiguration extends AbstractWorkspaceConfiguration {

	protected async loadWorkspaceConfigurationContents(workspaceConfigurationResource: URI): Promise<string | undefined> {
		try {
			const contents = await pfs.readFile(workspaceConfigurationResource.fsPath);
			return contents.toString();
		} catch (e) {
			if (e.code === 'ENOENT') {
				return undefined;
			}
			throw e;
		}
	}

}

class FileServiceBasedWorkspaceConfiguration extends AbstractWorkspaceConfiguration {

	private workspaceConfig: URI | null = null;
	private workspaceConfigWatcher: IDisposable;

	private readonly reloadConfigurationScheduler: RunOnceScheduler;

	constructor(private fileService: IFileService, from?: IWorkspaceConfiguration) {
		super(from);
		this.workspaceConfig = from && from.workspaceIdentifier ? from.workspaceIdentifier.configPath : null;
		this._register(fileService.onFileChanges(e => this.handleWorkspaceFileEvents(e)));
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
		this.workspaceConfigWatcher = this.watchWorkspaceConfigurationFile();
	}

	private watchWorkspaceConfigurationFile(): IDisposable {
		if (this.workspaceConfig) {
			return this.fileService.watch(this.workspaceConfig);
		}

		return Disposable.None;
	}

	protected loadWorkspaceConfigurationContents(workspaceConfigurationResource: URI): Promise<string> {
		if (!(this.workspaceConfig && resources.isEqual(this.workspaceConfig, workspaceConfigurationResource))) {
			this.workspaceConfigWatcher = dispose(this.workspaceConfigWatcher);
			this.workspaceConfig = workspaceConfigurationResource;
			this.workspaceConfigWatcher = this.watchWorkspaceConfigurationFile();
		}
		return this.fileService.resolveContent(this.workspaceConfig).then(content => content.value);
	}

	private handleWorkspaceFileEvents(event: FileChangesEvent): void {
		if (this.workspaceConfig) {
			const events = event.changes;

			let affectedByChanges = false;
			// Find changes that affect workspace file
			for (let i = 0, len = events.length; i < len && !affectedByChanges; i++) {
				affectedByChanges = resources.isEqual(this.workspaceConfig, events[i].resource);
			}

			if (affectedByChanges) {
				this.reloadConfigurationScheduler.schedule();
			}
		}
	}

	dispose(): void {
		super.dispose();

		this.workspaceConfigWatcher = dispose(this.workspaceConfigWatcher);
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
			this.workspaceConfigurationModelParser.parse(contents);
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
	readonly loaded: boolean;
	loadConfiguration(): Promise<ConfigurationModel>;
	reprocess(): ConfigurationModel;
}

export abstract class AbstractFolderConfiguration extends Disposable implements IFolderConfiguration {

	private _folderSettingsModelParser: FolderSettingsModelParser;
	private _standAloneConfigurations: ConfigurationModel[];
	private _cache: ConfigurationModel;
	private _loaded: boolean = false;

	private readonly configurationNames: string[];
	protected readonly configurationResources: URI[];
	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(protected readonly configurationFolder: URI, workbenchState: WorkbenchState, from?: AbstractFolderConfiguration) {
		super();

		this.configurationNames = [FOLDER_SETTINGS_NAME  /*First one should be settings */, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY];
		this.configurationResources = this.configurationNames.map(name => resources.joinPath(this.configurationFolder, `${name}.json`));
		this._folderSettingsModelParser = from ? from._folderSettingsModelParser : new FolderSettingsModelParser(FOLDER_SETTINGS_PATH, WorkbenchState.WORKSPACE === workbenchState ? [ConfigurationScope.RESOURCE] : [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE]);
		this._standAloneConfigurations = from ? from._standAloneConfigurations : [];
		this._cache = from ? from._cache : new ConfigurationModel();
	}

	get loaded(): boolean {
		return this._loaded;
	}

	async loadConfiguration(): Promise<ConfigurationModel> {
		const configurationContents = await Promise.all(this.configurationResources.map(resource =>
			this.loadConfigurationResourceContents(resource)
				.then(undefined, error => {
					/* never fail */
					errors.onUnexpectedError(error);
					return undefined;
				})));

		// reset
		this._standAloneConfigurations = [];
		this._folderSettingsModelParser.parse('');

		// parse
		if (configurationContents[0]) {
			this._folderSettingsModelParser.parse(configurationContents[0]);
		}
		for (let index = 1; index < configurationContents.length; index++) {
			const contents = configurationContents[index];
			if (contents) {
				const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(this.configurationResources[index].toString(), this.configurationNames[index]);
				standAloneConfigurationModelParser.parse(contents);
				this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
			}
		}

		// Consolidate (support *.json files in the workspace settings folder)
		this.consolidate();

		this._loaded = true;
		return this._cache;
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

	protected abstract loadConfigurationResourceContents(configurationResource: URI): Promise<string | undefined>;
}

export class NodeBasedFolderConfiguration extends AbstractFolderConfiguration {

	protected async loadConfigurationResourceContents(configurationResource: URI): Promise<string | undefined> {
		try {
			const contents = await pfs.readFile(configurationResource.fsPath);
			return contents.toString();
		} catch (e) {
			if (e.code === 'ENOENT') {
				return undefined;
			}
			throw e;
		}
	}
}

export class FileServiceBasedFolderConfiguration extends AbstractFolderConfiguration {

	private changeEventTriggerScheduler: RunOnceScheduler;

	constructor(configurationFolder: URI, workbenchState: WorkbenchState, private fileService: IFileService, from?: AbstractFolderConfiguration) {
		super(configurationFolder, workbenchState, from);
		this.changeEventTriggerScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
		this._register(fileService.onFileChanges(e => this.handleWorkspaceFileEvents(e)));
	}

	protected async loadConfigurationResourceContents(configurationResource: URI): Promise<string | undefined> {
		const exists = await this.fileService.exists(configurationResource);
		if (exists) {
			const contents = await this.fileService.resolveContent(configurationResource);
			return contents.value;
		}
		return undefined;
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
	private readonly key: Thenable<ConfigurationKey>;
	loaded: boolean = false;

	constructor(
		folder: URI,
		configFolderRelativePath: string,
		hashService: IHashService,
		private readonly configurationCache: IConfigurationCache
	) {
		super();
		this.key = hashService.createSHA1(join(folder.path, configFolderRelativePath)).then(key => (<ConfigurationKey>{ type: 'folder', key }));
		this.configurationModel = new ConfigurationModel();
	}

	async loadConfiguration(): Promise<ConfigurationModel> {
		try {
			const key = await this.key;
			const contents = await this.configurationCache.read(key);
			const parsed: IConfigurationModel = JSON.parse(contents.toString());
			this.configurationModel = new ConfigurationModel(parsed.contents, parsed.keys, parsed.overrides);
			this.loaded = true;
		} catch (e) {
		}
		return this.configurationModel;
	}

	async updateConfiguration(configurationModel: ConfigurationModel): Promise<void> {
		const key = await this.key;
		if (configurationModel.keys.length) {
			await this.configurationCache.write(key, JSON.stringify(configurationModel.toJSON()));
		} else {
			await this.configurationCache.remove(key);
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
	private readonly configurationFolder: URI;
	private cachedFolderConfiguration: CachedFolderConfiguration;
	private _loaded: boolean = false;

	constructor(
		readonly workspaceFolder: IWorkspaceFolder,
		configFolderRelativePath: string,
		private readonly workbenchState: WorkbenchState,
		hashService: IHashService,
		configurationCache: IConfigurationCache,
		fileService?: IFileService
	) {
		super();

		this.configurationFolder = resources.joinPath(workspaceFolder.uri, configFolderRelativePath);
		this.cachedFolderConfiguration = new CachedFolderConfiguration(workspaceFolder.uri, configFolderRelativePath, hashService, configurationCache);
		this.folderConfiguration = this.cachedFolderConfiguration;
		if (fileService) {
			this.folderConfiguration = new FileServiceBasedFolderConfiguration(this.configurationFolder, this.workbenchState, fileService);
		} else if (workspaceFolder.uri.scheme === Schemas.file) {
			this.folderConfiguration = new NodeBasedFolderConfiguration(this.configurationFolder, this.workbenchState);
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
		const folderConfiguration = new FileServiceBasedFolderConfiguration(this.configurationFolder, this.workbenchState, fileService);
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
		this.folderConfiguration = new FileServiceBasedFolderConfiguration(this.configurationFolder, this.workbenchState, fileService, <AbstractFolderConfiguration>oldFolderConfiguration);
		oldFolderConfiguration.dispose();
		this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
		return Promise.resolve(false);
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
