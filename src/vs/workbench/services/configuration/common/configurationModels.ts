/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { clone, equals } from 'vs/base/common/objects';
import { compare, toValuesTree, IConfigurationChangeEvent, ConfigurationTarget, IConfigurationModel, IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { ConfigurationModel, Configuration as BaseConfiguration, CustomConfigurationModel, ConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, IConfigurationPropertySchema, Extensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import { StrictResourceMap } from 'vs/base/common/map';
import URI from 'vs/base/common/uri';
import { distinct } from 'vs/base/common/arrays';

export class WorkspaceConfigurationModel extends CustomConfigurationModel {

	private _raw: any;
	private _folders: IStoredWorkspaceFolder[];
	private _worksapaceSettings: WorkspaceSettingsModel;

	public update(content: string): void {
		super.update(content);
		this._folders = (this._raw['folders'] || []) as IStoredWorkspaceFolder[];
		this._worksapaceSettings = new WorkspaceSettingsModel(this._raw['settings'] || {});
	}

	get folders(): IStoredWorkspaceFolder[] {
		return this._folders;
	}

	get workspaceConfiguration(): ConfigurationModel {
		return this._worksapaceSettings || new WorkspaceSettingsModel({});
	}

	get workspaceSettingsModel(): WorkspaceSettingsModel {
		return this._worksapaceSettings || new WorkspaceSettingsModel({});
	}

	protected processRaw(raw: any): void {
		this._raw = raw;
		super.processRaw(raw);
	}


}

export class WorkspaceSettingsModel extends ConfigurationModel {

	private _raw: any;
	private _unsupportedKeys: string[];

	constructor(raw: any) {
		super();
		this._raw = raw;
		this.update();
	}

	public get unsupportedKeys(): string[] {
		return this._unsupportedKeys || [];
	}

	update(): void {
		const { unsupportedKeys, contents } = processWorkspaceSettings(this._raw);
		this._unsupportedKeys = unsupportedKeys;
		this._contents = toValuesTree(contents, message => console.error(`Conflict in workspace settings file: ${message}`));
		this._keys = Object.keys(contents);
	}
}

export class ScopedConfigurationModel extends CustomConfigurationModel {

	constructor(content: string, name: string, public readonly scope: string) {
		super(null, name);
		this.update(content);
	}

	public update(content: string): void {
		super.update(content);
		const contents = Object.create(null);
		contents[this.scope] = this.contents;
		this._contents = contents;
	}

}

function processWorkspaceSettings(content: any): { unsupportedKeys: string[], contents: any } {
	const isNotExecutable = (key: string, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema }): boolean => {
		const propertySchema = configurationProperties[key];
		if (!propertySchema) {
			return true; // Unknown propertis are ignored from checks
		}
		return !propertySchema.isExecutable;
	};

	const unsupportedKeys = [];
	const contents = {};
	const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
	for (let key in content) {
		if (isNotExecutable(key, configurationProperties)) {
			contents[key] = content[key];
		} else {
			unsupportedKeys.push(key);
		}
	}
	return { contents, unsupportedKeys };
}

export class FolderSettingsModel extends CustomConfigurationModel {

	private _raw: any;
	private _unsupportedKeys: string[];

	protected processRaw(raw: any): void {
		this._raw = raw;
		const { unsupportedKeys, contents } = processWorkspaceSettings(raw);
		this._unsupportedKeys = unsupportedKeys;
		return super.processRaw(contents);
	}

	public reprocess(): void {
		this.processRaw(this._raw);
	}

	public get unsupportedKeys(): string[] {
		return this._unsupportedKeys || [];
	}

	public createWorkspaceConfigurationModel(): ConfigurationModel {
		return this.createScopedConfigurationModel(ConfigurationScope.WINDOW);
	}

	public createFolderScopedConfigurationModel(): ConfigurationModel {
		return this.createScopedConfigurationModel(ConfigurationScope.RESOURCE);
	}

	private createScopedConfigurationModel(scope: ConfigurationScope): ConfigurationModel {
		const workspaceRaw = {};
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		for (let key in this._raw) {
			if (this.getScope(key, configurationProperties) === scope) {
				workspaceRaw[key] = this._raw[key];
			}
		}
		const workspaceContents = toValuesTree(workspaceRaw, message => console.error(`Conflict in workspace settings file: ${message}`));
		const workspaceKeys = Object.keys(workspaceRaw);
		return new ConfigurationModel(workspaceContents, workspaceKeys, clone(this._overrides));
	}

	private getScope(key: string, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema }): ConfigurationScope {
		const propertySchema = configurationProperties[key];
		return propertySchema ? propertySchema.scope : ConfigurationScope.WINDOW;
	}
}

export class FolderConfigurationModel extends CustomConfigurationModel {

	constructor(public readonly workspaceSettingsConfig: FolderSettingsModel, private scopedConfigs: ScopedConfigurationModel[], private scope: ConfigurationScope) {
		super();
		this.consolidate();
	}

	private consolidate(): void {
		this._contents = {};
		this._overrides = [];

		this.doMerge(this, ConfigurationScope.WINDOW === this.scope ? this.workspaceSettingsConfig : this.workspaceSettingsConfig.createFolderScopedConfigurationModel());
		for (const configModel of this.scopedConfigs) {
			this.doMerge(this, configModel);
		}
	}

	public get keys(): string[] {
		const keys: string[] = [...this.workspaceSettingsConfig.keys];
		this.scopedConfigs.forEach(scopedConfigModel => {
			Object.keys(WORKSPACE_STANDALONE_CONFIGURATIONS).forEach(scope => {
				if (scopedConfigModel.scope === scope) {
					keys.push(...scopedConfigModel.keys.map(key => `${scope}.${key}`));
				}
			});
		});
		return keys;
	}

	public update(): void {
		this.workspaceSettingsConfig.reprocess();
		this.consolidate();
	}
}

export class Configuration extends BaseConfiguration {

	constructor(
		defaults: ConfigurationModel,
		user: ConfigurationModel,
		workspaceConfiguration: ConfigurationModel,
		protected folders: StrictResourceMap<FolderConfigurationModel>,
		memoryConfiguration: ConfigurationModel,
		memoryConfigurationByResource: StrictResourceMap<ConfigurationModel>,
		private readonly _workspace: Workspace) {
		super(defaults, user, workspaceConfiguration, folders, memoryConfiguration, memoryConfigurationByResource);
	}

	getSection<C>(section: string = '', overrides: IConfigurationOverrides = {}): C {
		return super.getSection(section, overrides, this._workspace);
	}

	getValue(key: string, overrides: IConfigurationOverrides = {}): any {
		return super.getValue(key, overrides, this._workspace);
	}

	lookup<C>(key: string, overrides: IConfigurationOverrides = {}): {
		default: C,
		user: C,
		workspace: C,
		workspaceFolder: C
		memory?: C
		value: C,
	} {
		return super.lookup(key, overrides, this._workspace);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return super.keys(this._workspace);
	}

	updateDefaultConfiguration(defaults: ConfigurationModel): void {
		this._defaults = defaults;
		this.merge();
	}

	updateUserConfiguration(user: ConfigurationModel): ConfigurationChangeEvent {
		const { added, updated, removed } = compare(this._user, user);
		let changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			const oldConfiguartion = new Configuration(this._defaults, this._user, this._workspaceConfiguration, this.folders, this._memoryConfiguration, this._memoryConfigurationByResource, this._workspace);

			this._user = user;
			this.merge();

			changedKeys = changedKeys.filter(key => !equals(oldConfiguartion.getValue(key), this.getValue(key)));
		}
		return new ConfigurationChangeEvent().change(changedKeys);
	}

	updateWorkspaceConfiguration(workspaceConfiguration: ConfigurationModel): ConfigurationChangeEvent {
		const { added, updated, removed } = compare(this._workspaceConfiguration, workspaceConfiguration);
		let changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			const oldConfiguartion = new Configuration(this._defaults, this._user, this._workspaceConfiguration, this.folders, this._memoryConfiguration, this._memoryConfigurationByResource, this._workspace);

			this._workspaceConfiguration = workspaceConfiguration;
			this.merge();

			changedKeys = changedKeys.filter(key => !equals(oldConfiguartion.getValue(key), this.getValue(key)));
		}
		return new ConfigurationChangeEvent().change(changedKeys);
	}

	updateFolderConfiguration(resource: URI, configuration: FolderConfigurationModel): ConfigurationChangeEvent {
		const currentFolderConfiguration = this.folders.get(resource);

		if (currentFolderConfiguration) {
			const { added, updated, removed } = compare(currentFolderConfiguration, configuration);
			let changedKeys = [...added, ...updated, ...removed];
			if (changedKeys.length) {
				const oldConfiguartion = new Configuration(this._defaults, this._user, this._workspaceConfiguration, this.folders, this._memoryConfiguration, this._memoryConfigurationByResource, this._workspace);

				this.folders.set(resource, configuration);
				this.mergeFolder(resource);

				changedKeys = changedKeys.filter(key => !equals(oldConfiguartion.getValue(key, { resource }), this.getValue(key, { resource })));
			}
			return new ConfigurationChangeEvent().change(changedKeys, resource);
		}

		this.folders.set(resource, configuration);
		this.mergeFolder(resource);
		return new ConfigurationChangeEvent().change(configuration.keys, resource);
	}

	deleteFolderConfiguration(folder: URI): ConfigurationChangeEvent {
		if (this._workspace && this._workspace.folders.length > 0 && this._workspace.folders[0].uri.toString() === folder.toString()) {
			// Do not remove workspace configuration
			return new ConfigurationChangeEvent();
		}

		const keys = this.folders.get(folder).keys;
		this.folders.delete(folder);
		this._foldersConsolidatedConfigurations.delete(folder);
		return new ConfigurationChangeEvent().change(keys, folder);
	}

	getFolderConfigurationModel(folder: URI): FolderConfigurationModel {
		return <FolderConfigurationModel>this.folders.get(folder);
	}

	compare(other: Configuration): string[] {
		let from = other.allKeys();
		let to = this.allKeys();

		const added = to.filter(key => from.indexOf(key) === -1);
		const removed = from.filter(key => to.indexOf(key) === -1);
		const updated = [];

		for (const key of from) {
			const value1 = this.getValue(key);
			const value2 = other.getValue(key);
			if (!equals(value1, value2)) {
				updated.push(key);
			}
		}

		return [...added, ...removed, ...updated];
	}

	allKeys(): string[] {
		let keys = this.keys();
		let all = [...keys.default, ...keys.user, ...keys.workspace];
		for (const resource of this.folders.keys()) {
			all.push(...this.folders.get(resource).keys);
		}
		return distinct(all);
	}
}

export class WorkspaceConfigurationChangeEvent implements IConfigurationChangeEvent {

	constructor(private configurationChangeEvent: IConfigurationChangeEvent, private workspace: Workspace) { }

	get changedConfiguration(): IConfigurationModel {
		return this.configurationChangeEvent.changedConfiguration;
	}

	get changedConfigurationByResource(): StrictResourceMap<IConfigurationModel> {
		return this.configurationChangeEvent.changedConfigurationByResource;
	}

	get affectedKeys(): string[] {
		return this.configurationChangeEvent.affectedKeys;
	}

	get source(): ConfigurationTarget {
		return this.configurationChangeEvent.source;
	}

	get sourceConfig(): any {
		return this.configurationChangeEvent.sourceConfig;
	}

	affectsConfiguration(config: string, resource?: URI): boolean {
		if (this.configurationChangeEvent.affectsConfiguration(config, resource)) {
			return true;
		}

		if (resource && this.workspace) {
			let workspaceFolder = this.workspace.getFolder(resource);
			if (workspaceFolder) {
				return this.configurationChangeEvent.affectsConfiguration(config, workspaceFolder.uri);
			}
		}

		return false;
	}
}