/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { dirname } from 'path';
import * as assert from 'vs/base/common/assert';
import { Event, Emitter } from 'vs/base/common/event';
import { ResourceMap } from 'vs/base/common/map';
import { equals, deepClone } from 'vs/base/common/objects';
import { Disposable } from 'vs/base/common/lifecycle';
import { Queue } from 'vs/base/common/async';
import { writeFile } from 'vs/base/node/pfs';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IWorkspaceContextService, Workspace, WorkbenchState, IWorkspaceFolder, toWorkspaceFolders, IWorkspaceFoldersChangeEvent, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { isLinux } from 'vs/base/common/platform';
import { IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ConfigurationChangeEvent, ConfigurationModel, DefaultConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { IConfigurationChangeEvent, ConfigurationTarget, IConfigurationOverrides, keyFromOverrideIdentifier, isConfigurationOverrides, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { Configuration, WorkspaceConfigurationChangeEvent, AllKeysConfigurationChangeEvent } from 'vs/workbench/services/configuration/common/configurationModels';
import { IWorkspaceConfigurationService, FOLDER_CONFIG_FOLDER_NAME, defaultSettingsSchemaId, userSettingsSchemaId, workspaceSettingsSchemaId, folderSettingsSchemaId } from 'vs/workbench/services/configuration/common/configuration';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationNode, IConfigurationRegistry, Extensions, IConfigurationPropertySchema, allSettings, windowSettings, resourceSettings, applicationSettings } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkspaceIdentifier, isWorkspaceIdentifier, IStoredWorkspaceFolder, isStoredWorkspaceFolder, IWorkspaceFolderCreationData, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceInitializationPayload, isSingleFolderWorkspaceInitializationPayload, ISingleFolderWorkspaceInitializationPayload, IEmptyWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import product from 'vs/platform/node/product';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ConfigurationEditingService } from 'vs/workbench/services/configuration/node/configurationEditingService';
import { WorkspaceConfiguration, FolderConfiguration } from 'vs/workbench/services/configuration/node/configuration';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { Schemas } from 'vs/base/common/network';
import { massageFolderPathForWorkspace } from 'vs/platform/workspaces/node/workspaces';
import { UserConfiguration } from 'vs/platform/configuration/node/configuration';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { localize } from 'vs/nls';
import { isEqual } from 'vs/base/common/resources';
import { mark } from 'vs/base/common/performance';

export class WorkspaceService extends Disposable implements IWorkspaceConfigurationService, IWorkspaceContextService {

	public _serviceBrand: any;

	private workspace: Workspace;
	private _configuration: Configuration;
	private defaultConfiguration: DefaultConfigurationModel;
	private userConfiguration: UserConfiguration;
	private workspaceConfiguration: WorkspaceConfiguration;
	private cachedFolderConfigs: ResourceMap<FolderConfiguration>;

	private workspaceEditingQueue: Queue<void>;

	protected readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	public readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	protected readonly _onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent> = this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	public readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = this._onDidChangeWorkspaceFolders.event;

	protected readonly _onDidChangeWorkspaceName: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceName: Event<void> = this._onDidChangeWorkspaceName.event;

	protected readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState> = this._register(new Emitter<WorkbenchState>());
	public readonly onDidChangeWorkbenchState: Event<WorkbenchState> = this._onDidChangeWorkbenchState.event;

	private fileService: IFileService;
	private configurationEditingService: ConfigurationEditingService;
	private jsonEditingService: JSONEditingService;

	constructor(private environmentService: IEnvironmentService, private workspaceSettingsRootFolder: string = FOLDER_CONFIG_FOLDER_NAME) {
		super();

		this.defaultConfiguration = new DefaultConfigurationModel();
		this.userConfiguration = this._register(new UserConfiguration(environmentService.appSettingsPath));
		this.workspaceConfiguration = this._register(new WorkspaceConfiguration());
		this._register(this.userConfiguration.onDidChangeConfiguration(userConfiguration => this.onUserConfigurationChanged(userConfiguration)));
		this._register(this.workspaceConfiguration.onDidUpdateConfiguration(() => this.onWorkspaceConfigurationChanged()));

		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidSchemaChange(e => this.registerConfigurationSchemas()));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(configurationProperties => this.onDefaultConfigurationChanged(configurationProperties)));

		this.workspaceEditingQueue = new Queue<void>();
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

	public addFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number): Promise<void> {
		return this.updateFolders(foldersToAdd, [], index);
	}

	public removeFolders(foldersToRemove: URI[]): Promise<void> {
		return this.updateFolders([], foldersToRemove);
	}

	public updateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
		assert.ok(this.jsonEditingService, 'Workbench is not initialized yet');
		return Promise.resolve(this.workspaceEditingQueue.queue(() => this.doUpdateFolders(foldersToAdd, foldersToRemove, index)));
	}

	public isInsideWorkspace(resource: URI): boolean {
		return !!this.getWorkspaceFolder(resource);
	}

	public isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean {
		switch (this.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && isEqual(workspaceIdentifier, this.workspace.folders[0].uri);
			case WorkbenchState.WORKSPACE:
				return isWorkspaceIdentifier(workspaceIdentifier) && this.workspace.id === workspaceIdentifier.id;
		}
		return false;
	}

	private doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
		if (this.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
			return Promise.resolve(undefined); // we need a workspace to begin with
		}

		if (foldersToAdd.length + foldersToRemove.length === 0) {
			return Promise.resolve(undefined); // nothing to do
		}

		let foldersHaveChanged = false;

		// Remove first (if any)
		let currentWorkspaceFolders = this.getWorkspace().folders;
		let newStoredFolders: IStoredWorkspaceFolder[] = currentWorkspaceFolders.map(f => f.raw).filter((folder, index) => {
			if (!isStoredWorkspaceFolder(folder)) {
				return true; // keep entries which are unrelated
			}

			return !this.contains(foldersToRemove, currentWorkspaceFolders[index].uri); // keep entries which are unrelated
		});

		foldersHaveChanged = currentWorkspaceFolders.length !== newStoredFolders.length;

		// Add afterwards (if any)
		if (foldersToAdd.length) {

			// Recompute current workspace folders if we have folders to add
			const workspaceConfigFolder = dirname(this.getWorkspace().configuration.fsPath);
			currentWorkspaceFolders = toWorkspaceFolders(newStoredFolders, URI.file(workspaceConfigFolder));
			const currentWorkspaceFolderUris = currentWorkspaceFolders.map(folder => folder.uri);

			const storedFoldersToAdd: IStoredWorkspaceFolder[] = [];

			foldersToAdd.forEach(folderToAdd => {
				if (this.contains(currentWorkspaceFolderUris, folderToAdd.uri)) {
					return; // already existing
				}

				let storedFolder: IStoredWorkspaceFolder;

				// File resource: use "path" property
				if (folderToAdd.uri.scheme === Schemas.file) {
					storedFolder = {
						path: massageFolderPathForWorkspace(folderToAdd.uri.fsPath, workspaceConfigFolder, newStoredFolders)
					};
				}

				// Any other resource: use "uri" property
				else {
					storedFolder = {
						uri: folderToAdd.uri.toString(true)
					};
				}

				if (folderToAdd.name) {
					storedFolder.name = folderToAdd.name;
				}

				storedFoldersToAdd.push(storedFolder);
			});

			// Apply to array of newStoredFolders
			if (storedFoldersToAdd.length > 0) {
				foldersHaveChanged = true;

				if (typeof index === 'number' && index >= 0 && index < newStoredFolders.length) {
					newStoredFolders = newStoredFolders.slice(0);
					newStoredFolders.splice(index, 0, ...storedFoldersToAdd);
				} else {
					newStoredFolders = [...newStoredFolders, ...storedFoldersToAdd];
				}
			}
		}

		// Set folders if we recorded a change
		if (foldersHaveChanged) {
			return this.setFolders(newStoredFolders);
		}

		return Promise.resolve(undefined);
	}

	private setFolders(folders: IStoredWorkspaceFolder[]): Promise<void> {
		return this.workspaceConfiguration.setFolders(folders, this.jsonEditingService)
			.then(() => this.onWorkspaceConfigurationChanged());
	}

	private contains(resources: URI[], toCheck: URI): boolean {
		return resources.some(resource => {
			if (isLinux) {
				return resource.toString() === toCheck.toString();
			}

			return resource.toString().toLowerCase() === toCheck.toString().toLowerCase();
		});
	}

	// Workspace Configuration Service Impl

	getConfigurationData(): IConfigurationData {
		const configurationData = this._configuration.toData();
		configurationData.isComplete = this.cachedFolderConfigs.values().every(c => c.loaded);
		return configurationData;
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
		return this._configuration.getValue(section, overrides);
	}

	updateValue(key: string, value: any): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): Promise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget, donotNotifyError: boolean): Promise<void>;
	updateValue(key: string, value: any, arg3?: any, arg4?: any, donotNotifyError?: any): Promise<void> {
		assert.ok(this.configurationEditingService, 'Workbench is not initialized yet');
		const overrides = isConfigurationOverrides(arg3) ? arg3 : undefined;
		const target = this.deriveConfigurationTarget(key, value, overrides, overrides ? arg4 : arg3);
		return target ? this.writeConfigurationValue(key, value, target, overrides, donotNotifyError)
			: Promise.resolve(null);
	}

	reloadConfiguration(folder?: IWorkspaceFolder, key?: string): Promise<void> {
		if (folder) {
			return this.reloadWorkspaceFolderConfiguration(folder, key);
		}
		return this.reloadUserConfiguration()
			.then(userConfigurationModel => this.reloadWorkspaceConfiguration()
				.then(() => this.loadConfiguration(userConfigurationModel)));
	}

	inspect<T>(key: string, overrides?: IConfigurationOverrides): {
		default: T,
		user: T,
		workspace?: T,
		workspaceFolder?: T,
		memory?: T,
		value: T
	} {
		return this._configuration.inspect<T>(key, overrides);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this._configuration.keys();
	}

	initialize(arg: IWorkspaceInitializationPayload, postInitialisationTask: () => void = () => null): Promise<any> {
		mark('willInitWorkspaceService');
		return this.createWorkspace(arg)
			.then(workspace => this.updateWorkspaceAndInitializeConfiguration(workspace, postInitialisationTask)).then(() => {
				mark('didInitWorkspaceService');
			});
	}

	acquireFileService(fileService: IFileService): void {
		this.fileService = fileService;
		const changedWorkspaceFolders: IWorkspaceFolder[] = [];
		Promise.all(this.cachedFolderConfigs.values()
			.map(folderConfiguration => folderConfiguration.adopt(fileService)
				.then(result => {
					if (result) {
						changedWorkspaceFolders.push(folderConfiguration.workspaceFolder);
					}
				})))
			.then(() => {
				for (const workspaceFolder of changedWorkspaceFolders) {
					this.onWorkspaceFolderConfigurationChanged(workspaceFolder);
				}
			});
	}

	acquireInstantiationService(instantiationService: IInstantiationService): void {
		this.configurationEditingService = instantiationService.createInstance(ConfigurationEditingService);
		this.jsonEditingService = instantiationService.createInstance(JSONEditingService);
	}

	private createWorkspace(arg: IWorkspaceInitializationPayload): Promise<Workspace> {
		if (isWorkspaceIdentifier(arg)) {
			return this.createMultiFolderWorkspace(arg);
		}

		if (isSingleFolderWorkspaceInitializationPayload(arg)) {
			return this.createSingleFolderWorkspace(arg);
		}

		return this.createEmptyWorkspace(arg);
	}

	private createMultiFolderWorkspace(workspaceIdentifier: IWorkspaceIdentifier): Promise<Workspace> {
		const workspaceConfigPath = URI.file(workspaceIdentifier.configPath);
		return this.workspaceConfiguration.load(workspaceConfigPath)
			.then(() => {
				const workspaceFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), URI.file(dirname(workspaceConfigPath.fsPath)));
				const workspaceId = workspaceIdentifier.id;
				return new Workspace(workspaceId, workspaceFolders, workspaceConfigPath);
			});
	}

	private createSingleFolderWorkspace(singleFolder: ISingleFolderWorkspaceInitializationPayload): Promise<Workspace> {
		const folder = singleFolder.folder;

		let configuredFolders: IStoredWorkspaceFolder[];
		if (folder.scheme === 'file') {
			configuredFolders = [{ path: folder.fsPath }];
		} else {
			configuredFolders = [{ uri: folder.toString() }];
		}

		return Promise.resolve(new Workspace(singleFolder.id, toWorkspaceFolders(configuredFolders)));
	}

	private createEmptyWorkspace(emptyWorkspace: IEmptyWorkspaceInitializationPayload): Promise<Workspace> {
		return Promise.resolve(new Workspace(emptyWorkspace.id));
	}

	private updateWorkspaceAndInitializeConfiguration(workspace: Workspace, postInitialisationTask: () => void): Promise<void> {
		const hasWorkspaceBefore = !!this.workspace;
		let previousState: WorkbenchState;
		let previousWorkspacePath: string;
		let previousFolders: WorkspaceFolder[];

		if (hasWorkspaceBefore) {
			previousState = this.getWorkbenchState();
			previousWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : undefined;
			previousFolders = this.workspace.folders;
			this.workspace.update(workspace);
		} else {
			this.workspace = workspace;
		}

		return this.initializeConfiguration().then(() => {

			postInitialisationTask(); // Post initialisation task should be run before triggering events.

			// Trigger changes after configuration initialization so that configuration is up to date.
			if (hasWorkspaceBefore) {
				const newState = this.getWorkbenchState();
				if (previousState && newState !== previousState) {
					this._onDidChangeWorkbenchState.fire(newState);
				}

				const newWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : undefined;
				if (previousWorkspacePath && newWorkspacePath !== previousWorkspacePath || newState !== previousState) {
					this._onDidChangeWorkspaceName.fire();
				}

				const folderChanges = this.compareFolders(previousFolders, this.workspace.folders);
				if (folderChanges && (folderChanges.added.length || folderChanges.removed.length || folderChanges.changed.length)) {
					this._onDidChangeWorkspaceFolders.fire(folderChanges);
				}
			}
		});
	}

	private compareFolders(currentFolders: IWorkspaceFolder[], newFolders: IWorkspaceFolder[]): IWorkspaceFoldersChangeEvent {
		const result = { added: [], removed: [], changed: [] } as IWorkspaceFoldersChangeEvent;
		result.added = newFolders.filter(newFolder => !currentFolders.some(currentFolder => newFolder.uri.toString() === currentFolder.uri.toString()));
		for (let currentIndex = 0; currentIndex < currentFolders.length; currentIndex++) {
			let currentFolder = currentFolders[currentIndex];
			let newIndex = 0;
			for (newIndex = 0; newIndex < newFolders.length && currentFolder.uri.toString() !== newFolders[newIndex].uri.toString(); newIndex++) { }
			if (newIndex < newFolders.length) {
				if (currentIndex !== newIndex || currentFolder.name !== newFolders[newIndex].name) {
					result.changed.push(currentFolder);
				}
			} else {
				result.removed.push(currentFolder);
			}
		}
		return result;
	}

	private initializeConfiguration(): Promise<void> {
		this.registerConfigurationSchemas();
		return this.userConfiguration.initialize()
			.then(userConfigurationModel => this.loadConfiguration(userConfigurationModel));
	}

	private reloadUserConfiguration(key?: string): Promise<ConfigurationModel> {
		return this.userConfiguration.reload();
	}

	private reloadWorkspaceConfiguration(key?: string): Promise<void> {
		const workbenchState = this.getWorkbenchState();
		if (workbenchState === WorkbenchState.FOLDER) {
			return this.onWorkspaceFolderConfigurationChanged(this.workspace.folders[0], key);
		}
		if (workbenchState === WorkbenchState.WORKSPACE) {
			return this.workspaceConfiguration.reload().then(() => this.onWorkspaceConfigurationChanged());
		}
		return Promise.resolve(undefined);
	}

	private reloadWorkspaceFolderConfiguration(folder: IWorkspaceFolder, key?: string): Promise<void> {
		return this.onWorkspaceFolderConfigurationChanged(folder, key);
	}

	private loadConfiguration(userConfigurationModel: ConfigurationModel): Promise<void> {
		// reset caches
		this.cachedFolderConfigs = new ResourceMap<FolderConfiguration>();

		const folders = this.workspace.folders;
		return this.loadFolderConfigurations(folders)
			.then((folderConfigurations) => {

				let workspaceConfiguration = this.getWorkspaceConfigurationModel(folderConfigurations);
				const folderConfigurationModels = new ResourceMap<ConfigurationModel>();
				folderConfigurations.forEach((folderConfiguration, index) => folderConfigurationModels.set(folders[index].uri, folderConfiguration));

				const currentConfiguration = this._configuration;
				this._configuration = new Configuration(this.defaultConfiguration, userConfigurationModel, workspaceConfiguration, folderConfigurationModels, new ConfigurationModel(), new ResourceMap<ConfigurationModel>(), this.getWorkbenchState() !== WorkbenchState.EMPTY ? this.workspace : null); //TODO: Sandy Avoid passing null

				if (currentConfiguration) {
					const changedKeys = this._configuration.compare(currentConfiguration);
					this.triggerConfigurationChange(new ConfigurationChangeEvent().change(changedKeys), ConfigurationTarget.WORKSPACE);
				} else {
					this._onDidChangeConfiguration.fire(new AllKeysConfigurationChangeEvent(this._configuration, ConfigurationTarget.WORKSPACE, this.getTargetConfiguration(ConfigurationTarget.WORKSPACE)));
				}
			});
	}

	private getWorkspaceConfigurationModel(folderConfigurations: ConfigurationModel[]): ConfigurationModel {
		switch (this.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return folderConfigurations[0];
			case WorkbenchState.WORKSPACE:
				return this.workspaceConfiguration.getConfiguration();
			default:
				return new ConfigurationModel();
		}
	}

	private onDefaultConfigurationChanged(keys: string[]): void {
		this.defaultConfiguration = new DefaultConfigurationModel();
		this.registerConfigurationSchemas();
		if (this.workspace && this._configuration) {
			this._configuration.updateDefaultConfiguration(this.defaultConfiguration);
			if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
				this._configuration.updateWorkspaceConfiguration(this.cachedFolderConfigs.get(this.workspace.folders[0].uri).reprocess());
			} else {
				this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.reprocessWorkspaceSettings());
				this.workspace.folders.forEach(folder => this._configuration.updateFolderConfiguration(folder.uri, this.cachedFolderConfigs.get(folder.uri).reprocess()));
			}
			this.triggerConfigurationChange(new ConfigurationChangeEvent().change(keys), ConfigurationTarget.DEFAULT);
		}
	}

	private registerConfigurationSchemas(): void {
		if (this.workspace) {
			const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
			const convertToNotSuggestedProperties = (properties: IJSONSchemaMap, errorMessage: string): IJSONSchemaMap => {
				return Object.keys(properties).reduce((result: IJSONSchemaMap, property) => {
					result[property] = deepClone(properties[property]);
					result[property].deprecationMessage = errorMessage;
					return result;
				}, {});
			};

			const allSettingsSchema: IJSONSchema = { properties: allSettings.properties, patternProperties: allSettings.patternProperties, additionalProperties: false, errorMessage: 'Unknown configuration setting' };
			const unsupportedApplicationSettings = convertToNotSuggestedProperties(applicationSettings.properties, localize('unsupportedApplicationSetting', "This setting can be applied only in User Settings"));
			const workspaceSettingsSchema: IJSONSchema = { properties: { ...unsupportedApplicationSettings, ...windowSettings.properties, ...resourceSettings.properties }, patternProperties: allSettings.patternProperties, additionalProperties: false, errorMessage: 'Unknown configuration setting' };

			jsonRegistry.registerSchema(defaultSettingsSchemaId, allSettingsSchema);
			jsonRegistry.registerSchema(userSettingsSchemaId, allSettingsSchema);

			if (WorkbenchState.WORKSPACE === this.getWorkbenchState()) {
				const unsupportedWindowSettings = convertToNotSuggestedProperties(windowSettings.properties, localize('unsupportedWindowSetting', "This setting cannot be applied now. It will be applied when you open this folder directly."));
				const folderSettingsSchema: IJSONSchema = { properties: { ...unsupportedApplicationSettings, ...unsupportedWindowSettings, ...resourceSettings.properties }, patternProperties: allSettings.patternProperties, additionalProperties: false, errorMessage: 'Unknown configuration setting' };
				jsonRegistry.registerSchema(workspaceSettingsSchemaId, workspaceSettingsSchema);
				jsonRegistry.registerSchema(folderSettingsSchemaId, folderSettingsSchema);
			} else {
				jsonRegistry.registerSchema(workspaceSettingsSchemaId, workspaceSettingsSchema);
				jsonRegistry.registerSchema(folderSettingsSchemaId, workspaceSettingsSchema);
			}
		}
	}

	private onUserConfigurationChanged(userConfiguration: ConfigurationModel): void {
		const keys = this._configuration.compareAndUpdateUserConfiguration(userConfiguration);
		this.triggerConfigurationChange(keys, ConfigurationTarget.USER);
	}

	private onWorkspaceConfigurationChanged(): Promise<void> {
		if (this.workspace && this.workspace.configuration && this._configuration) {
			const workspaceConfigurationChangeEvent = this._configuration.compareAndUpdateWorkspaceConfiguration(this.workspaceConfiguration.getConfiguration());
			let configuredFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), URI.file(dirname(this.workspace.configuration.fsPath)));
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
		return Promise.resolve(undefined);
	}

	private onWorkspaceFolderConfigurationChanged(folder: IWorkspaceFolder, key?: string): Promise<void> {
		return this.loadFolderConfigurations([folder])
			.then(([folderConfiguration]) => {
				const folderChangedKeys = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderConfiguration);
				if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
					const workspaceChangedKeys = this._configuration.compareAndUpdateWorkspaceConfiguration(folderConfiguration);
					this.triggerConfigurationChange(workspaceChangedKeys, ConfigurationTarget.WORKSPACE);
				} else {
					this.triggerConfigurationChange(folderChangedKeys, ConfigurationTarget.WORKSPACE_FOLDER);
				}
			});
	}

	private onFoldersChanged(): Promise<ConfigurationChangeEvent> {
		let changeEvent = new ConfigurationChangeEvent();

		// Remove the configurations of deleted folders
		for (const key of this.cachedFolderConfigs.keys()) {
			if (!this.workspace.folders.filter(folder => folder.uri.toString() === key.toString())[0]) {
				const folderConfiguration = this.cachedFolderConfigs.get(key);
				folderConfiguration.dispose();
				this.cachedFolderConfigs.delete(key);
				changeEvent = changeEvent.change(this._configuration.compareAndDeleteFolderConfiguration(key));
			}
		}

		const toInitialize = this.workspace.folders.filter(folder => !this.cachedFolderConfigs.has(folder.uri));
		if (toInitialize.length) {
			return this.loadFolderConfigurations(toInitialize)
				.then(folderConfigurations => {
					folderConfigurations.forEach((folderConfiguration, index) => {
						changeEvent = changeEvent.change(this._configuration.compareAndUpdateFolderConfiguration(toInitialize[index].uri, folderConfiguration));
					});
					return changeEvent;
				});
		}
		return Promise.resolve(changeEvent);
	}

	private loadFolderConfigurations(folders: IWorkspaceFolder[]): Promise<ConfigurationModel[]> {
		return Promise.all([...folders.map(folder => {
			let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
			if (!folderConfiguration) {
				folderConfiguration = new FolderConfiguration(folder, this.workspaceSettingsRootFolder, this.getWorkbenchState(), this.environmentService, this.fileService);
				this._register(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
				this.cachedFolderConfigs.set(folder.uri, this._register(folderConfiguration));
			}
			return folderConfiguration.loadConfiguration();
		})]);
	}

	private writeConfigurationValue(key: string, value: any, target: ConfigurationTarget, overrides: IConfigurationOverrides, donotNotifyError: boolean): Promise<void> {
		if (target === ConfigurationTarget.DEFAULT) {
			return Promise.reject(new Error('Invalid configuration target'));
		}

		if (target === ConfigurationTarget.MEMORY) {
			this._configuration.updateValue(key, value, overrides);
			this.triggerConfigurationChange(new ConfigurationChangeEvent().change(overrides.overrideIdentifier ? [keyFromOverrideIdentifier(overrides.overrideIdentifier)] : [key], overrides.resource), target);
			return Promise.resolve(undefined);
		}

		return this.configurationEditingService.writeConfiguration(target, { key, value }, { scopes: overrides, donotNotifyError })
			.then(() => {
				switch (target) {
					case ConfigurationTarget.USER:
						return this.reloadUserConfiguration();
					case ConfigurationTarget.WORKSPACE:
						return this.reloadWorkspaceConfiguration();
					case ConfigurationTarget.WORKSPACE_FOLDER:
						const workspaceFolder = overrides && overrides.resource ? this.workspace.getFolder(overrides.resource) : null;
						if (workspaceFolder) {
							return this.reloadWorkspaceFolderConfiguration(this.workspace.getFolder(overrides.resource), key).then(() => null);
						}
				}
				return null;
			});
	}

	private deriveConfigurationTarget(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): ConfigurationTarget {
		if (target) {
			return target;
		}

		if (value === undefined) {
			// Ignore. But expected is to remove the value from all targets
			return undefined;
		}

		const inspect = this.inspect(key, overrides);
		if (equals(value, inspect.value)) {
			// No change. So ignore.
			return undefined;
		}

		if (inspect.workspaceFolder !== undefined) {
			return ConfigurationTarget.WORKSPACE_FOLDER;
		}

		if (inspect.workspace !== undefined) {
			return ConfigurationTarget.WORKSPACE;
		}

		return ConfigurationTarget.USER;
	}

	private triggerConfigurationChange(configurationEvent: ConfigurationChangeEvent, target: ConfigurationTarget): void {
		if (configurationEvent.affectedKeys.length) {
			configurationEvent.telemetryData(target, this.getTargetConfiguration(target));
			this._onDidChangeConfiguration.fire(new WorkspaceConfigurationChangeEvent(configurationEvent, this.workspace));
		}
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
	buildNumber: number;
}

export class DefaultConfigurationExportHelper {

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ICommandService private readonly commandService: ICommandService) {
		if (environmentService.args['export-default-configuration']) {
			this.writeConfigModelAndQuit(environmentService.args['export-default-configuration']);
		}
	}

	private writeConfigModelAndQuit(targetPath: string): Promise<void> {
		return Promise.resolve(this.extensionService.whenInstalledExtensionsRegistered())
			.then(() => this.writeConfigModel(targetPath))
			.then(() => this.commandService.executeCommand('workbench.action.quit'))
			.then(() => { });
	}

	private writeConfigModel(targetPath: string): Promise<void> {
		const config = this.getConfigModel();

		const resultString = JSON.stringify(config, undefined, '  ');
		return writeFile(targetPath, resultString);
	}

	private getConfigModel(): IConfigurationExport {
		const configRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const configurations = configRegistry.getConfigurations().slice();
		const settings: IExportedConfigurationNode[] = [];

		const processProperty = (name: string, prop: IConfigurationPropertySchema) => {
			const propDetails: IExportedConfigurationNode = {
				name,
				description: prop.description || prop.markdownDescription || '',
				default: prop.default,
				type: prop.type
			};

			if (prop.enum) {
				propDetails.enum = prop.enum;
			}

			if (prop.enumDescriptions || prop.markdownEnumDescriptions) {
				propDetails.enumDescriptions = prop.enumDescriptions || prop.markdownEnumDescriptions;
			}

			settings.push(propDetails);
		};

		const processConfig = (config: IConfigurationNode) => {
			if (config.properties) {
				for (let name in config.properties) {
					processProperty(name, config.properties[name]);
				}
			}

			if (config.allOf) {
				config.allOf.forEach(processConfig);
			}
		};

		configurations.forEach(processConfig);

		const excludedProps = configRegistry.getExcludedConfigurationProperties();
		for (let name in excludedProps) {
			processProperty(name, excludedProps[name]);
		}

		const result: IConfigurationExport = {
			settings: settings.sort((a, b) => a.name.localeCompare(b.name)),
			buildTime: Date.now(),
			commit: product.commit,
			buildNumber: product.settingsSearchBuildId
		};

		return result;
	}
}
