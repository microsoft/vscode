/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, getConfigurationValue, IConfigurationKeys } from "vs/platform/configuration/common/configuration";
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from "vs/base/common/winjs.base";

export class NullConfigurationService implements IConfigurationService {

	_serviceBrand: any;

	private _onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent>();
	public onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	private _config: any;

	constructor() {
		this._config = Object.create(null);
	}

	public getConfiguration<T>(section?: any): T {
		return this._config;
	}

	public reloadConfiguration<T>(section?: string): TPromise<T> {
		return TPromise.as<T>(this.getConfiguration<T>(section));
	}

	public lookup<C>(key: string): IConfigurationValue<C> {
		return {
			value: getConfigurationValue<C>(this.getConfiguration(), key),
			default: getConfigurationValue<C>(this.getConfiguration(), key),
			user: getConfigurationValue<C>(this.getConfiguration(), key)
		};
	}

	public keys(): IConfigurationKeys {
		return { default: [], user: [] };
	}
}