/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { equals } from 'vs/base/common/objects';
import { compare, toValuesTree, IConfigurationChangeEvent, ConfigurationTarget, IConfigurationModel, IConfigurationOverrides, IOverrides } from 'vs/platform/configuration/common/configuration';
import { Configuration as BaseConfiguration, ConfigurationModelParser, ConfigurationChangeEvent, ConfigurationModel, AbstractConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, IConfigurationPropertySchema, Extensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import { StrictResourceMap } from 'vs/base/common/map';
import URI from 'vs/base/common/uri';

export class SettingsModel extends ConfigurationModel {

	private _unsupportedKeys: string[];

	constructor(contents: any, keys: string[], overrides: IOverrides[], unsupportedKeys: string[]) {
		super(contents, keys, overrides);
		this._unsupportedKeys = unsupportedKeys;
	}

	public get unsupportedKeys(): string[] {
		return this._unsupportedKeys;
	}

}

export class WorkspaceConfigurationModelParser extends ConfigurationModelParser {

	private _folders: IStoredWorkspaceFolder[] = [];
	private _settingsModelParser: FolderSettingsModelParser;
	private _launchModel: ConfigurationModel;

	constructor(name: string) {
		super(name);
		this._settingsModelParser = new FolderSettingsModelParser(name, [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE]);
		this._launchModel = new ConfigurationModel();
	}

	get folders(): IStoredWorkspaceFolder[] {
		return this._folders;
	}

	get settingsModel(): SettingsModel {
		return this._settingsModelParser.settingsModel;
	}

	get launchModel(): ConfigurationModel {
		return this._launchModel;
	}

	reprocessWorkspaceSettings(): void {
		this._settingsModelParser.reprocess();
	}

	protected parseRaw(raw: any): IConfigurationModel {
		this._folders = (raw['folders'] || []) as IStoredWorkspaceFolder[];
		this._settingsModelParser.parse(raw['settings']);
		this._launchModel = this.createConfigurationModelFrom(raw, 'launch');
		return super.parseRaw(raw);
	}

	private createConfigurationModelFrom(raw: any, key: string): ConfigurationModel {
		const data = raw[key];
		if (data) {
			const contents = toValuesTree(data, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
			const scopedContents = Object.create(null);
			scopedContents[key] = contents;
			const keys = Object.keys(data).map(k => `${key}.${k}`);
			return new ConfigurationModel(scopedContents, keys, []);
		}
		return new ConfigurationModel();
	}
}

export class StandaloneConfigurationModelParser extends ConfigurationModelParser {

	constructor(name: string, private readonly scope: string) {
		super(name);
	}

	protected parseRaw(raw: any): IConfigurationModel {
		const contents = toValuesTree(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
		const scopedContents = Object.create(null);
		scopedContents[this.scope] = contents;
		const keys = Object.keys(raw).map(key => `${this.scope}.${key}`);
		return { contents: scopedContents, keys, overrides: [] };
	}

}

export class FolderSettingsModelParser extends ConfigurationModelParser {

	private _raw: any;
	private _settingsModel: SettingsModel;

	constructor(name: string, private scopes: ConfigurationScope[]) {
		super(name);
	}

	parse(content: string | any): void {
		this._raw = typeof content === 'string' ? this.parseContent(content) : content;
		this.parseWorkspaceSettings(this._raw);
	}

	get configurationModel(): ConfigurationModel {
		return this._settingsModel || new SettingsModel({}, [], [], []);
	}

	get settingsModel(): SettingsModel {
		return <SettingsModel>this.configurationModel;
	}

	reprocess(): void {
		this.parse(this._raw);
	}

	private parseWorkspaceSettings(rawSettings: any): void {
		const unsupportedKeys = [];
		const rawWorkspaceSettings = {};
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		for (let key in rawSettings) {
			if (this.isNotExecutable(key, configurationProperties)) {
				const scope = this.getScope(key, configurationProperties);
				if (this.scopes.indexOf(scope) !== -1) {
					rawWorkspaceSettings[key] = rawSettings[key];
				}
			} else {
				unsupportedKeys.push(key);
			}
		}
		const configurationModel = this.parseRaw(rawWorkspaceSettings);
		this._settingsModel = new SettingsModel(configurationModel.contents, configurationModel.keys, configurationModel.overrides, unsupportedKeys);
	}

	private getScope(key: string, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema }): ConfigurationScope {
		const propertySchema = configurationProperties[key];
		return propertySchema ? propertySchema.scope : ConfigurationScope.WINDOW;
	}

	private isNotExecutable(key: string, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema }): boolean {
		const propertySchema = configurationProperties[key];
		if (!propertySchema) {
			return true; // Unknown propertis are ignored from checks
		}
		return !propertySchema.isExecutable;
	}
}

export class Configuration extends BaseConfiguration {

	constructor(
		defaults: ConfigurationModel,
		user: ConfigurationModel,
		workspaceConfiguration: ConfigurationModel,
		folders: StrictResourceMap<ConfigurationModel>,
		memoryConfiguration: ConfigurationModel,
		memoryConfigurationByResource: StrictResourceMap<ConfigurationModel>,
		private readonly _workspace: Workspace) {
		super(defaults, user, workspaceConfiguration, folders, memoryConfiguration, memoryConfigurationByResource);
	}

	getValue(key: string, overrides: IConfigurationOverrides = {}): any {
		return super.getValue(key, overrides, this._workspace);
	}

	inspect<C>(key: string, overrides: IConfigurationOverrides = {}): {
		default: C,
		user: C,
		workspace: C,
		workspaceFolder: C
		memory?: C
		value: C,
	} {
		return super.inspect(key, overrides, this._workspace);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return super.keys(this._workspace);
	}

	compareAndUpdateUserConfiguration(user: ConfigurationModel): ConfigurationChangeEvent {
		const { added, updated, removed } = compare(this.user, user);
		let changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			const oldValues = changedKeys.map(key => this.getValue(key));
			super.updateUserConfiguration(user);
			changedKeys = changedKeys.filter((key, index) => !equals(oldValues[index], this.getValue(key)));
		}
		return new ConfigurationChangeEvent().change(changedKeys);
	}

	compareAndUpdateWorkspaceConfiguration(workspaceConfiguration: ConfigurationModel): ConfigurationChangeEvent {
		const { added, updated, removed } = compare(this.workspace, workspaceConfiguration);
		let changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			const oldValues = changedKeys.map(key => this.getValue(key));
			super.updateWorkspaceConfiguration(workspaceConfiguration);
			changedKeys = changedKeys.filter((key, index) => !equals(oldValues[index], this.getValue(key)));
		}
		return new ConfigurationChangeEvent().change(changedKeys);
	}

	compareAndUpdateFolderConfiguration(resource: URI, folderConfiguration: ConfigurationModel): ConfigurationChangeEvent {
		const currentFolderConfiguration = this.folders.get(resource);
		if (currentFolderConfiguration) {
			const { added, updated, removed } = compare(currentFolderConfiguration, folderConfiguration);
			let changedKeys = [...added, ...updated, ...removed];
			if (changedKeys.length) {
				const oldValues = changedKeys.map(key => this.getValue(key, { resource }));
				super.updateFolderConfiguration(resource, folderConfiguration);
				changedKeys = changedKeys.filter((key, index) => !equals(oldValues[index], this.getValue(key, { resource })));
			}
			return new ConfigurationChangeEvent().change(changedKeys, resource);
		} else {
			super.updateFolderConfiguration(resource, folderConfiguration);
			return new ConfigurationChangeEvent().change(folderConfiguration.keys, resource);
		}
	}

	compareAndDeleteFolderConfiguration(folder: URI): ConfigurationChangeEvent {
		if (this._workspace && this._workspace.folders.length > 0 && this._workspace.folders[0].uri.toString() === folder.toString()) {
			// Do not remove workspace configuration
			return new ConfigurationChangeEvent();
		}
		const keys = this.folders.get(folder).keys;
		super.deleteFolderConfiguration(folder);
		return new ConfigurationChangeEvent().change(keys, folder);
	}

	compare(other: Configuration): string[] {
		const result = [];
		for (const key of this.allKeys()) {
			if (!equals(this.getValue(key), other.getValue(key))
				|| (this._workspace && this._workspace.folders.some(folder => !equals(this.getValue(key, { resource: folder.uri }), other.getValue(key, { resource: folder.uri }))))) {
				result.push(key);
			}
		}
		return result;
	}

	allKeys(): string[] {
		return super.allKeys(this._workspace);
	}
}

export class AllKeysConfigurationChangeEvent extends AbstractConfigurationChangeEvent implements IConfigurationChangeEvent {

	private _changedConfiguration: ConfigurationModel = null;

	constructor(private _configuration: Configuration, readonly source: ConfigurationTarget, readonly sourceConfig: any) { super(); }

	get changedConfiguration(): ConfigurationModel {
		if (!this._changedConfiguration) {
			this._changedConfiguration = new ConfigurationModel();
			this.updateKeys(this._changedConfiguration, this.affectedKeys);
		}
		return this._changedConfiguration;
	}

	get changedConfigurationByResource(): StrictResourceMap<IConfigurationModel> {
		return new StrictResourceMap();
	}

	get affectedKeys(): string[] {
		return this._configuration.allKeys();
	}

	affectsConfiguration(config: string, resource?: URI): boolean {
		return this.doesConfigurationContains(this.changedConfiguration, config);
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