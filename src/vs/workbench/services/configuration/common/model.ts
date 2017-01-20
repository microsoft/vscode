/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ConfigModel } from 'vs/platform/configuration/common/model';
import { IConfigModel } from 'vs/platform/configuration/common/configuration';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';

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

export class WorkspaceConfigModel<T> extends ConfigModel<T> {

	constructor(private workspaceSettingsConfig: IConfigModel<T>, private scopedConfigs: ScopedConfigModel<T>[]) {
		super(null);
		this.consolidate();
	}

	private consolidate(): void {
		let result = new ConfigModel<T>(null).merge(this.workspaceSettingsConfig);
		for (const configModel of this.scopedConfigs) {
			result = result.merge(configModel);
		}
		this._contents = result.contents;
		this._overrides = result.overrides;
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
}