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
import { Disposable, toDisposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { readFile, stat } from 'vs/base/node/pfs';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import * as extfs from 'vs/base/node/extfs';
import { IWorkspaceContextService, IWorkspace, Workspace, ILegacyWorkspace, LegacyWorkspace } from 'vs/platform/workspace/common/workspace';
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
import { getWorkspaceLabel, IWorkspacesService } from "vs/platform/workspaces/common/workspaces";

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

// BEGIN VSCode extension point `configuration`
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IConfigurationNode>('configuration', [], {
	description: nls.localize('vscode.extension.contributes.configuration', 'Contributes configuration settings.'),
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
							}
						}
					}
				]
			}
		}
	}
});
configurationExtPoint.setHandler(extensions => {
	const configurations: IConfigurationNode[] = [];


	for (let i = 0; i < extensions.length; i++) {
		const configuration = <IConfigurationNode>objects.clone(extensions[i].value);
		const collector = extensions[i].collector;

		if (configuration.type && configuration.type !== 'object') {
			collector.warn(nls.localize('invalid.type', "if set, 'configuration.type' must be set to 'object"));
		} else {
			configuration.type = 'object';
		}

		if (configuration.title && (typeof configuration.title !== 'string')) {
			collector.error(nls.localize('invalid.title', "'configuration.title' must be a string"));
		}

		validateProperties(configuration, collector);

		configuration.id = extensions[i].description.id;
		configurations.push(configuration);
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
			if (message) {
				collector.warn(message);
				delete properties[key];
			}
		}
	}
	let subNodes = configuration.allOf;
	if (subNodes) {
		for (let node of subNodes) {
			validateProperties(node, collector);
		}
	}
}

export class WorkspaceService extends Disposable implements IWorkspaceConfigurationService, IWorkspaceContextService {

	public _serviceBrand: any;

	protected workspace: Workspace = null;
	protected legacyWorkspace: LegacyWorkspace = null;
	protected _configuration: Configuration<any>;

	protected readonly _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	protected readonly _onDidChangeWorkspaceRoots: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceRoots: Event<void> = this._onDidChangeWorkspaceRoots.event;

	protected readonly _onDidChangeWorkspaceName: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceName: Event<void> = this._onDidChangeWorkspaceName.event;

	constructor() {
		super();
		this._configuration = new Configuration(new BaseConfiguration(new ConfigurationModel<any>(), new ConfigurationModel<any>()), new ConfigurationModel<any>(), new StrictResourceMap<FolderConfigurationModel<any>>(), this.workspace);
	}

	public getLegacyWorkspace(): ILegacyWorkspace {
		return this.legacyWorkspace;
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public hasWorkspace(): boolean {
		return !!this.workspace;
	}

	public hasFolderWorkspace(): boolean {
		return this.workspace && !this.workspace.configuration;
	}

	public hasMultiFolderWorkspace(): boolean {
		return this.workspace && !!this.workspace.configuration;
	}

	public saveWorkspace(location: URI): TPromise<void> {
		return TPromise.wrapError(new Error('Not supported'));
	}

	public getRoot(resource: URI): URI {
		return this.workspace ? this.workspace.getRoot(resource) : null;
	}

	private get workspaceUri(): URI {
		return this.workspace ? this.workspace.roots[0] : null;
	}

	public isInsideWorkspace(resource: URI): boolean {
		return !!this.getRoot(resource);
	}

	public toResource(workspaceRelativePath: string): URI {
		return this.workspace ? this.legacyWorkspace.toResource(workspaceRelativePath) : null;
	}

	public initialize(trigger: boolean = true): TPromise<any> {
		this.resetCaches();
		return this.updateConfiguration()
			.then(() => {
				if (trigger) {
					this.triggerConfigurationChange();
				}
			});
	}

	public reloadConfiguration(section?: string): TPromise<any> {
		return TPromise.as(this.getConfiguration(section));
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

	public keys(): IConfigurationKeys {
		return this._configuration.keys();
	}

	public values<V>(): IConfigurationValues {
		return this._configuration.values();
	}

	public getUnsupportedWorkspaceKeys(): string[] {
		return [];
	}

	public isInWorkspaceContext(): boolean {
		return false;
	}

	protected triggerConfigurationChange(): void {
		this._onDidUpdateConfiguration.fire({ source: ConfigurationSource.Workspace, sourceConfig: void 0 });
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): void {
		// implemented by sub classes
	}

	protected resetCaches(): void {
		// implemented by sub classes
	}

	protected updateConfiguration(): TPromise<boolean> {
		// implemented by sub classes
		return TPromise.as(false);
	}
}

export class EmptyWorkspaceServiceImpl extends WorkspaceService {

	private baseConfigurationService: GlobalConfigurationService<any>;

	constructor(environmentService: IEnvironmentService) {
		super();
		this.baseConfigurationService = this._register(new GlobalConfigurationService(environmentService));
		this._register(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));
		this.resetCaches();
	}

	public reloadConfiguration(section?: string): TPromise<any> {
		const current = this._configuration;
		return this.baseConfigurationService.reloadConfiguration()
			.then(() => this.initialize(false)) // Reinitialize to ensure we are hitting the disk
			.then(() => {
				// Check and trigger
				if (!this._configuration.equals(current)) {
					this.triggerConfigurationChange();
				}
				return super.reloadConfiguration(section);
			});
	}

	private onBaseConfigurationChanged({ source, sourceConfig }: IConfigurationServiceEvent): void {
		if (this._configuration.updateBaseConfiguration(<any>this.baseConfigurationService.configuration())) {
			this._onDidUpdateConfiguration.fire({ source, sourceConfig });
		}
	}

	protected resetCaches(): void {
		this._configuration = new Configuration(<any>this.baseConfigurationService.configuration(), new ConfigurationModel<any>(), new StrictResourceMap<FolderConfigurationModel<any>>(), null);
	}

	protected triggerConfigurationChange(): void {
		this._onDidUpdateConfiguration.fire({ source: ConfigurationSource.User, sourceConfig: this._configuration.user.contents });
	}
}

export class WorkspaceServiceImpl extends WorkspaceService {

	public _serviceBrand: any;

	private baseConfigurationService: GlobalConfigurationService<any>;
	private workspaceConfiguration: WorkspaceConfiguration;
	private cachedFolderConfigs: StrictResourceMap<FolderConfiguration<any>>;

	constructor(private workspaceConfigPath: URI, private folderPath: URI, private environmentService: IEnvironmentService, private workspacesService: IWorkspacesService, private workspaceSettingsRootFolder: string = WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME) {
		super();
		this.workspaceConfiguration = this._register(new WorkspaceConfiguration());
		this.baseConfigurationService = this._register(new GlobalConfigurationService(environmentService));
	}

	saveWorkspace(location: URI): TPromise<void> {
		return this.workspacesService.saveWorkspace({ id: this.workspace.id, configPath: this.workspace.configuration.fsPath }, location.fsPath)
			.then(workspaceIdentifier => this.onWorkspaceSaved(URI.file(workspaceIdentifier.configPath)));
	}

	public getUnsupportedWorkspaceKeys(): string[] {
		return this.hasFolderWorkspace() ? this._configuration.getFolderConfigurationModel(this.workspace.roots[0]).workspaceSettingsConfig.unsupportedKeys : [];
	}

	public initialize(trigger: boolean = true): TPromise<any> {
		if (!this.workspace) {
			return this.initializeWorkspace()
				.then(() => super.initialize(trigger));
		}

		if (this.hasMultiFolderWorkspace()) {
			return this.workspaceConfiguration.load(this.workspaceConfigPath)
				.then(() => super.initialize(trigger));
		}

		return super.initialize(trigger);
	}

	public reloadConfiguration(section?: string): TPromise<any> {
		const current = this._configuration;
		return this.baseConfigurationService.reloadConfiguration()
			.then(() => this.initialize(false)) // Reinitialize to ensure we are hitting the disk
			.then(() => {
				// Check and trigger
				if (!this._configuration.equals(current)) {
					this.triggerConfigurationChange();
				}
				return super.reloadConfiguration(section);
			});
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): void {
		TPromise.join(this.workspace.roots.map(folder => this.cachedFolderConfigs.get(folder).handleWorkspaceFileEvents(event))) // handle file event for each folder
			.then(folderConfigurations =>
				folderConfigurations.map((configuration, index) => ({ configuration, folder: this.workspace.roots[index] }))
					.filter(folderConfiguration => !!folderConfiguration.configuration) // Filter folders which are not impacted by events
					.map(folderConfiguration => this.updateFolderConfiguration(folderConfiguration.folder, folderConfiguration.configuration, true)) // Update the configuration of impacted folders
					.reduce((result, value) => result || value, false)) // Check if the effective configuration of folder is changed
			.then(changed => changed ? this.triggerConfigurationChange() : void 0); // Trigger event if changed
	}

	protected resetCaches(): void {
		this.cachedFolderConfigs = new StrictResourceMap<FolderConfiguration<any>>();
		this._configuration = new Configuration(<any>this.baseConfigurationService.configuration(), new ConfigurationModel<any>(), new StrictResourceMap<FolderConfigurationModel<any>>(), this.workspace);
		this.initCachesForFolders(this.workspace.roots);
	}

	private initializeWorkspace(): TPromise<void> {
		return (this.workspaceConfigPath ? this.initializeMulitFolderWorkspace() : this.initializeSingleFolderWorkspace())
			.then(() => {
				this._register(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));
			});
	}

	private onWorkspaceSaved(configPath: URI): TPromise<void> {
		let workspaceName = this.workspace.name;
		this.workspaceConfigPath = configPath;

		// Reset the workspace if current workspace is single folder
		if (this.hasFolderWorkspace()) {
			this.folderPath = null;
			this.workspace = null;
		}

		// Update workspace configuration path with new path
		else {
			this.workspace.configuration = configPath;
			this.workspace.name = getWorkspaceLabel({ id: this.workspace.id, configPath: this.workspace.configuration.fsPath }, this.environmentService);
		}

		return this.initialize().then(() => {
			if (workspaceName !== this.workspace.name) {
				this._onDidChangeWorkspaceName.fire();
			}
		});
	}

	private initializeMulitFolderWorkspace(): TPromise<void> {
		this.registerWorkspaceConfigSchema();
		return this.workspaceConfiguration.load(this.workspaceConfigPath)
			.then(() => {
				const workspaceConfigurationModel = this.workspaceConfiguration.workspaceConfigurationModel;
				if (!workspaceConfigurationModel.id || !workspaceConfigurationModel.folders.length) {
					return TPromise.wrapError<void>(new Error('Invalid workspace configuraton file ' + this.workspaceConfigPath));
				}
				const workspaceName = getWorkspaceLabel({ id: workspaceConfigurationModel.id, configPath: this.workspaceConfigPath.fsPath }, this.environmentService);
				this.workspace = new Workspace(workspaceConfigurationModel.id, workspaceName, workspaceConfigurationModel.folders, this.workspaceConfigPath);
				this.legacyWorkspace = new LegacyWorkspace(this.workspace.roots[0]);
				this._register(this.workspaceConfiguration.onDidUpdateConfiguration(() => this.onWorkspaceConfigurationChanged()));
				return null;
			});
	}

	private registerWorkspaceConfigSchema(): void {
		const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		if (!contributionRegistry.getSchemaContributions().schemas['vscode://schemas/workspaceConfig']) {
			contributionRegistry.registerSchema('vscode://schemas/workspaceConfig', {
				default: {
					id: 'SOME_UNIQUE_ID',
					folders: [
						'file:///'
					],
					settings: {
					}
				},
				required: ['id', 'folders'],
				properties: {
					'id': {
						type: 'string',
						description: nls.localize('workspaceConfig.id', "Unique workspace id"),
						minLength: 1
					},
					'folders': {
						minItems: 1,
						uniqueItems: true,
						items: {
							type: 'string'
						}
					},
					'settings': {
						type: 'object',
						default: {},
						description: nls.localize('workspaceSettings.description', "Configure workspace settings"),
						$ref: schemaId
					}
				}
			});
		}
	}

	private initializeSingleFolderWorkspace(): TPromise<void> {
		return stat(this.folderPath.fsPath)
			.then(workspaceStat => {
				const ctime = isLinux ? workspaceStat.ino : workspaceStat.birthtime.getTime(); // On Linux, birthtime is ctime, so we cannot use it! We use the ino instead!
				const id = createHash('md5').update(this.folderPath.fsPath).update(ctime ? String(ctime) : '').digest('hex');
				const folder = URI.file(this.folderPath.fsPath);
				this.workspace = new Workspace(id, paths.basename(this.folderPath.fsPath), [folder], null);
				this.legacyWorkspace = new LegacyWorkspace(folder, ctime);
				return TPromise.as(null);
			});
	}

	private initCachesForFolders(folders: URI[]): void {
		for (const folder of folders) {
			this.cachedFolderConfigs.set(folder, this._register(new FolderConfiguration(folder, this.workspaceSettingsRootFolder, this.hasMultiFolderWorkspace() ? ConfigurationScope.FOLDER : ConfigurationScope.WORKSPACE)));
			this.updateFolderConfiguration(folder, new FolderConfigurationModel<any>(new FolderSettingsModel<any>(null), [], ConfigurationScope.FOLDER), false);
		}
	}

	protected updateConfiguration(folders: URI[] = this.workspace.roots): TPromise<boolean> {
		return TPromise.join([...folders.map(folder => this.cachedFolderConfigs.get(folder).loadConfiguration()
			.then(configuration => this.updateFolderConfiguration(folder, configuration, true)))])
			.then(changed => changed.reduce((result, value) => result || value, false))
			.then(changed => this.updateWorkspaceConfiguration(true) || changed);
	}

	private onBaseConfigurationChanged({ source, sourceConfig }: IConfigurationServiceEvent): void {
		if (source === ConfigurationSource.Default) {
			this.workspace.roots.forEach(folder => this._configuration.getFolderConfigurationModel(folder).update());
		}
		if (this._configuration.updateBaseConfiguration(<any>this.baseConfigurationService.configuration())) {
			this._onDidUpdateConfiguration.fire({ source, sourceConfig });
		}
	}

	private onWorkspaceConfigurationChanged(): void {
		let configuredFolders = this.workspaceConfiguration.workspaceConfigurationModel.folders;
		const foldersChanged = !equals(this.workspace.roots, configuredFolders, (r1, r2) => r1.toString() === r2.toString());
		if (foldersChanged) {
			this.workspace.roots = configuredFolders;
			this._onDidChangeWorkspaceRoots.fire();
			this.onFoldersChanged();
			return;
		}

		const configurationChanged = this.updateWorkspaceConfiguration(true);
		if (configurationChanged) {
			this.triggerConfigurationChange();
		}
	}

	private onFoldersChanged(): void {
		let configurationChanged = false;

		// Remove the configurations of deleted folders
		for (const key of this.cachedFolderConfigs.keys()) {
			if (!this.workspace.roots.filter(folder => folder.toString() === key.toString())[0]) {
				this.cachedFolderConfigs.delete(key);
				if (this._configuration.deleteFolderConfiguration(key)) {
					configurationChanged = true;
				}
			}
		}

		// Initialize the newly added folders
		const toInitialize = this.workspace.roots.filter(folder => !this.cachedFolderConfigs.has(folder));
		if (toInitialize.length) {
			this.initCachesForFolders(toInitialize);
			this.updateConfiguration(toInitialize)
				.then(changed => configurationChanged || changed)
				.then(changed => changed ? this.triggerConfigurationChange() : void 0);
		}
	}

	private updateFolderConfiguration(folder: URI, folderConfiguration: FolderConfigurationModel<any>, compare: boolean): boolean {
		let configurationChanged = this._configuration.updateFolderConfiguration(folder, folderConfiguration, compare);
		if (this.hasFolderWorkspace()) {
			// Workspace configuration changed
			configurationChanged = this.updateWorkspaceConfiguration(compare) || configurationChanged;
		}
		return configurationChanged;
	}

	private updateWorkspaceConfiguration(compare: boolean): boolean {
		const workspaceConfiguration = this.hasMultiFolderWorkspace() ? this.workspaceConfiguration.workspaceConfigurationModel.workspaceConfiguration : this._configuration.getFolderConfigurationModel(this.workspace.roots[0]);
		return this._configuration.updateWorkspaceConfiguration(workspaceConfiguration, compare);
	}

	protected triggerConfigurationChange(): void {
		this._onDidUpdateConfiguration.fire({ source: ConfigurationSource.Workspace, sourceConfig: this._configuration.getFolderConfigurationModel(this.workspace.roots[0]).contents });
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
			this._workspaceConfigurationWatcherDisposables.push(toDisposable(() => this._workspaceConfigurationWatcher.dispose()));
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

		this._defaults = baseConfiguration.defaults;
		this._user = baseConfiguration.user;
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
		if (this._workspace && this._workspace.roots[0].fsPath === folder.fsPath) {
			// Do not remove workspace configuration
			return false;
		}

		this.folders.delete(folder);
		return this._foldersConsolidatedConfigurations.delete(folder);
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
