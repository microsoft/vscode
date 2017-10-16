/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import * as assert from 'vs/base/common/assert';
import Event, { Emitter } from 'vs/base/common/event';
import { StrictResourceMap } from 'vs/base/common/map';
import * as errors from 'vs/base/common/errors';
import { equals } from 'vs/base/common/objects';
import * as collections from 'vs/base/common/collections';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { readFile, stat, writeFile } from 'vs/base/node/pfs';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import * as extfs from 'vs/base/node/extfs';
import { IWorkspaceContextService, Workspace, WorkbenchState, IWorkspaceFolder, toWorkspaceFolders, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { ConfigWatcher } from 'vs/base/node/config';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CustomConfigurationModel, ConfigurationModel, ConfigurationChangeEvent, AllKeysConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { IConfigurationChangeEvent, ConfigurationTarget, IConfigurationOverrides, keyFromOverrideIdentifier, isConfigurationOverrides, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { WorkspaceConfigurationModel, ScopedConfigurationModel, FolderConfigurationModel, FolderSettingsModel, Configuration, WorkspaceConfigurationChangeEvent } from 'vs/workbench/services/configuration/common/configurationModels';
import { IWorkspaceConfigurationService, WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME, WORKSPACE_STANDALONE_CONFIGURATIONS, WORKSPACE_CONFIG_DEFAULT_PATH, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, defaultSettingsSchemaId, userSettingsSchemaId, workspaceSettingsSchemaId, folderSettingsSchemaId } from 'vs/workbench/services/configuration/common/configuration';
import { ConfigurationService as GlobalConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationNode, IConfigurationRegistry, Extensions, ConfigurationScope, settingsSchema, resourceSettingsSchema } from 'vs/platform/configuration/common/configurationRegistry';
import { createHash } from 'crypto';
import { getWorkspaceLabel, IWorkspacesService, IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IStoredWorkspace } from 'vs/platform/workspaces/common/workspaces';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { IConfigurationEditingService, ConfigurationTarget as EditableConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ConfigurationEditingService } from 'vs/workbench/services/configuration/node/configurationEditingService';

interface IStat {
	resource: URI;
	isDirectory?: boolean;
	children?: { resource: URI; }[];
}

interface IContent {
	resource: URI;
	value: string;
}

export class WorkspaceService extends Disposable implements IWorkspaceConfigurationService, IWorkspaceContextService {

	public _serviceBrand: any;

	private workspace: Workspace;
	private _configuration: Configuration;
	private baseConfigurationService: GlobalConfigurationService;
	private workspaceConfiguration: WorkspaceConfiguration;
	private cachedFolderConfigs: StrictResourceMap<FolderConfiguration>;

	protected readonly _onDidUpdateConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationChangeEvent> = this._onDidUpdateConfiguration.event;

	protected readonly _onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent> = this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	public readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = this._onDidChangeWorkspaceFolders.event;

	protected readonly _onDidChangeWorkspaceName: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceName: Event<void> = this._onDidChangeWorkspaceName.event;

	protected readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState> = this._register(new Emitter<WorkbenchState>());
	public readonly onDidChangeWorkbenchState: Event<WorkbenchState> = this._onDidChangeWorkbenchState.event;

	private configurationEditingService: IConfigurationEditingService;

	constructor(private environmentService: IEnvironmentService, private workspacesService: IWorkspacesService, private workspaceSettingsRootFolder: string = WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME) {
		super();

		this.workspaceConfiguration = this._register(new WorkspaceConfiguration());
		this._register(this.workspaceConfiguration.onDidUpdateConfiguration(() => this.onWorkspaceConfigurationChanged()));

		this.baseConfigurationService = this._register(new GlobalConfigurationService(environmentService));
		this._register(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(e => this.registerConfigurationSchemas()));
	}

	// Workspace Context Service Impl

	public getWorkspace(): Workspace {
		return this.workspace;
	}

	public getWorkbenchState(): WorkbenchState {
		// Workspace has configuration file
		if (this.workspace.configuration) {
			return WorkbenchState.WORKSPACE;
		}

		// Folder has single root
		if (this.workspace.folders.length === 1) {
			return WorkbenchState.FOLDER;
		}

		// Empty
		return WorkbenchState.EMPTY;
	}

	public getWorkspaceFolder(resource: URI): IWorkspaceFolder {
		return this.workspace.getFolder(resource);
	}

	public isInsideWorkspace(resource: URI): boolean {
		return !!this.getWorkspaceFolder(resource);
	}

	public isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean {
		switch (this.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && this.pathEquals(this.workspace.folders[0].uri.fsPath, workspaceIdentifier);
			case WorkbenchState.WORKSPACE:
				return isWorkspaceIdentifier(workspaceIdentifier) && this.workspace.id === workspaceIdentifier.id;
		}
		return false;
	}

	// Workspace Configuration Service Impl

	getConfigurationData(): IConfigurationData {
		return this._configuration.toData();
	}

	getConfiguration<T>(): T
	getConfiguration<T>(section: string): T
	getConfiguration<T>(overrides: IConfigurationOverrides): T
	getConfiguration<T>(section: string, overrides: IConfigurationOverrides): T
	getConfiguration(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : void 0;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : void 0;
		return this._configuration.getSection(section, overrides);
	}

	getValue<T>(key: string, overrides?: IConfigurationOverrides): T {
		return this._configuration.getValue(key, overrides);
	}

	updateValue(key: string, value: any): TPromise<void>
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): TPromise<void>
	updateValue(key: string, value: any, target: ConfigurationTarget): TPromise<void>
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): TPromise<void>
	updateValue(key: string, value: any, arg3?: any, arg4?: any): TPromise<void> {
		assert.ok(this.configurationEditingService, 'Workbench is not initialized yet');
		const overrides = isConfigurationOverrides(arg3) ? arg3 : void 0;
		const target = this.deriveConfigurationTarget(key, value, overrides, overrides ? arg4 : arg3);
		return target ? this.writeConfigurationValue(key, value, target, overrides)
			: TPromise.as(null);
	}

	reloadConfiguration(folder?: IWorkspaceFolder, key?: string): TPromise<void> {
		if (folder) {
			return this.reloadWorkspaceFolderConfiguration(folder, key);
		}
		return this.reloadUserConfiguration()
			.then(() => this.loadConfiguration());
	}

	inspect<T>(key: string, overrides?: IConfigurationOverrides): {
		default: T,
		user: T,
		workspace: T,
		workspaceFolder: T,
		memory?: T,
		value: T
	} {
		return this._configuration.lookup<T>(key);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this._configuration.keys();
	}

	getUnsupportedWorkspaceKeys(): string[] {
		return this.getWorkbenchState() === WorkbenchState.FOLDER ? this._configuration.getFolderConfigurationModel(this.workspace.folders[0].uri).workspaceSettingsConfig.unsupportedKeys : [];
	}

	reloadUserConfiguration(key?: string): TPromise<void> {
		return this.baseConfigurationService.reloadConfiguration();
	}

	reloadWorkspaceConfiguration(key?: string): TPromise<void> {
		const workbenchState = this.getWorkbenchState();
		if (workbenchState === WorkbenchState.FOLDER) {
			return this.onWorkspaceFolderConfigurationChanged(this.workspace.folders[0], key);
		}
		if (workbenchState === WorkbenchState.WORKSPACE) {
			return this.onWorkspaceConfigurationChanged();
		}
		return TPromise.as(null);
	}

	reloadWorkspaceFolderConfiguration(folder: IWorkspaceFolder, key?: string): TPromise<void> {
		return this.onWorkspaceFolderConfigurationChanged(folder, key);
	}

	initialize(arg: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWindowConfiguration): TPromise<any> {
		return this.createWorkspace(arg)
			.then(workspace => this.setWorkspace(workspace))
			.then(() => this.initializeConfiguration());
	}

	setInstantiationService(instantiationService: IInstantiationService): void {
		this.configurationEditingService = instantiationService.createInstance(ConfigurationEditingService);
	}

	handleWorkspaceFileEvents(event: FileChangesEvent): void {
		switch (this.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				this.onSingleFolderFileChanges(event);
				return;
			case WorkbenchState.WORKSPACE:
				this.onWorkspaceFileChanges(event);
				return;
		}
	}

	private createWorkspace(arg: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWindowConfiguration): TPromise<Workspace> {
		if (isWorkspaceIdentifier(arg)) {
			return this.createMulitFolderWorkspace(arg);
		}

		if (isSingleFolderWorkspaceIdentifier(arg)) {
			return this.createSingleFolderWorkspace(arg);
		}

		return this.createEmptyWorkspace(arg);
	}

	private createMulitFolderWorkspace(workspaceIdentifier: IWorkspaceIdentifier): TPromise<Workspace> {
		const workspaceConfigPath = URI.file(workspaceIdentifier.configPath);
		return this.workspaceConfiguration.load(workspaceConfigPath)
			.then(() => {
				const workspaceConfigurationModel = this.workspaceConfiguration.workspaceConfigurationModel;
				const workspaceFolders = toWorkspaceFolders(workspaceConfigurationModel.folders, URI.file(paths.dirname(workspaceConfigPath.fsPath)));
				const workspaceId = workspaceIdentifier.id;
				const workspaceName = getWorkspaceLabel({ id: workspaceId, configPath: workspaceConfigPath.fsPath }, this.environmentService);
				return new Workspace(workspaceId, workspaceName, workspaceFolders, workspaceConfigPath);
			});
	}

	private createSingleFolderWorkspace(singleFolderWorkspaceIdentifier: ISingleFolderWorkspaceIdentifier): TPromise<Workspace> {
		const folderPath = URI.file(singleFolderWorkspaceIdentifier);
		return stat(folderPath.fsPath)
			.then(workspaceStat => {
				const ctime = isLinux ? workspaceStat.ino : workspaceStat.birthtime.getTime(); // On Linux, birthtime is ctime, so we cannot use it! We use the ino instead!
				const id = createHash('md5').update(folderPath.fsPath).update(ctime ? String(ctime) : '').digest('hex');
				const folder = URI.file(folderPath.fsPath);
				return new Workspace(id, paths.basename(folderPath.fsPath), toWorkspaceFolders([{ path: folder.fsPath }]), null, ctime);
			});
	}

	private createEmptyWorkspace(configuration: IWindowConfiguration): TPromise<Workspace> {
		let id = configuration.backupPath ? URI.from({ path: paths.basename(configuration.backupPath), scheme: 'empty' }).toString() : '';
		return TPromise.as(new Workspace(id));
	}

	private setWorkspace(workspace: Workspace): void {
		if (!this.workspace) {
			this.workspace = workspace;
			return;
		}

		const currentState = this.getWorkbenchState();
		const currentWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : void 0;
		const currentFolders = this.workspace.folders;

		this.workspace.update(workspace);

		const newState = this.getWorkbenchState();
		if (newState !== currentState) {
			this._onDidChangeWorkbenchState.fire(newState);
		}

		const newWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : void 0;
		if (newWorkspacePath !== currentWorkspacePath || newState !== currentState) {
			this._onDidChangeWorkspaceName.fire();
		}

		const changes = this.compareFolders(currentFolders, this.workspace.folders);
		if (changes.added.length || changes.removed.length || changes.changed.length) {
			this._onDidChangeWorkspaceFolders.fire(changes);
		}
	}

	private compareFolders(currentFolders: IWorkspaceFolder[], newFolders: IWorkspaceFolder[]): IWorkspaceFoldersChangeEvent {
		const result = { added: [], removed: [], changed: [] };

		result.added = newFolders.filter(newFolder => !currentFolders.some(currentFolder => newFolder.uri.toString() === currentFolder.uri.toString()));
		result.removed = currentFolders.filter(currentFolder => !newFolders.some(newFolder => currentFolder.uri.toString() === newFolder.uri.toString()));
		result.changed = newFolders.filter(newFolder => currentFolders.some(currentFolder => newFolder.uri.toString() === currentFolder.uri.toString() && newFolder.name !== currentFolder.name));

		return result;
	}

	private initializeConfiguration(): TPromise<void> {
		this.registerConfigurationSchemas();
		return this.loadConfiguration();
	}

	private loadConfiguration(): TPromise<void> {
		// reset caches
		this.cachedFolderConfigs = new StrictResourceMap<FolderConfiguration>();

		const folders = this.workspace.folders;
		return this.loadFolderConfigurations(folders)
			.then((folderConfigurations) => {

				let workspaceConfiguration = this.getWorkspaceConfigurationModel(folderConfigurations);
				const folderConfigurationModels = new StrictResourceMap<FolderConfigurationModel>();
				folderConfigurations.forEach((folderConfiguration, index) => folderConfigurationModels.set(folders[index].uri, folderConfiguration));

				this._configuration = new Configuration(this.baseConfigurationService.configuration.defaults, this.baseConfigurationService.configuration.user, workspaceConfiguration, folderConfigurationModels, new ConfigurationModel(), new StrictResourceMap<ConfigurationModel>(), this.getWorkbenchState() !== WorkbenchState.EMPTY ? this.workspace : null); //TODO: Sandy Avoid passing null
				// TODO Sandy: compare with old values??

				const keys = this._configuration.keys();
				this._onDidUpdateConfiguration.fire(new AllKeysConfigurationChangeEvent([...keys.default, ...keys.user, ...keys.workspace, ...keys.workspaceFolder], ConfigurationTarget.WORKSPACE, this.getTargetConfiguration(ConfigurationTarget.WORKSPACE)));
			});
	}

	private getWorkspaceConfigurationModel(folderConfigurations: FolderConfigurationModel[]): ConfigurationModel {
		switch (this.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return folderConfigurations[0];
			case WorkbenchState.WORKSPACE:
				return this.workspaceConfiguration.workspaceConfigurationModel.workspaceConfiguration;
			default:
				return new ConfigurationModel();
		}
	}

	private registerConfigurationSchemas(): void {
		if (this.workspace) {
			const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
			jsonRegistry.registerSchema(defaultSettingsSchemaId, settingsSchema);
			jsonRegistry.registerSchema(userSettingsSchemaId, settingsSchema);

			if (WorkbenchState.WORKSPACE === this.getWorkbenchState()) {
				jsonRegistry.registerSchema(workspaceSettingsSchemaId, settingsSchema);
				jsonRegistry.registerSchema(folderSettingsSchemaId, resourceSettingsSchema);
			} else {
				jsonRegistry.registerSchema(workspaceSettingsSchemaId, settingsSchema);
				jsonRegistry.registerSchema(folderSettingsSchemaId, settingsSchema);
			}
		}
	}

	private onBaseConfigurationChanged(e: IConfigurationChangeEvent): void {
		if (this.workspace && this._configuration) {
			if (e.source === ConfigurationTarget.DEFAULT) {
				this.workspace.folders.forEach(folder => this._configuration.getFolderConfigurationModel(folder.uri).update());
				this._configuration.updateDefaultConfiguration(this.baseConfigurationService.configuration.defaults);
				this.triggerConfigurationChange(new ConfigurationChangeEvent().change(e.affectedKeys), e.source);
			} else {
				let keys = this._configuration.updateUserConfiguration(this.baseConfigurationService.configuration.user);
				this.triggerConfigurationChange(keys, e.source);
			}
		}
	}

	private onWorkspaceConfigurationChanged(): TPromise<void> {
		if (this.workspace && this.workspace.configuration && this._configuration) {
			const workspaceConfigurationChangeEvent = this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.workspaceConfigurationModel.workspaceConfiguration);
			let configuredFolders = toWorkspaceFolders(this.workspaceConfiguration.workspaceConfigurationModel.folders, URI.file(paths.dirname(this.workspace.configuration.fsPath)));
			const changes = this.compareFolders(this.workspace.folders, configuredFolders);
			if (changes.added.length || changes.removed.length || changes.changed.length) {
				this.workspace.folders = configuredFolders;
				return this.onFoldersChanged()
					.then(foldersConfigurationChangeEvent => {
						this.triggerConfigurationChange(foldersConfigurationChangeEvent.change(workspaceConfigurationChangeEvent), ConfigurationTarget.WORKSPACE_FOLDER);
						this._onDidChangeWorkspaceFolders.fire(changes);
					});
			} else {
				this.triggerConfigurationChange(workspaceConfigurationChangeEvent, ConfigurationTarget.WORKSPACE);
			}
		}
		return TPromise.as(null);
	}

	private onWorkspaceFileChanges(event: FileChangesEvent): TPromise<void> {
		return TPromise.join(this.workspace.folders.map(folder =>
			// handle file event for each folder
			this.cachedFolderConfigs.get(folder.uri).handleWorkspaceFileEvents(event)
				// Update folder configuration if handled
				.then(folderConfiguration => folderConfiguration ? this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration) : new ConfigurationChangeEvent()))
		).then(changeEvents => {
			const consolidateChangeEvent = changeEvents.reduce((consolidated, e) => consolidated.change(e), new ConfigurationChangeEvent());
			this.triggerConfigurationChange(consolidateChangeEvent, ConfigurationTarget.WORKSPACE_FOLDER);
		});
	}

	private onSingleFolderFileChanges(event: FileChangesEvent): TPromise<void> {
		const folder = this.workspace.folders[0];
		return this.cachedFolderConfigs.get(folder.uri).handleWorkspaceFileEvents(event)
			.then(folderConfiguration => {
				if (folderConfiguration) {
					// File change handled
					this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration);
					const workspaceChangedKeys = this._configuration.updateWorkspaceConfiguration(folderConfiguration);
					this.triggerConfigurationChange(workspaceChangedKeys, ConfigurationTarget.WORKSPACE);
				}
			});
	}

	private onWorkspaceFolderConfigurationChanged(folder: IWorkspaceFolder, key?: string): TPromise<void> {
		this.disposeFolderConfiguration(folder);
		return this.loadFolderConfigurations([folder])
			.then(([folderConfiguration]) => {
				const folderChangedKeys = this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration);
				if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
					const workspaceChangedKeys = this._configuration.updateWorkspaceConfiguration(folderConfiguration);
					this.triggerConfigurationChange(workspaceChangedKeys, ConfigurationTarget.WORKSPACE);
				} else {
					this.triggerConfigurationChange(folderChangedKeys, ConfigurationTarget.WORKSPACE_FOLDER);
				}
			});
	}

	private onFoldersChanged(): TPromise<ConfigurationChangeEvent> {
		let changeEvent = new ConfigurationChangeEvent();

		// Remove the configurations of deleted folders
		for (const key of this.cachedFolderConfigs.keys()) {
			if (!this.workspace.folders.filter(folder => folder.uri.toString() === key.toString())[0]) {
				this.cachedFolderConfigs.delete(key);
				changeEvent = changeEvent.change(this._configuration.deleteFolderConfiguration(key));
			}
		}

		const toInitialize = this.workspace.folders.filter(folder => !this.cachedFolderConfigs.has(folder.uri));
		if (toInitialize.length) {
			return this.loadFolderConfigurations(toInitialize)
				.then(folderConfigurations => {
					folderConfigurations.forEach((folderConfiguration, index) => {
						changeEvent = changeEvent.change(this._configuration.updateFolderConfiguration(toInitialize[index].uri, folderConfiguration));
					});
					return changeEvent;
				});
		}
		return TPromise.as(changeEvent);
	}

	private loadFolderConfigurations(folders: IWorkspaceFolder[]): TPromise<FolderConfigurationModel[]> {
		return TPromise.join([...folders.map(folder => {
			const folderConfiguration = new FolderConfiguration(folder.uri, this.workspaceSettingsRootFolder, this.getWorkbenchState() === WorkbenchState.WORKSPACE ? ConfigurationScope.RESOURCE : ConfigurationScope.WINDOW);
			this.cachedFolderConfigs.set(folder.uri, this._register(folderConfiguration));
			return folderConfiguration.loadConfiguration();
		})]);
	}

	private writeConfigurationValue(key: string, value: any, target: ConfigurationTarget, overrides: IConfigurationOverrides): TPromise<void> {
		if (target === ConfigurationTarget.DEFAULT) {
			return TPromise.wrapError(new Error('Invalid configuration target'));
		}

		let currentTargetValue = this.getTargetValue(key, target, overrides);
		if (equals(currentTargetValue, value)) {
			return TPromise.as(null);
		}

		if (target === ConfigurationTarget.MEMORY) {
			this._configuration.updateValue(key, value, overrides);
			this.triggerConfigurationChange(new ConfigurationChangeEvent().change(overrides.overrideIdentifier ? [keyFromOverrideIdentifier(overrides.overrideIdentifier)] : [key], overrides.resource), target);
			return TPromise.as(null);
		}

		return this.configurationEditingService.writeConfiguration(this.toEditableConfigurationTarget(target), { key, value }, { scopes: overrides })
			.then(() => {
				switch (target) {
					case ConfigurationTarget.USER:
						return this.reloadUserConfiguration();
					case ConfigurationTarget.WORKSPACE:
						return this.reloadWorkspaceConfiguration();
					case ConfigurationTarget.WORKSPACE_FOLDER:
						const workspaceFolder = overrides && overrides.resource ? this.workspace.getFolder(overrides.resource) : null;
						if (workspaceFolder) {
							return this.reloadWorkspaceFolderConfiguration(this.workspace.getFolder(overrides.resource), key);
						}
				}
				return null;
			});
	}

	private deriveConfigurationTarget(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): ConfigurationTarget {
		if (target) {
			return target;
		}

		if (value === void 0) {
			// Ignore. But expected is to remove the value from all targets
			return void 0;
		}

		const inspect = this.inspect(key, overrides);
		if (equals(value, inspect.value)) {
			// No change. So ignore.
			return void 0;
		}

		if (inspect.workspaceFolder !== void 0) {
			return ConfigurationTarget.WORKSPACE_FOLDER;
		}

		if (inspect.workspace !== void 0) {
			return ConfigurationTarget.WORKSPACE;
		}

		return ConfigurationTarget.USER;
	}

	private toEditableConfigurationTarget(target: ConfigurationTarget): EditableConfigurationTarget {
		switch (target) {
			case ConfigurationTarget.USER:
				return EditableConfigurationTarget.USER;
			case ConfigurationTarget.WORKSPACE:
				return EditableConfigurationTarget.WORKSPACE;
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return EditableConfigurationTarget.FOLDER;
			default:
				return EditableConfigurationTarget.WORKSPACE;
		}
	}

	private triggerConfigurationChange(configurationEvent: ConfigurationChangeEvent, target: ConfigurationTarget): void {
		if (configurationEvent.affectedKeys.length) {
			configurationEvent.telemetryData(target, this.getTargetConfiguration(target));
			this._onDidUpdateConfiguration.fire(new WorkspaceConfigurationChangeEvent(configurationEvent, this.workspace));
		}
	}

	private getTargetValue(key: string, target: ConfigurationTarget, overrides?: IConfigurationOverrides): any {
		const inspect = this.inspect(key, overrides);
		switch (target) {
			case ConfigurationTarget.DEFAULT:
				return inspect.default;
			case ConfigurationTarget.USER:
				return inspect.user;
			case ConfigurationTarget.WORKSPACE:
				return inspect.workspace;
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return inspect.workspaceFolder;
			case ConfigurationTarget.MEMORY:
				return inspect.memory;
		}
		return void 0;
	}

	private getTargetConfiguration(target: ConfigurationTarget): any {
		switch (target) {
			case ConfigurationTarget.DEFAULT:
				return this._configuration.defaults.contents;
			case ConfigurationTarget.USER:
				return this._configuration.user.contents;
			case ConfigurationTarget.WORKSPACE:
				return this._configuration.workspace.contents;
		}
		return {};
	}

	private pathEquals(path1: string, path2: string): boolean {
		if (!isLinux) {
			path1 = path1.toLowerCase();
			path2 = path2.toLowerCase();
		}

		return path1 === path2;
	}

	private disposeFolderConfiguration(folder: IWorkspaceFolder): void {
		const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
		if (folderConfiguration) {
			folderConfiguration.dispose();
		}
	}
}

class WorkspaceConfiguration extends Disposable {

	private _workspaceConfigPath: URI;
	private _workspaceConfigurationWatcher: ConfigWatcher<WorkspaceConfigurationModel>;
	private _workspaceConfigurationWatcherDisposables: IDisposable[] = [];

	private _onDidUpdateConfiguration: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateConfiguration: Event<void> = this._onDidUpdateConfiguration.event;

	load(workspaceConfigPath: URI): TPromise<void> {
		if (this._workspaceConfigPath && this._workspaceConfigPath.fsPath === workspaceConfigPath.fsPath) {
			return this._reload();
		}

		this._workspaceConfigPath = workspaceConfigPath;

		this._workspaceConfigurationWatcherDisposables = dispose(this._workspaceConfigurationWatcherDisposables);
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
			this._workspaceConfigurationWatcherDisposables.push(this._workspaceConfigurationWatcher);
			this._workspaceConfigurationWatcher.onDidUpdateConfiguration(() => this._onDidUpdateConfiguration.fire(), this, this._workspaceConfigurationWatcherDisposables);
		});
	}

	get workspaceConfigurationModel(): WorkspaceConfigurationModel {
		return this._workspaceConfigurationWatcher ? this._workspaceConfigurationWatcher.getConfig() : new WorkspaceConfigurationModel();
	}

	private _reload(): TPromise<void> {
		return new TPromise<void>(c => this._workspaceConfigurationWatcher.reload(() => c(null)));
	}

	dispose(): void {
		dispose(this._workspaceConfigurationWatcherDisposables);
		super.dispose();
	}
}

class FolderConfiguration extends Disposable {

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

// node.hs helper functions

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

interface IExportedConfigurationNode {
	name: string;
	description: string;
	default: any;
	type: string | string[];
	enum?: any[];
	enumDescriptions?: string[];
}

interface IConfigurationExport {
	settings: IExportedConfigurationNode[];
	buildTime: number;
	commit: string;
	version: number;
}

export class DefaultConfigurationExportHelper {

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IExtensionService private extensionService: IExtensionService,
		@ICommandService private commandService: ICommandService) {
		if (environmentService.args['export-default-configuration']) {
			this.writeConfigModelAndQuit(environmentService.args['export-default-configuration']);
		}
	}

	private writeConfigModelAndQuit(targetPath: string): TPromise<void> {
		return this.extensionService.onReady()
			.then(() => this.writeConfigModel(targetPath))
			.then(() => this.commandService.executeCommand('workbench.action.quit'))
			.then(() => { });
	}

	private writeConfigModel(targetPath: string): TPromise<void> {
		const config = this.getConfigModel();

		const resultString = JSON.stringify(config, undefined, '  ');
		return writeFile(targetPath, resultString);
	}

	private getConfigModel(): IConfigurationExport {
		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations().slice();
		const settings: IExportedConfigurationNode[] = [];
		const processConfig = (config: IConfigurationNode) => {
			if (config.properties) {
				for (let name in config.properties) {
					const prop = config.properties[name];
					const propDetails: IExportedConfigurationNode = {
						name,
						description: prop.description,
						default: prop.default,
						type: prop.type
					};

					if (prop.enum) {
						propDetails.enum = prop.enum;
					}

					if (prop.enumDescriptions) {
						propDetails.enumDescriptions = prop.enumDescriptions;
					}

					settings.push(propDetails);
				}
			}

			if (config.allOf) {
				config.allOf.forEach(processConfig);
			}
		};

		configurations.forEach(processConfig);

		const result: IConfigurationExport = {
			settings: settings.sort((a, b) => a.name.localeCompare(b.name)),
			buildTime: Date.now(),
			commit: product.commit,
			version: versionStringToNumber(pkg.version)
		};

		return result;
	}
}

function versionStringToNumber(versionStr: string): number {
	const semverRegex = /(\d+)\.(\d+)\.(\d+)/;
	const match = versionStr.match(semverRegex);
	if (!match) {
		return 0;
	}

	return parseInt(match[1], 10) * 10000 + parseInt(match[2], 10) * 100 + parseInt(match[3], 10);
}