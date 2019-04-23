/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/objects';
import { compare, toValuesTree, IConfigurationChangeEvent, ConfigurationTarget, IConfigurationModel, IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { Configuration as BaseConfiguration, ConfigurationModelParser, ConfigurationChangeEvent, ConfigurationModel, AbstractConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { WORKSPACE_SCOPES } from 'vs/workbench/services/configuration/common/configuration';

export class WorkspaceConfigurationModelParser extends ConfigurationModelParser {

	private _folders: IStoredWorkspaceFolder[] = [];
	private _settingsModelParser: ConfigurationModelParser;
	private _launchModel: ConfigurationModel;

	constructor(name: string) {
		super(name);
		this._settingsModelParser = new ConfigurationModelParser(name, WORKSPACE_SCOPES);
		this._launchModel = new ConfigurationModel();
	}

	get folders(): IStoredWorkspaceFolder[] {
		return this._folders;
	}

	get settingsModel(): ConfigurationModel {
		return this._settingsModelParser.configurationModel;
	}

	get launchModel(): ConfigurationModel {
		return this._launchModel;
	}

	reprocessWorkspaceSettings(): void {
		this._settingsModelParser.parse();
	}

	protected doParseRaw(raw: any): IConfigurationModel {
		this._folders = (raw['folders'] || []) as IStoredWorkspaceFolder[];
		this._settingsModelParser.parseRaw(raw['settings']);
		this._launchModel = this.createConfigurationModelFrom(raw, 'launch');
		return super.doParseRaw(raw);
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

	protected doParseRaw(raw: any): IConfigurationModel {
		const contents = toValuesTree(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
		const scopedContents = Object.create(null);
		scopedContents[this.scope] = contents;
		const keys = Object.keys(raw).map(key => `${this.scope}.${key}`);
		return { contents: scopedContents, keys, overrides: [] };
	}

}

export class Configuration extends BaseConfiguration {

	constructor(
		defaults: ConfigurationModel,
		localUser: ConfigurationModel,
		remoteUser: ConfigurationModel,
		workspaceConfiguration: ConfigurationModel,
		folders: ResourceMap<ConfigurationModel>,
		memoryConfiguration: ConfigurationModel,
		memoryConfigurationByResource: ResourceMap<ConfigurationModel>,
		private readonly _workspace?: Workspace) {
		super(defaults, localUser, remoteUser, workspaceConfiguration, folders, memoryConfiguration, memoryConfigurationByResource);
	}

	getValue(key: string | undefined, overrides: IConfigurationOverrides = {}): any {
		return super.getValue(key, overrides, this._workspace);
	}

	inspect<C>(key: string, overrides: IConfigurationOverrides = {}): {
		default: C,
		user: C,
		userLocal?: C,
		userRemote?: C,
		workspace?: C,
		workspaceFolder?: C
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

	compareAndUpdateLocalUserConfiguration(user: ConfigurationModel): ConfigurationChangeEvent {
		const { added, updated, removed } = compare(this.localUserConfiguration, user);
		let changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			super.updateLocalUserConfiguration(user);
		}
		return new ConfigurationChangeEvent().change(changedKeys);
	}

	compareAndUpdateRemoteUserConfiguration(user: ConfigurationModel): ConfigurationChangeEvent {
		const { added, updated, removed } = compare(this.remoteUserConfiguration, user);
		let changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			super.updateRemoteUserConfiguration(user);
		}
		return new ConfigurationChangeEvent().change(changedKeys);
	}

	compareAndUpdateWorkspaceConfiguration(workspaceConfiguration: ConfigurationModel): ConfigurationChangeEvent {
		const { added, updated, removed } = compare(this.workspaceConfiguration, workspaceConfiguration);
		let changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			super.updateWorkspaceConfiguration(workspaceConfiguration);
		}
		return new ConfigurationChangeEvent().change(changedKeys);
	}

	compareAndUpdateFolderConfiguration(resource: URI, folderConfiguration: ConfigurationModel): ConfigurationChangeEvent {
		const currentFolderConfiguration = this.folderConfigurations.get(resource);
		if (currentFolderConfiguration) {
			const { added, updated, removed } = compare(currentFolderConfiguration, folderConfiguration);
			let changedKeys = [...added, ...updated, ...removed];
			if (changedKeys.length) {
				super.updateFolderConfiguration(resource, folderConfiguration);
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
		const folderConfig = this.folderConfigurations.get(folder);
		if (!folderConfig) {
			throw new Error('Unknown folder');
		}
		const keys = folderConfig.keys;
		super.deleteFolderConfiguration(folder);
		return new ConfigurationChangeEvent().change(keys, folder);
	}

	compare(other: Configuration): string[] {
		const result: string[] = [];
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

	private _changedConfiguration: ConfigurationModel | null = null;

	constructor(private _configuration: Configuration, readonly source: ConfigurationTarget, readonly sourceConfig: any) { super(); }

	get changedConfiguration(): ConfigurationModel {
		if (!this._changedConfiguration) {
			this._changedConfiguration = new ConfigurationModel();
			this.updateKeys(this._changedConfiguration, this.affectedKeys);
		}
		return this._changedConfiguration;
	}

	get changedConfigurationByResource(): ResourceMap<IConfigurationModel> {
		return new ResourceMap();
	}

	get affectedKeys(): string[] {
		return this._configuration.allKeys();
	}

	affectsConfiguration(config: string, resource?: URI): boolean {
		return this.doesConfigurationContains(this.changedConfiguration, config);
	}
}

export class WorkspaceConfigurationChangeEvent implements IConfigurationChangeEvent {

	constructor(private configurationChangeEvent: IConfigurationChangeEvent, private workspace: Workspace | undefined) { }

	get changedConfiguration(): IConfigurationModel {
		return this.configurationChangeEvent.changedConfiguration;
	}

	get changedConfigurationByResource(): ResourceMap<IConfigurationModel> {
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
