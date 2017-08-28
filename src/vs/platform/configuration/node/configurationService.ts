/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ConfigWatcher } from 'vs/base/node/config';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ConfigurationSource, IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, IConfigurationKeys, ConfigurationModel, IConfigurationOverrides, Configuration, IConfigurationValues, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { CustomConfigurationModel, DefaultConfigurationModel } from 'vs/platform/configuration/common/model';
import Event, { Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { onUnexpectedError } from 'vs/base/common/errors';

export class ConfigurationService<T> extends Disposable implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private _configuration: Configuration<T>;
	private userConfigModelWatcher: ConfigWatcher<ConfigurationModel<T>>;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.userConfigModelWatcher = new ConfigWatcher(environmentService.appSettingsPath, {
			changeBufferDelay: 300, onError: error => onUnexpectedError(error), defaultConfig: new CustomConfigurationModel<T>(null, environmentService.appSettingsPath), parse: (content: string, parseErrors: any[]) => {
				const userConfigModel = new CustomConfigurationModel<T>(content, environmentService.appSettingsPath);
				parseErrors = [...userConfigModel.errors];
				return userConfigModel;
			}
		});
		this._register(toDisposable(() => this.userConfigModelWatcher.dispose()));

		// Listeners
		this._register(this.userConfigModelWatcher.onDidUpdateConfiguration(() => this.onConfigurationChange(ConfigurationSource.User)));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(() => this.onConfigurationChange(ConfigurationSource.Default)));
	}

	public configuration(): Configuration<any> {
		return this._configuration || (this._configuration = this.consolidateConfigurations());
	}

	private onConfigurationChange(source: ConfigurationSource): void {
		this.reset(); // reset our caches

		const cache = this.configuration();

		this._onDidUpdateConfiguration.fire({
			source,
			sourceConfig: source === ConfigurationSource.Default ? cache.defaults.contents : cache.user.contents
		});
	}

	public reloadConfiguration<C>(section?: string): TPromise<C> {
		return new TPromise<C>(c => {
			this.userConfigModelWatcher.reload(() => {
				this.reset(); // reset our caches
				c(this.getConfiguration<C>(section));
			});
		});
	}

	public getConfiguration<C>(section?: string, options?: IConfigurationOverrides): C {
		return this.configuration().getValue<C>(section, options);
	}

	public lookup<C>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<C> {
		return this.configuration().lookup<C>(key, overrides);
	}

	public keys(overrides?: IConfigurationOverrides): IConfigurationKeys {
		return this.configuration().keys(overrides);
	}

	public values<V>(): IConfigurationValues {
		return this._configuration.values();
	}

	public getConfigurationData<T2>(): IConfigurationData<T2> {
		return this.configuration().toData();
	}

	private reset(): void {
		this._configuration = this.consolidateConfigurations();
	}

	private consolidateConfigurations(): Configuration<T> {
		const defaults = new DefaultConfigurationModel<T>();
		const user = this.userConfigModelWatcher.getConfig();
		return new Configuration(defaults, user);
	}
}