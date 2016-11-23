/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { getConfigurationKeys } from 'vs/platform/configuration/common/model';
import { IConfigurationService, getConfigurationValue, IConfigurationValue, IConfigurationKeys } from 'vs/platform/configuration/common/configuration';

export class TestConfigurationService extends EventEmitter implements IConfigurationService {
	public _serviceBrand: any;

	private configuration = Object.create(null);

	public reloadConfiguration<T>(section?: string): TPromise<T> {
		return TPromise.as(this.getConfiguration());
	}

	public getConfiguration(): any {
		return this.configuration;
	}

	public setUserConfiguration(key: any, value: any): Thenable<void> {
		this.configuration[key] = value;
		return TPromise.as(null);
	}

	public onDidUpdateConfiguration() {
		return { dispose() { } };
	}

	public lookup<C>(key: string): IConfigurationValue<C> {
		return {
			value: getConfigurationValue<C>(this.getConfiguration(), key),
			default: getConfigurationValue<C>(this.getConfiguration(), key),
			user: getConfigurationValue<C>(this.getConfiguration(), key)
		};
	}

	public keys(): IConfigurationKeys {
		return {
			default: getConfigurationKeys(),
			user: Object.keys(this.configuration)
		};
	}
}
