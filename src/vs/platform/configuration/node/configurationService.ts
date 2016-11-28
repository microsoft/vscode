/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import { getDefaultValues, toValuesTree, getConfigurationKeys } from 'vs/platform/configuration/common/model';
import { ConfigWatcher } from 'vs/base/node/config';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { ConfigurationSource, IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, getConfigurationValue, IConfigurationKeys } from 'vs/platform/configuration/common/configuration';
import Event, { Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

interface ICache<T> {
	defaults: T;
	user: T;
	consolidated: T;
}

export class ConfigurationService<T> implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private disposables: IDisposable[];

	private rawConfig: ConfigWatcher<T>;
	private cache: ICache<T>;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent>;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.disposables = [];

		this._onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent>();
		this.disposables.push(this._onDidUpdateConfiguration);

		this.rawConfig = new ConfigWatcher(environmentService.appSettingsPath, { changeBufferDelay: 300, defaultConfig: Object.create(null) });
		this.disposables.push(toDisposable(() => this.rawConfig.dispose()));

		// Listeners
		this.disposables.push(this.rawConfig.onDidUpdateConfiguration(() => this.onConfigurationChange(ConfigurationSource.User)));
		this.disposables.push(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(() => this.onConfigurationChange(ConfigurationSource.Default)));
	}

	private onConfigurationChange(source: ConfigurationSource): void {
		this.cache = void 0; // reset our caches

		const cache = this.getCache();

		this._onDidUpdateConfiguration.fire({
			config: this.getConfiguration(),
			source,
			sourceConfig: source === ConfigurationSource.Default ? cache.defaults : cache.user
		});
	}

	public get onDidUpdateConfiguration(): Event<IConfigurationServiceEvent> {
		return this._onDidUpdateConfiguration.event;
	}

	public reloadConfiguration<C>(section?: string): TPromise<C> {
		return new TPromise<C>(c => {
			this.rawConfig.reload(() => {
				this.cache = void 0; // reset our caches

				c(this.getConfiguration<C>(section));
			});
		});
	}

	public getConfiguration<C>(section?: string): C {
		const cache = this.getCache();

		return section ? cache.consolidated[section] : cache.consolidated;
	}

	private getCache(): ICache<T> {
		return this.cache || (this.cache = this.consolidateConfigurations());
	}

	public lookup<C>(key: string): IConfigurationValue<C> {
		const cache = this.getCache();

		// make sure to clone the configuration so that the receiver does not tamper with the values
		return {
			default: objects.clone(getConfigurationValue<C>(cache.defaults, key)),
			user: objects.clone(getConfigurationValue<C>(cache.user, key)),
			value: objects.clone(getConfigurationValue<C>(cache.consolidated, key))
		};
	}

	public keys(): IConfigurationKeys {
		return {
			default: getConfigurationKeys(),
			user: Object.keys(this.rawConfig.getConfig())
		};
	}

	private consolidateConfigurations(): ICache<T> {
		const defaults = getDefaultValues();				// defaults coming from contributions to registries
		const user = toValuesTree(this.rawConfig.getConfig());	// user configured settings

		const consolidated = objects.mixin(
			objects.clone(defaults), 	// target: default values (but dont modify!)
			user,						// source: user settings
			true						// overwrite
		);

		return { defaults, user, consolidated };
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}