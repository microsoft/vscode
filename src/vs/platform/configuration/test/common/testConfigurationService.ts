/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TernarySearchTree } from 'vs/base/common/map';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { getConfigurationKeys, IConfigurationOverrides, IConfigurationService, getConfigurationValue, isConfigurationOverrides } from 'vs/platform/configuration/common/configuration';

export class TestConfigurationService implements IConfigurationService {
	public _serviceBrand: any;

	private configuration = Object.create(null);

	private configurationByRoot: TernarySearchTree<any> = TernarySearchTree.forPaths<any>();

	public reloadConfiguration<T>(): TPromise<T> {
		return TPromise.as(this.getValue());
	}

	public getValue(arg1?: any, arg2?: any): any {
		if (arg1 && typeof arg1 === 'string') {
			return this.inspect(<string>arg1).value;
		}
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : void 0;
		if (overrides && overrides.resource) {
			const configForResource = this.configurationByRoot.findSubstr(overrides.resource.fsPath);
			return configForResource || this.configuration;
		}
		return this.configuration;
	}

	public updateValue(key: string, overrides?: IConfigurationOverrides): TPromise<void> {
		return TPromise.as(null);
	}

	public setUserConfiguration(key: any, value: any, root?: URI): Thenable<void> {
		if (root) {
			const configForRoot = this.configurationByRoot.get(root.fsPath) || Object.create(null);
			configForRoot[key] = value;
			this.configurationByRoot.set(root.fsPath, configForRoot);
		} else {
			this.configuration[key] = value;
		}

		return TPromise.as(null);
	}

	public onDidChangeConfiguration() {
		return { dispose() { } };
	}

	public inspect<T>(key: string, overrides?: IConfigurationOverrides): {
		default: T,
		user: T,
		workspace: T,
		workspaceFolder: T
		value: T,
	} {
		const config = this.getValue(undefined, overrides);

		return {
			value: getConfigurationValue<T>(config, key),
			default: getConfigurationValue<T>(config, key),
			user: getConfigurationValue<T>(config, key),
			workspace: null,
			workspaceFolder: null
		};
	}

	public keys() {
		return {
			default: getConfigurationKeys(),
			user: Object.keys(this.configuration),
			workspace: [],
			workspaceFolder: []
		};
	}

	public getConfigurationData() {
		return null;
	}
}
