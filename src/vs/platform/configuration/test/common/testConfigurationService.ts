/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TrieMap } from 'vs/base/common/map';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { getConfigurationKeys } from 'vs/platform/configuration/common/model';
import { IConfigurationOverrides, IConfigurationService, getConfigurationValue, IConfigurationValue, IConfigurationKeys, IConfigurationValues, IConfigurationData, Configuration, ConfigurationModel } from 'vs/platform/configuration/common/configuration';

export class TestConfigurationService extends EventEmitter implements IConfigurationService {
	public _serviceBrand: any;

	private configuration = Object.create(null);

	private configurationByRoot: TrieMap<any> = new TrieMap<any>();

	public reloadConfiguration<T>(section?: string): TPromise<T> {
		return TPromise.as(this.getConfiguration());
	}

	public getConfiguration(section?: string, overrides?: IConfigurationOverrides): any {
		if (overrides && overrides.resource) {
			const configForResource = this.configurationByRoot.findSubstr(overrides.resource.fsPath);
			return configForResource || this.configuration;
		}

		return this.configuration;
	}

	public getConfigurationData(): IConfigurationData<any> {
		return new Configuration(new ConfigurationModel(), new ConfigurationModel(this.configuration)).toData();
	}

	public setUserConfiguration(key: any, value: any, root?: URI): Thenable<void> {
		if (root) {
			const configForRoot = this.configurationByRoot.lookUp(root.fsPath) || Object.create(null);
			configForRoot[key] = value;
			this.configurationByRoot.insert(root.fsPath, configForRoot);
		} else {
			this.configuration[key] = value;
		}

		return TPromise.as(null);
	}

	public onDidUpdateConfiguration() {
		return { dispose() { } };
	}

	public lookup<C>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<C> {
		const config = this.getConfiguration(undefined, overrides);

		return {
			value: getConfigurationValue<C>(config, key),
			default: getConfigurationValue<C>(config, key),
			user: getConfigurationValue<C>(config, key),
			workspace: null,
			folder: null
		};
	}

	public keys(): IConfigurationKeys {
		return {
			default: getConfigurationKeys(),
			user: Object.keys(this.configuration),
			workspace: [],
			folder: []
		};
	}

	public values(): IConfigurationValues {
		return {};
	}
}
