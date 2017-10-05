/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { clone, equals } from 'vs/base/common/objects';
import { CustomConfigurationModel, toValuesTree } from 'vs/platform/configuration/common/model';
import { ConfigurationModel, Configuration as BaseConfiguration, compare } from 'vs/platform/configuration/common/configuration';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, IConfigurationPropertySchema, Extensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import { StrictResourceMap } from 'vs/base/common/map';
import URI from 'vs/base/common/uri';

export class WorkspaceConfigurationModel<T> extends CustomConfigurationModel<T> {

	private _raw: T;
	private _folders: IStoredWorkspaceFolder[];
	private _worksapaceSettings: ConfigurationModel<T>;
	private _tasksConfiguration: ConfigurationModel<T>;
	private _launchConfiguration: ConfigurationModel<T>;
	private _workspaceConfiguration: ConfigurationModel<T>;

	public update(content: string): void {
		super.update(content);
		this._worksapaceSettings = new ConfigurationModel(this._worksapaceSettings.contents, this._worksapaceSettings.keys, this.overrides);
		this._workspaceConfiguration = this.consolidate();
	}

	get folders(): IStoredWorkspaceFolder[] {
		return this._folders;
	}

	get workspaceConfiguration(): ConfigurationModel<T> {
		return this._workspaceConfiguration;
	}

	protected processRaw(raw: T): void {
		this._raw = raw;

		this._folders = (this._raw['folders'] || []) as IStoredWorkspaceFolder[];
		this._worksapaceSettings = this.parseConfigurationModel('settings');
		this._tasksConfiguration = this.parseConfigurationModel('tasks');
		this._launchConfiguration = this.parseConfigurationModel('launch');

		super.processRaw(raw);
	}

	private parseConfigurationModel(section: string): ConfigurationModel<T> {
		const rawSection = this._raw[section] || {};
		const contents = toValuesTree(rawSection, message => console.error(`Conflict in section '${section}' of workspace configuration file ${message}`));
		return new ConfigurationModel<T>(contents, Object.keys(rawSection));
	}

	private consolidate(): ConfigurationModel<T> {
		const keys: string[] = [...this._worksapaceSettings.keys,
		...this._tasksConfiguration.keys.map(key => `tasks.${key}`),
		...this._launchConfiguration.keys.map(key => `launch.${key}`)];

		const mergedContents = new ConfigurationModel<T>(<T>{}, keys)
			.merge(this._worksapaceSettings)
			.merge(this._tasksConfiguration)
			.merge(this._launchConfiguration);

		return new ConfigurationModel<T>(mergedContents.contents, keys, mergedContents.overrides);
	}
}

export class ScopedConfigurationModel<T> extends CustomConfigurationModel<T> {

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

export class FolderSettingsModel<T> extends CustomConfigurationModel<T> {

	private _raw: T;
	private _unsupportedKeys: string[];

	protected processRaw(raw: T): void {
		this._raw = raw;
		const processedRaw = <T>{};
		this._unsupportedKeys = [];
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		for (let key in raw) {
			if (this.isNotExecutable(key, configurationProperties)) {
				processedRaw[key] = raw[key];
			} else {
				this._unsupportedKeys.push(key);
			}
		}
		return super.processRaw(processedRaw);
	}

	public reprocess(): void {
		this.processRaw(this._raw);
	}

	public get unsupportedKeys(): string[] {
		return this._unsupportedKeys || [];
	}

	private isNotExecutable(key: string, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema }): boolean {
		const propertySchema = configurationProperties[key];
		if (!propertySchema) {
			return true; // Unknown propertis are ignored from checks
		}
		return !propertySchema.isExecutable;
	}

	public createWorkspaceConfigurationModel(): ConfigurationModel<any> {
		return this.createScopedConfigurationModel(ConfigurationScope.WINDOW);
	}

	public createFolderScopedConfigurationModel(): ConfigurationModel<any> {
		return this.createScopedConfigurationModel(ConfigurationScope.RESOURCE);
	}

	private createScopedConfigurationModel(scope: ConfigurationScope): ConfigurationModel<any> {
		const workspaceRaw = <T>{};
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

export class FolderConfigurationModel<T> extends CustomConfigurationModel<T> {

	constructor(public readonly workspaceSettingsConfig: FolderSettingsModel<T>, private scopedConfigs: ScopedConfigurationModel<T>[], private scope: ConfigurationScope) {
		super();
		this.consolidate();
	}

	private consolidate(): void {
		this._contents = <T>{};
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

export class Configuration<T> extends BaseConfiguration<T> {

	constructor(defaults: ConfigurationModel<T>, user: ConfigurationModel<T>, workspaceConfiguration: ConfigurationModel<T>, protected folders: StrictResourceMap<FolderConfigurationModel<T>>, workspace: Workspace) {
		super(defaults, user, workspaceConfiguration, folders, workspace);
	}

	updateDefaultConfiguration(defaults: ConfigurationModel<T>): void {
		this._defaults = defaults;
		this.merge();
	}

	updateUserConfiguration(user: ConfigurationModel<T>): string[] {
		let changedKeys = [];
		const { added, updated, removed } = compare(this._user, user);
		changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			const oldConfiguartion = new Configuration(this._defaults, this._user, this._workspaceConfiguration, this.folders, this._workspace);

			this._user = user;
			this.merge();

			changedKeys = changedKeys.filter(key => !equals(oldConfiguartion.getValue2(key), this.getValue2(key)));
			return changedKeys;
		}
		return [];
	}

	updateWorkspaceConfiguration(workspaceConfiguration: ConfigurationModel<T>): string[] {
		let changedKeys = [];
		const { added, updated, removed } = compare(this._workspaceConfiguration, workspaceConfiguration);
		changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			const oldConfiguartion = new Configuration(this._defaults, this._user, this._workspaceConfiguration, this.folders, this._workspace);

			this._workspaceConfiguration = workspaceConfiguration;
			this.merge();

			changedKeys = changedKeys.filter(key => !equals(oldConfiguartion.getValue2(key), this.getValue2(key)));
			return changedKeys;
		}
		return [];
	}

	updateFolderConfiguration(resource: URI, configuration: FolderConfigurationModel<T>): string[] {
		const currentFolderConfiguration = this.folders.get(resource);

		if (currentFolderConfiguration) {
			let changedKeys = [];
			const { added, updated, removed } = compare(currentFolderConfiguration, configuration);
			changedKeys = [...added, ...updated, ...removed];
			if (changedKeys.length) {
				const oldConfiguartion = new Configuration(this._defaults, this._user, this._workspaceConfiguration, this.folders, this._workspace);

				this.folders.set(resource, configuration);
				this.mergeFolder(resource);

				changedKeys = changedKeys.filter(key => !equals(oldConfiguartion.getValue2(key, { resource }), this.getValue2(key, { resource })));
				return changedKeys;
			}
			return [];
		}

		this.folders.set(resource, configuration);
		this.mergeFolder(resource);
		return configuration.keys;
	}

	deleteFolderConfiguration(folder: URI): string[] {
		if (this._workspace && this._workspace.folders.length > 0 && this._workspace.folders[0].uri.toString() === folder.toString()) {
			// Do not remove workspace configuration
			return [];
		}

		const keys = this.folders.get(folder).keys;
		this.folders.delete(folder);
		this._foldersConsolidatedConfigurations.delete(folder);
		return keys;
	}

	getFolderConfigurationModel(folder: URI): FolderConfigurationModel<T> {
		return <FolderConfigurationModel<T>>this.folders.get(folder);
	}
}