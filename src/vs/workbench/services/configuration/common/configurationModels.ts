/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ConfigModel } from 'vs/platform/configuration/common/model';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, IConfigurationPropertySchema, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

export class ScopedConfigModel<T> extends ConfigModel<T> {

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

export class WorkspaceSettingsConfigModel<T> extends ConfigModel<T> {

	private _raw: T;
	private _unsupportedKeys: string[];

	protected processRaw(raw: T): void {
		this._raw = raw;
		const processedRaw = <T>{};
		this._unsupportedKeys = [];
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		for (let key in raw) {
			if (this.isWorkspaceScoped(key, configurationProperties)) {
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
		return this._unsupportedKeys;
	}

	private isWorkspaceScoped(key: string, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema }): boolean {
		const propertySchema = configurationProperties[key];
		if (!propertySchema) {
			return true; // Unknown propertis are ignored from checks
		}
		return !propertySchema.isExecutable;
	}
}

export class WorkspaceConfigModel<T> extends ConfigModel<T> {

	constructor(public readonly workspaceSettingsConfig: WorkspaceSettingsConfigModel<T>, private scopedConfigs: ScopedConfigModel<T>[]) {
		super(null);
		this.consolidate();
	}

	private consolidate(): void {
		this._contents = <T>{};
		this._overrides = [];

		this.doMerge(this, this.workspaceSettingsConfig);
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