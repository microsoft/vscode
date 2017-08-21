/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { clone } from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { distinct } from 'vs/base/common/arrays';
import { CustomConfigurationModel, toValuesTree } from 'vs/platform/configuration/common/model';
import { ConfigurationModel } from 'vs/platform/configuration/common/configuration';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, IConfigurationPropertySchema, Extensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';

export class WorkspaceConfigurationModel<T> extends CustomConfigurationModel<T> {

	private _raw: T;
	private _folders: URI[];
	private _worksapaceSettings: ConfigurationModel<T>;
	private _tasksConfiguration: ConfigurationModel<T>;
	private _launchConfiguration: ConfigurationModel<T>;
	private _workspaceConfiguration: ConfigurationModel<T>;

	public update(content: string): void {
		super.update(content);
		this._worksapaceSettings = new ConfigurationModel(this._worksapaceSettings.contents, this._worksapaceSettings.keys, this.overrides);
		this._workspaceConfiguration = this.consolidate();
	}

	get id(): string {
		return this._raw['id'];
	}

	get folders(): URI[] {
		return this._folders;
	}

	get workspaceConfiguration(): ConfigurationModel<T> {
		return this._workspaceConfiguration;
	}

	protected processRaw(raw: T): void {
		this._raw = raw;

		this._folders = this.parseFolders();
		this._worksapaceSettings = this.parseConfigurationModel('settings');
		this._tasksConfiguration = this.parseConfigurationModel('tasks');
		this._launchConfiguration = this.parseConfigurationModel('launch');

		super.processRaw(raw);
	}

	private parseFolders(): URI[] {
		const folders: string[] = this._raw['folders'] || [];
		return distinct(folders.map(folder => URI.parse(folder))
			.filter(r => r.scheme === Schemas.file), folder => folder.toString(true)); // only support files for now
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