/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TernarySearchTree } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { getConfigurationKeys, IConfigurationOverrides, IConfigurationService, getConfigurationValue, isConfigurationOverrides } from 'vs/platform/configuration/common/configuration';

export class TestConfigurationService implements IConfigurationService {
	public _serviceBrand: any;

	private configuration = Object.create(null);

	private configurationByRoot: TernarySearchTree<any> = TernarySearchTree.forPaths<any>();

	public reloadConfiguration<T>(): Promise<T> {
		return Promise.resolve(this.getValue());
	}

	public getValue(arg1?: any, arg2?: any): any {
		let configuration;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
		if (overrides) {
			if (overrides.resource) {
				configuration = this.configurationByRoot.findSubstr(overrides.resource.fsPath);
			}
		}
		configuration = configuration ? configuration : this.configuration;
		if (arg1 && typeof arg1 === 'string') {
			return getConfigurationValue(configuration, arg1);
		}
		return configuration;
	}

	public updateValue(key: string, overrides?: IConfigurationOverrides): Promise<void> {
		return Promise.resolve(undefined);
	}

	public setUserConfiguration(key: any, value: any, root?: URI): Promise<void> {
		if (root) {
			const configForRoot = this.configurationByRoot.get(root.fsPath) || Object.create(null);
			configForRoot[key] = value;
			this.configurationByRoot.set(root.fsPath, configForRoot);
		} else {
			this.configuration[key] = value;
		}

		return Promise.resolve(undefined);
	}

	public onDidChangeConfiguration() {
		return { dispose() { } };
	}

	public inspect<T>(key: string, overrides?: IConfigurationOverrides): {
		default: T,
		user: T,
		workspace?: T,
		workspaceFolder?: T
		value: T,
	} {
		const config = this.getValue(undefined, overrides);

		return {
			value: getConfigurationValue<T>(config, key),
			default: getConfigurationValue<T>(config, key),
			user: getConfigurationValue<T>(config, key),
			workspace: undefined,
			workspaceFolder: undefined
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
