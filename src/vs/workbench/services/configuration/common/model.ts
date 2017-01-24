/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ConfigModel } from 'vs/platform/configuration/common/model';
import { IWorkspaceTrust, WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';

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

export class TrustedWorkspaceSettingsConfigModel<T> extends ConfigModel<T> {

	private _untrustedKeys: string[] = [];

	constructor(content: string, name: string = '', private workspaceTrust: IWorkspaceTrust = null) {
		super(null, name);
		if (content) {
			this.update(content);
		}
	}

	protected filterRaw(raw: any): { newRaw: any; removals: any } {
		this._untrustedKeys = [];
		let allUntrustedKeys = {};
		if (this.workspaceTrust && !this.workspaceTrust.isTrusted()) {
			allUntrustedKeys = this.workspaceTrust.allKnownConfigKeysForExecutables();
		}

		let trustedProperties: any = {};
		for (let property in raw) {
			if (!allUntrustedKeys[property]) {
				trustedProperties[property] = raw[property];
			} else {
				this._untrustedKeys.push(property);
			}
		}
		return trustedProperties;
	}

	public get untrustedKeys(): string[] {
		return this._untrustedKeys;
	}
}

export class WorkspaceConfigModel<T> extends ConfigModel<T> {

	constructor(private workspaceSettingsConfig: TrustedWorkspaceSettingsConfigModel<T>, private scopedConfigs: ScopedConfigModel<T>[]) {
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

	public refilter(): void {
		this.workspaceSettingsConfig.refilter();
		this.scopedConfigs.forEach(scopedConfigModel => {
			scopedConfigModel.refilter();
		});
		this.consolidate();
	}

	public get untrustedKeys(): string[] {
		return this.workspaceSettingsConfig.untrustedKeys;
	}
}