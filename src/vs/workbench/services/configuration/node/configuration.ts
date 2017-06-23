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
import { distinct, equals } from "vs/base/common/arrays";
import * as objects from 'vs/base/common/objects';
import * as errors from 'vs/base/common/errors';
import * as collections from 'vs/base/common/collections';
import { Disposable } from "vs/base/common/lifecycle";
import { Schemas } from "vs/base/common/network";
import { RunOnceScheduler } from 'vs/base/common/async';
import { readFile } from 'vs/base/node/pfs';
import * as extfs from 'vs/base/node/extfs';
import { IWorkspaceContextService, IWorkspace, Workspace, ILegacyWorkspace, LegacyWorkspace } from "vs/platform/workspace/common/workspace";
import { FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CustomConfigurationModel } from 'vs/platform/configuration/common/model';
import { ScopedConfigurationModel, FolderConfigurationModel, FolderSettingsModel } from 'vs/workbench/services/configuration/common/configurationModels';
import { IConfigurationServiceEvent, ConfigurationSource, IConfigurationKeys, IConfigurationValue, ConfigurationModel, IConfigurationOverrides, Configuration as BaseConfiguration, IConfigurationValues, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceConfigurationService, WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME, WORKSPACE_STANDALONE_CONFIGURATIONS, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';
import { ConfigurationService as GlobalConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { basename } from "path";
import nls = require('vs/nls');
import { Registry } from 'vs/platform/registry/common/platform';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { IConfigurationNode, IConfigurationRegistry, Extensions, editorConfigurationSchemaId, IDefaultConfigurationExtension, validateProperty } from "vs/platform/configuration/common/configurationRegistry";

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

export class WorkspaceConfigurationService extends Disposable implements IWorkspaceContextService, IWorkspaceConfigurationService {

	public _serviceBrand: any;

	private readonly _onDidChangeWorkspaceRoots: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceRoots: Event<void> = this._onDidChangeWorkspaceRoots.event;

	private readonly _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	private baseConfigurationService: GlobalConfigurationService<any>;

	private cachedFolderConfigs: StrictResourceMap<FolderConfiguration<any>>;

	private readonly legacyWorkspace: LegacyWorkspace;

	private _configuration: Configuration<any>;

	constructor(private environmentService: IEnvironmentService, private readonly workspace?: Workspace, private workspaceSettingsRootFolder: string = WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME) {
		super();

		this.legacyWorkspace = this.workspace && this.workspace.roots.length ? new LegacyWorkspace(this.workspace.roots[0]) : null;

		this._register(this.onDidUpdateConfiguration(e => this.resolveAdditionalFolders()));

		this.baseConfigurationService = this._register(new GlobalConfigurationService(environmentService));
		this._register(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));
		this._register(this.onDidChangeWorkspaceRoots(e => this.onRootsChanged()));

		this.initCaches();
	}

	private resolveAdditionalFolders(): void {
		// TODO@Ben multi root
		if (!this.workspace || this.environmentService.appQuality === 'stable') {
			return; // no additional folders for empty workspaces or in stable
		}

		// Resovled configured folders for workspace
		let [master] = this.workspace.roots;
		let configuredFolders: URI[] = [master];
		const config = this.getConfiguration<IWorkspaceFoldersConfiguration>('workspace');
		if (config) {
			const workspaceConfig = config[master.toString()];
			if (workspaceConfig) {
				const additionalFolders = workspaceConfig.folders
					.map(f => URI.parse(f))
					.filter(r => r.scheme === Schemas.file); // only support files for now

				configuredFolders.push(...additionalFolders);
			}
		}

		// Remove duplicates
		configuredFolders = distinct(configuredFolders, r => r.toString());

		// Find changes
		const changed = !equals(this.workspace.roots, configuredFolders, (r1, r2) => r1.toString() === r2.toString());

		if (changed) {

			this.workspace.roots = configuredFolders;
			this.workspace.name = configuredFolders.map(root => basename(root.fsPath) || root.fsPath).join(', ');

			this._onDidChangeWorkspaceRoots.fire();
		}
	}

	public getWorkspace(): ILegacyWorkspace {
		return this.legacyWorkspace;
	}

	public getWorkspace2(): IWorkspace {
		return this.workspace;
	}

	public hasWorkspace(): boolean {
		return !!this.workspace;
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

	public toWorkspaceRelativePath(resource: URI, toOSPath?: boolean): string {
		return this.workspace ? this.legacyWorkspace.toWorkspaceRelativePath(resource, toOSPath) : null;
	}

	public toResource(workspaceRelativePath: string): URI {
		return this.workspace ? this.legacyWorkspace.toResource(workspaceRelativePath) : null;
	}

	public getConfigurationData<T>(): IConfigurationData<T> {
		return this._configuration.toData();
	}

	public get configuration(): BaseConfiguration<any> {
		return this._configuration;
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
		return this.workspace ? this._configuration.getFolderConfigurationModel(this.workspace.roots[0]).workspaceSettingsConfig.unsupportedKeys : [];
	}

	public reloadConfiguration(section?: string): TPromise<any> {
		const current = this._configuration;

		return this.baseConfigurationService.reloadConfiguration()
			.then(() => this.initialize(false)) // Reinitialize to ensure we are hitting the disk
			.then(() => !this._configuration.equals(current)) // Check if the configuration is changed
			.then(changed => changed ? this.trigger(ConfigurationSource.Workspace, ) : void 0) // Trigger event if changed
			.then(() => this.getConfiguration(section));
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): void {
		if (this.workspace) {
			TPromise.join(this.workspace.roots.map(folder => this.cachedFolderConfigs.get(folder).handleWorkspaceFileEvents(event))) // handle file event for each folder
				.then(folderConfigurations =>
					folderConfigurations.map((configuration, index) => ({ configuration, folder: this.workspace.roots[index] }))
						.filter(folderConfiguration => !!folderConfiguration.configuration) // Filter folders which are not impacted by events
						.map(folderConfiguration => this._configuration.updateFolderConfiguration(folderConfiguration.folder, folderConfiguration.configuration)) // Update the configuration of impacted folders
						.reduce((result, value) => result || value, false)) // Check if the effective configuration of folder is changed
				.then(changed => changed ? this.trigger(ConfigurationSource.Workspace) : void 0); // Trigger event if changed
		}
	}

	public initialize(trigger: boolean = true): TPromise<any> {
		this.initCaches();
		return this.doInitialize(this.workspace ? this.workspace.roots : [])
			.then(() => {
				if (trigger) {
					this.trigger(this.workspace ? ConfigurationSource.Workspace : ConfigurationSource.User);
				}
			});
	}

	private onRootsChanged(): void {
		if (!this.workspace) {
			return;
		}

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
			this.doInitialize(toInitialize)
				.then(changed => configurationChanged || changed)
				.then(changed => changed ? this.trigger(ConfigurationSource.Workspace) : void 0);
		}
	}

	private initCaches(): void {
		this.cachedFolderConfigs = new StrictResourceMap<FolderConfiguration<any>>();
		this._configuration = new Configuration(<any>this.baseConfigurationService.configuration(), new StrictResourceMap<FolderConfigurationModel<any>>(), this.workspace);
		this.initCachesForFolders(this.workspace ? this.workspace.roots : []);
	}

	private initCachesForFolders(folders: URI[]): void {
		for (const folder of folders) {
			this.cachedFolderConfigs.set(folder, new FolderConfiguration(folder, this.workspaceSettingsRootFolder, this.workspace));
			this._configuration.updateFolderConfiguration(folder, new FolderConfigurationModel<any>(new FolderSettingsModel<any>(null), []), false);
		}
	}

	private doInitialize(folders: URI[]): TPromise<boolean> {
		return TPromise.join(folders.map(folder => this.cachedFolderConfigs.get(folder).loadConfiguration()
			.then(configuration => this._configuration.updateFolderConfiguration(folder, configuration))))
			.then(changed => changed.reduce((result, value) => result || value, false));
	}

	private onBaseConfigurationChanged(event: IConfigurationServiceEvent): void {
		if (event.source === ConfigurationSource.Default) {
			if (this.workspace) {
				this.workspace.roots.forEach(folder => this._configuration.getFolderConfigurationModel(folder).update());
			}
		}

		if (this._configuration.updateBaseConfiguration(<any>this.baseConfigurationService.configuration())) {
			this.trigger(event.source, event.sourceConfig);
		}
	}

	private trigger(source: ConfigurationSource, sourceConfig?: any): void {
		if (!sourceConfig) {
			sourceConfig = this.workspace ? this._configuration.getFolderConfigurationModel(this.workspace.roots[0]).contents : this._configuration.user.contents;
		}
		this._onDidUpdateConfiguration.fire({ source, sourceConfig });
	}
}

class FolderConfiguration<T> extends Disposable {

	private static RELOAD_CONFIGURATION_DELAY = 50;

	private bulkFetchFromWorkspacePromise: TPromise<any>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<ConfigurationModel<any>> };

	private reloadConfigurationScheduler: RunOnceScheduler;
	private reloadConfigurationEventEmitter: Emitter<FolderConfigurationModel<T>> = new Emitter<FolderConfigurationModel<T>>();

	constructor(private folder: URI, private configFolderRelativePath: string, private workspace: Workspace) {
		super();

		this.workspaceFilePathToConfiguration = Object.create(null);
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.loadConfiguration().then(configuration => this.reloadConfigurationEventEmitter.fire(configuration), errors.onUnexpectedError), FolderConfiguration.RELOAD_CONFIGURATION_DELAY));
	}

	loadConfiguration(): TPromise<FolderConfigurationModel<T>> {
		if (!this.workspace) {
			return TPromise.wrap(new FolderConfigurationModel<T>(new FolderSettingsModel<T>(null), []));
		}

		// Load workspace locals
		return this.loadWorkspaceConfigFiles().then(workspaceConfigFiles => {
			// Consolidate (support *.json files in the workspace settings folder)
			const workspaceSettingsConfig = <FolderSettingsModel<T>>workspaceConfigFiles[WORKSPACE_CONFIG_DEFAULT_PATH] || new FolderSettingsModel<T>(null);
			const otherConfigModels = Object.keys(workspaceConfigFiles).filter(key => key !== WORKSPACE_CONFIG_DEFAULT_PATH).map(key => <ScopedConfigurationModel<T>>workspaceConfigFiles[key]);
			return new FolderConfigurationModel<T>(workspaceSettingsConfig, otherConfigModels);
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
		if (!this.workspace) {
			return TPromise.wrap(null);
		}

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

class Configuration<T> extends BaseConfiguration<T> {

	constructor(private _baseConfiguration: Configuration<T>, protected folders: StrictResourceMap<FolderConfigurationModel<T>>, workspace: Workspace) {
		super(_baseConfiguration.defaults, _baseConfiguration.user, folders, workspace);
	}

	updateBaseConfiguration(baseConfiguration: Configuration<T>): boolean {
		const current = new Configuration(this._baseConfiguration, this.folders, this._workspace);

		this._defaults = baseConfiguration.defaults;
		this._user = baseConfiguration.user;
		this.merge();

		return !this.equals(current);
	}

	updateFolderConfiguration(resource: URI, configuration: FolderConfigurationModel<T>, compare: boolean = true): boolean {
		this.folders.set(resource, configuration);
		const current = this.getValue(null, { resource });
		this.mergeFolder(resource);
		return compare && !objects.equals(current, this.getValue(null, { resource }));
	}

	deleteFolderConfiguration(folder: URI): boolean {
		if (this.workspaceUri && this.workspaceUri.fsPath === folder.fsPath) {
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
