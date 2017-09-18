/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { StrictResourceMap } from 'vs/base/common/map';
import { equals } from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import * as errors from 'vs/base/common/errors';
import * as collections from 'vs/base/common/collections';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { readFile, stat } from 'vs/base/node/pfs';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import * as extfs from 'vs/base/node/extfs';
import { IWorkspaceContextService, IWorkspace, Workspace, WorkbenchState, WorkspaceFolder, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { ConfigWatcher } from 'vs/base/node/config';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CustomConfigurationModel } from 'vs/platform/configuration/common/model';
import { WorkspaceConfigurationModel, ScopedConfigurationModel, FolderConfigurationModel, FolderSettingsModel } from 'vs/workbench/services/configuration/common/configurationModels';
import { IConfigurationServiceEvent, ConfigurationSource, IConfigurationKeys, IConfigurationValue, ConfigurationModel, IConfigurationOverrides, Configuration as BaseConfiguration, IConfigurationValues, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceConfigurationService, WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME, WORKSPACE_STANDALONE_CONFIGURATIONS, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';
import { ConfigurationService as GlobalConfigurationService } from 'vs/platform/configuration/node/configurationService';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { IConfigurationNode, IConfigurationRegistry, Extensions, editorConfigurationSchemaId, IDefaultConfigurationExtension, validateProperty, ConfigurationScope, schemaId } from 'vs/platform/configuration/common/configurationRegistry';
import { createHash } from 'crypto';
import { getWorkspaceLabel, IWorkspacesService, IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

interface IStat {
	resource: URI;
	isDirectory?: boolean;
	children?: { resource: URI; }[];
}

interface IContent {
	resource: URI;
	value: string;
}

interface IWorkspaceConfiguration<T> {
	workspace: T;
	consolidated: any;
}

type IWorkspaceFoldersConfiguration = { [rootFolder: string]: { folders: string[]; } };

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

const configurationEntrySchema: IJSONSchema = {
	type: 'object',
	defaultSnippets: [{ body: { title: '', properties: {} } }],
	properties: {
		title: {
			description: nls.localize('vscode.extension.contributes.configuration.title', 'A summary of the settings. This label will be used in the settings file as separating comment.'),
			type: 'string'
		},
		properties: {
			description: nls.localize('vscode.extension.contributes.configuration.properties', 'Description of the configuration properties.'),
			type: 'object',
			additionalProperties: {
				anyOf: [
					{ $ref: 'http://json-schema.org/draft-04/schema#' },
					{
						type: 'object',
						properties: {
							isExecutable: {
								type: 'boolean'
							},
							scope: {
								type: 'string',
								enum: ['window', 'resource'],
								default: 'window',
								enumDescriptions: [
									nls.localize('scope.window.description', "Window specific configuration, which can be configured in the User or Workspace settings."),
									nls.localize('scope.resource.description', "Resource specific configuration, which can be configured in the User, Workspace or Folder settings.")
								],
								description: nls.localize('scope.description', "Scope in which the configuration is applicable. Available scopes are `window` and `resource`.")
							}
						}
					}
				]
			}
		}
	}
};


// BEGIN VSCode extension point `configuration`
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IConfigurationNode>('configuration', [], {
	description: nls.localize('vscode.extension.contributes.configuration', 'Contributes configuration settings.'),
	oneOf: [
		configurationEntrySchema,
		{
			type: 'array',
			items: configurationEntrySchema
		}
	]
});
configurationExtPoint.setHandler(extensions => {
	const configurations: IConfigurationNode[] = [];

	function handleConfiguration(node: IConfigurationNode, id: string, collector: ExtensionMessageCollector) {
		let configuration = objects.clone(node);

		if (configuration.title && (typeof configuration.title !== 'string')) {
			collector.error(nls.localize('invalid.title', "'configuration.title' must be a string"));
		}

		validateProperties(configuration, collector);

		configuration.id = id;
		configurations.push(configuration);
	};

	for (let extension of extensions) {
		const collector = extension.collector;
		const value = <IConfigurationNode | IConfigurationNode[]>extension.value;
		const id = extension.description.id;
		if (!Array.isArray(value)) {
			handleConfiguration(value, id, collector);
		} else {
			value.forEach(v => handleConfiguration(v, id, collector));
		}
	}
	configurationRegistry.registerConfigurations(configurations, false);
});
// END VSCode extension point `configuration`

// BEGIN VSCode extension point `configurationDefaults`
const defaultConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IConfigurationNode>('configurationDefaults', [], {
	description: nls.localize('vscode.extension.contributes.defaultConfiguration', 'Contributes default editor configuration settings by language.'),
	type: 'object',
	defaultSnippets: [{ body: {} }],
	patternProperties: {
		'\\[.*\\]$': {
			type: 'object',
			default: {},
			$ref: editorConfigurationSchemaId,
		}
	}
});
defaultConfigurationExtPoint.setHandler(extensions => {
	const defaultConfigurations: IDefaultConfigurationExtension[] = extensions.map(extension => {
		const id = extension.description.id;
		const name = extension.description.name;
		const defaults = objects.clone(extension.value);
		return <IDefaultConfigurationExtension>{
			id, name, defaults
		};
	});
	configurationRegistry.registerDefaultConfigurations(defaultConfigurations);
});
// END VSCode extension point `configurationDefaults`

function validateProperties(configuration: IConfigurationNode, collector: ExtensionMessageCollector): void {
	let properties = configuration.properties;
	if (properties) {
		if (typeof properties !== 'object') {
			collector.error(nls.localize('invalid.properties', "'configuration.properties' must be an object"));
			configuration.properties = {};
		}
		for (let key in properties) {
			const message = validateProperty(key);
			const propertyConfiguration = configuration.properties[key];
			propertyConfiguration.scope = propertyConfiguration.scope && propertyConfiguration.scope.toString() === 'resource' ? ConfigurationScope.RESOURCE : ConfigurationScope.WINDOW;
			if (message) {
				collector.warn(message);
				delete properties[key];
			}
		}
	}
	let subNodes = configuration.allOf;
	if (subNodes) {
		collector.error(nls.localize('invalid.allOf', "'configuration.allOf' is deprecated and should no longer be used. Instead, pass multiple configuration sections as an array to the 'configuration' contribution point."));
		for (let node of subNodes) {
			validateProperties(node, collector);
		}
	}
}

export class WorkspaceServiceImpl extends Disposable implements IWorkspaceConfigurationService, IWorkspaceContextService {

	public _serviceBrand: any;

	private workspace: Workspace;
	private _configuration: Configuration<any>;
	private baseConfigurationService: GlobalConfigurationService<any>;
	private workspaceConfiguration: WorkspaceConfiguration;
	private cachedFolderConfigs: StrictResourceMap<FolderConfiguration<any>>;

	protected readonly _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	protected readonly _onDidChangeWorkspaceFolders: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceFolders: Event<void> = this._onDidChangeWorkspaceFolders.event;

	protected readonly _onDidChangeWorkspaceName: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceName: Event<void> = this._onDidChangeWorkspaceName.event;

	protected readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState> = this._register(new Emitter<WorkbenchState>());
	public readonly onDidChangeWorkbenchState: Event<WorkbenchState> = this._onDidChangeWorkbenchState.event;

	constructor(private environmentService: IEnvironmentService, private workspacesService: IWorkspacesService, private workspaceSettingsRootFolder: string = WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME) {
		super();

		this.workspaceConfiguration = this._register(new WorkspaceConfiguration());
		this._register(this.workspaceConfiguration.onDidUpdateConfiguration(() => this.onWorkspaceConfigurationChanged()));

		this.baseConfigurationService = this._register(new GlobalConfigurationService(environmentService));
		this._register(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));
	}

	public getWorkspace(): IWorkspace {
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

	public getWorkspaceFolder(resource: URI): WorkspaceFolder {
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

	public toResource(workspaceRelativePath: string, workspaceFolder: WorkspaceFolder): URI {
		return URI.file(paths.join(workspaceFolder.uri.fsPath, workspaceRelativePath));
	}

	public getConfigurationData<T>(): IConfigurationData<T> {
		return this._configuration.toData();
	}

	public getConfiguration<C>(section?: string, overrides?: IConfigurationOverrides): C {
		return this._configuration.getValue<C>(section, overrides);
	}

	public lookup<C>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<C> {
		return this._configuration.lookup<C>(key, overrides);
	}

	public keys(overrides?: IConfigurationOverrides): IConfigurationKeys {
		return this._configuration.keys(overrides);
	}

	public values<V>(): IConfigurationValues {
		return this._configuration.values();
	}

	public reloadConfiguration(section?: string): TPromise<any> {
		const current = this._configuration;
		// Reload and reinitialize to ensure we are hitting the disk
		return this.baseConfigurationService.reloadConfiguration()
			.then(() => {
				if (this.workspace.configuration) {
					return this.workspaceConfiguration.load(this.workspace.configuration)
						.then(() => this.initializeConfiguration(false));
				}
				return this.initializeConfiguration(false);
			})
			.then(() => {
				// Check and trigger
				if (!this._configuration.equals(current)) {
					this.triggerConfigurationChange();
				}
				return this.getConfiguration(section);
			});
	}

	public getUnsupportedWorkspaceKeys(): string[] {
		return this.getWorkbenchState() === WorkbenchState.FOLDER ? this._configuration.getFolderConfigurationModel(this.workspace.folders[0].uri).workspaceSettingsConfig.unsupportedKeys : [];
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): void {
		TPromise.join(this.workspace.folders.map(folder => this.cachedFolderConfigs.get(folder.uri).handleWorkspaceFileEvents(event))) // handle file event for each folder
			.then(folderConfigurations =>
				folderConfigurations.map((configuration, index) => ({ configuration, folder: this.workspace.folders[index] }))
					.filter(folderConfiguration => !!folderConfiguration.configuration) // Filter folders which are not impacted by events
					.map(folderConfiguration => this.updateFolderConfiguration(folderConfiguration.folder, folderConfiguration.configuration, true)) // Update the configuration of impacted folders
					.reduce((result, value) => result || value, false)) // Check if the effective configuration of folder is changed
			.then(changed => changed ? this.triggerConfigurationChange() : void 0); // Trigger event if changed
	}

	public initialize(arg: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWindowConfiguration): TPromise<any> {
		return this.createWorkspace(arg)
			.then(workspace => this.setWorkspace(workspace))
			.then(() => this.initializeConfiguration(true));
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
		this.registerWorkspaceConfigSchema();
		const workspaceConfigPath = URI.file(workspaceIdentifier.configPath);
		return this.workspaceConfiguration.load(workspaceConfigPath)
			.then(() => {
				const workspaceConfigurationModel = this.workspaceConfiguration.workspaceConfigurationModel;
				const workspaceFolders = toWorkspaceFolders(workspaceConfigurationModel.folders, URI.file(paths.dirname(workspaceConfigPath.fsPath)));
				if (!workspaceFolders.length) {
					return TPromise.wrapError<Workspace>(new Error('Invalid workspace configuraton file ' + workspaceConfigPath));
				}
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
		const currentName = this.workspace.name;
		const currentFolders = this.workspace.folders;

		this.workspace.update(workspace);

		const newState = this.getWorkbenchState();
		if (newState !== currentState) {
			this._onDidChangeWorkbenchState.fire(newState);
		}

		if (currentName !== this.workspace.name) {
			this._onDidChangeWorkspaceName.fire();
		}

		if (!equals(this.workspace.folders, currentFolders, (folder1, folder2) => folder1.uri.fsPath === folder2.uri.fsPath)) {
			this._onDidChangeWorkspaceFolders.fire();
		}
	}

	private initializeConfiguration(trigger: boolean = true): TPromise<any> {
		this.resetCaches();
		return this.updateConfiguration()
			.then(() => {
				if (trigger) {
					this.triggerConfigurationChange();
				}
			});
	}

	private resetCaches(): void {
		this.cachedFolderConfigs = new StrictResourceMap<FolderConfiguration<any>>();
		this._configuration = new Configuration(<any>this.baseConfigurationService.configuration(), new ConfigurationModel<any>(), new StrictResourceMap<FolderConfigurationModel<any>>(), this.getWorkbenchState() !== WorkbenchState.EMPTY ? this.workspace : null); //TODO: @Sandy Avoid passing null
		this.initCachesForFolders(this.workspace.folders);
	}

	private initCachesForFolders(folders: WorkspaceFolder[]): void {
		for (const folder of folders) {
			this.cachedFolderConfigs.set(folder.uri, this._register(new FolderConfiguration(folder.uri, this.workspaceSettingsRootFolder, this.getWorkbenchState() === WorkbenchState.WORKSPACE ? ConfigurationScope.RESOURCE : ConfigurationScope.WINDOW)));
			this.updateFolderConfiguration(folder, new FolderConfigurationModel<any>(new FolderSettingsModel<any>(null), [], ConfigurationScope.RESOURCE), false);
		}
	}

	private updateConfiguration(folders: WorkspaceFolder[] = this.workspace.folders): TPromise<boolean> {
		return TPromise.join([...folders.map(folder => this.cachedFolderConfigs.get(folder.uri).loadConfiguration()
			.then(configuration => this.updateFolderConfiguration(folder, configuration, true)))])
			.then(changed => changed.reduce((result, value) => result || value, false))
			.then(changed => this.updateWorkspaceConfiguration(true) || changed);
	}

	private onBaseConfigurationChanged({ source, sourceConfig }: IConfigurationServiceEvent): void {
		if (this.workspace) {
			if (source === ConfigurationSource.Default) {
				this.workspace.folders.forEach(folder => this._configuration.getFolderConfigurationModel(folder.uri).update());
			}
			if (this._configuration.updateBaseConfiguration(<any>this.baseConfigurationService.configuration())) {
				this._onDidUpdateConfiguration.fire({ source, sourceConfig });
			}
		}
	}

	private onWorkspaceConfigurationChanged(): void {
		if (this.workspace && this.workspace.configuration) {
			let configuredFolders = toWorkspaceFolders(this.workspaceConfiguration.workspaceConfigurationModel.folders, URI.file(paths.dirname(this.workspace.configuration.fsPath)));
			const foldersChanged = !equals(this.workspace.folders, configuredFolders, (folder1, folder2) => folder1.uri.fsPath === folder2.uri.fsPath);
			if (foldersChanged) { // TODO@Sandeep be smarter here about detecting changes
				this.workspace.folders = configuredFolders;
				this.onFoldersChanged()
					.then(configurationChanged => {
						this._onDidChangeWorkspaceFolders.fire();
						if (configurationChanged) {
							this.triggerConfigurationChange();
						}
					});
			} else {
				const configurationChanged = this.updateWorkspaceConfiguration(true);
				if (configurationChanged) {
					this.triggerConfigurationChange();
				}
			}
		}
	}

	private onFoldersChanged(): TPromise<boolean> {
		let configurationChangedOnRemoval = false;

		// Remove the configurations of deleted folders
		for (const key of this.cachedFolderConfigs.keys()) {
			if (!this.workspace.folders.filter(folder => folder.uri.toString() === key.toString())[0]) {
				this.cachedFolderConfigs.delete(key);
				if (this._configuration.deleteFolderConfiguration(key)) {
					configurationChangedOnRemoval = true;
				}
			}
		}

		// Initialize the newly added folders
		const toInitialize = this.workspace.folders.filter(folder => !this.cachedFolderConfigs.has(folder.uri));
		if (toInitialize.length) {
			this.initCachesForFolders(toInitialize);
			return this.updateConfiguration(toInitialize)
				.then(changed => configurationChangedOnRemoval || changed);
		} else if (configurationChangedOnRemoval) {
			this.updateWorkspaceConfiguration(false);
			return TPromise.as(true);
		}
		return TPromise.as(false);
	}

	private updateFolderConfiguration(folder: WorkspaceFolder, folderConfiguration: FolderConfigurationModel<any>, compare: boolean): boolean {
		let configurationChanged = this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration, compare);
		if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
			// Workspace configuration changed
			configurationChanged = this.updateWorkspaceConfiguration(compare) || configurationChanged;
		}
		return configurationChanged;
	}

	private updateWorkspaceConfiguration(compare: boolean): boolean {
		const workbennchState = this.getWorkbenchState();
		if (workbennchState === WorkbenchState.EMPTY) {
			return false;
		}

		const workspaceConfiguration = workbennchState === WorkbenchState.WORKSPACE ? this.workspaceConfiguration.workspaceConfigurationModel.workspaceConfiguration : this._configuration.getFolderConfigurationModel(this.workspace.folders[0].uri);
		return this._configuration.updateWorkspaceConfiguration(workspaceConfiguration, compare);
	}

	private triggerConfigurationChange(): void {
		if (this.getWorkbenchState() === WorkbenchState.EMPTY) {
			this._onDidUpdateConfiguration.fire({ source: ConfigurationSource.User, sourceConfig: this._configuration.user.contents });
		} else {
			this._onDidUpdateConfiguration.fire({ source: ConfigurationSource.Workspace, sourceConfig: this._configuration.getFolderConfigurationModel(this.workspace.folders[0].uri).contents });
		}
	}

	private pathEquals(path1: string, path2: string): boolean {
		if (!isLinux) {
			path1 = path1.toLowerCase();
			path2 = path2.toLowerCase();
		}

		return path1 === path2;
	}

	private registerWorkspaceConfigSchema(): void {
		const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		if (!contributionRegistry.getSchemaContributions().schemas['vscode://schemas/workspaceConfig']) {
			contributionRegistry.registerSchema('vscode://schemas/workspaceConfig', {
				default: {
					folders: [
						{
							path: ''
						}
					],
					settings: {
					}
				},
				required: ['folders'],
				properties: {
					'folders': {
						minItems: 1,
						uniqueItems: true,
						description: nls.localize('workspaceConfig.folders.description', "List of folders to be loaded in the workspace. Must be a file path. e.g. `/root/folderA` or `./folderA` for a relative path that will be resolved against the location of the workspace file."),
						items: {
							type: 'object',
							default: { path: '' },
							properties: {
								path: {
									type: 'string',
									description: nls.localize('workspaceConfig.folder.description', "A file path. e.g. `/root/folderA` or `./folderA` for a relative path that will be resolved against the location of the workspace file.")
								}
							}
						}
					},
					'settings': {
						type: 'object',
						default: {},
						description: nls.localize('workspaceConfig.settings.description', "Workspace settings"),
						$ref: schemaId
					}
				}
			});
		}
	}
}

class WorkspaceConfiguration extends Disposable {

	private _workspaceConfigPath: URI;
	private _workspaceConfigurationWatcher: ConfigWatcher<WorkspaceConfigurationModel<any>>;
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
				changeBufferDelay: 300, onError: error => errors.onUnexpectedError(error), defaultConfig: new WorkspaceConfigurationModel(null, this._workspaceConfigPath.fsPath), parse: (content: string, parseErrors: any[]) => {
					const workspaceConfigurationModel = new WorkspaceConfigurationModel(content, this._workspaceConfigPath.fsPath);
					parseErrors = [...workspaceConfigurationModel.errors];
					return workspaceConfigurationModel;
				}, initCallback: () => c(null)
			});
			this._workspaceConfigurationWatcherDisposables.push(this._workspaceConfigurationWatcher);
			this._workspaceConfigurationWatcher.onDidUpdateConfiguration(() => this._onDidUpdateConfiguration.fire(), this, this._workspaceConfigurationWatcherDisposables);
		});
	}

	get workspaceConfigurationModel(): WorkspaceConfigurationModel<any> {
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

class FolderConfiguration<T> extends Disposable {

	private static RELOAD_CONFIGURATION_DELAY = 50;

	private bulkFetchFromWorkspacePromise: TPromise<any>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<ConfigurationModel<any>> };

	private reloadConfigurationScheduler: RunOnceScheduler;
	private reloadConfigurationEventEmitter: Emitter<FolderConfigurationModel<T>> = new Emitter<FolderConfigurationModel<T>>();

	constructor(private folder: URI, private configFolderRelativePath: string, private scope: ConfigurationScope) {
		super();

		this.workspaceFilePathToConfiguration = Object.create(null);
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.loadConfiguration().then(configuration => this.reloadConfigurationEventEmitter.fire(configuration), errors.onUnexpectedError), FolderConfiguration.RELOAD_CONFIGURATION_DELAY));
	}

	loadConfiguration(): TPromise<FolderConfigurationModel<T>> {
		// Load workspace locals
		return this.loadWorkspaceConfigFiles().then(workspaceConfigFiles => {
			// Consolidate (support *.json files in the workspace settings folder)
			const workspaceSettingsConfig = <FolderSettingsModel<T>>workspaceConfigFiles[WORKSPACE_CONFIG_DEFAULT_PATH] || new FolderSettingsModel<T>(null);
			const otherConfigModels = Object.keys(workspaceConfigFiles).filter(key => key !== WORKSPACE_CONFIG_DEFAULT_PATH).map(key => <ScopedConfigurationModel<T>>workspaceConfigFiles[key]);
			return new FolderConfigurationModel<T>(workspaceSettingsConfig, otherConfigModels, this.scope);
		});
	}

	private loadWorkspaceConfigFiles<T>(): TPromise<{ [relativeWorkspacePath: string]: ConfigurationModel<T> }> {
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

	public handleWorkspaceFileEvents(event: FileChangesEvent): TPromise<FolderConfigurationModel<T>> {
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

	private createConfigModel<T>(content: IContent): ConfigurationModel<T> {
		const path = this.toFolderRelativePath(content.resource);
		if (path === WORKSPACE_CONFIG_DEFAULT_PATH) {
			return new FolderSettingsModel<T>(content.value, content.resource.toString());
		} else {
			const matches = /\/([^\.]*)*\.json/.exec(path);
			if (matches && matches[1]) {
				return new ScopedConfigurationModel<T>(content.value, content.resource.toString(), matches[1]);
			}
		}

		return new CustomConfigurationModel<T>(null);
	}

	private isWorkspaceConfigurationFile(folderRelativePath: string): boolean {
		return [WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS.launch, WORKSPACE_STANDALONE_CONFIGURATIONS.tasks].some(p => p === folderRelativePath);
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

export class Configuration<T> extends BaseConfiguration<T> {

	constructor(private _baseConfiguration: BaseConfiguration<T>, workspaceConfiguration: ConfigurationModel<T>, protected folders: StrictResourceMap<FolderConfigurationModel<T>>, workspace: Workspace) {
		super(_baseConfiguration.defaults, _baseConfiguration.user, workspaceConfiguration, folders, workspace);
	}

	updateBaseConfiguration(baseConfiguration: BaseConfiguration<T>): boolean {
		const current = new Configuration(this._baseConfiguration, this._workspaceConfiguration, this.folders, this._workspace);

		this._baseConfiguration = baseConfiguration;
		this._defaults = this._baseConfiguration.defaults;
		this._user = this._baseConfiguration.user;
		this.merge();

		return !this.equals(current);
	}

	updateWorkspaceConfiguration(workspaceConfiguration: ConfigurationModel<T>, compare: boolean = true): boolean {
		const current = new Configuration(this._baseConfiguration, this._workspaceConfiguration, this.folders, this._workspace);

		this._workspaceConfiguration = workspaceConfiguration;
		this.merge();

		return compare && !this.equals(current);
	}

	updateFolderConfiguration(resource: URI, configuration: FolderConfigurationModel<T>, compare: boolean): boolean {
		const current = this.getValue(null, { resource });

		this.folders.set(resource, configuration);
		this.mergeFolder(resource);

		return compare && !objects.equals(current, this.getValue(null, { resource }));
	}

	deleteFolderConfiguration(folder: URI): boolean {
		if (this._workspace && this._workspace.folders.length > 0 && this._workspace.folders[0].uri.fsPath === folder.fsPath) {
			// Do not remove workspace configuration
			return false;
		}

		const changed = this.folders.get(folder).keys.length > 0;
		this.folders.delete(folder);
		this._foldersConsolidatedConfigurations.delete(folder);
		return changed;
	}

	getFolderConfigurationModel(folder: URI): FolderConfigurationModel<T> {
		return <FolderConfigurationModel<T>>this.folders.get(folder);
	}

	equals(other: any): boolean {
		if (!other || !(other instanceof Configuration)) {
			return false;
		}

		if (!objects.equals(this.getValue(), other.getValue())) {
			return false;
		}

		if (this._foldersConsolidatedConfigurations.size !== other._foldersConsolidatedConfigurations.size) {
			return false;
		}

		for (const resource of this._foldersConsolidatedConfigurations.keys()) {
			if (!objects.equals(this.getValue(null, { resource }), other.getValue(null, { resource }))) {
				return false;
			}
		}

		return true;
	}
}
