/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ConfigWatcher } from 'vs/base/node/config';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ConfigurationSource, IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, IConfigurationKeys, ConfigurationModel, IConfigurationOptions, ConfigurationData, IConfigurationValues } from 'vs/platform/configuration/common/configuration';
import { CustomConfigurationModel, DefaultConfigurationModel } from 'vs/platform/configuration/common/model';
import Event, { Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class ConfigurationService<T> extends Disposable implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private _configuration: ConfigurationData<T>;
	private userConfigModelWatcher: ConfigWatcher<ConfigurationModel<T>>;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.userConfigModelWatcher = new ConfigWatcher(environmentService.appSettingsPath, {
			changeBufferDelay: 300, defaultConfig: new CustomConfigurationModel<T>(null, environmentService.appSettingsPath), parse: (content: string, parseErrors: any[]) => {
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

	private onConfigurationChange(source: ConfigurationSource): void {
		this.reset(); // reset our caches

		const cache = this.getConfigurationData();

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

	public getConfiguration<C>(section?: string): C
	public getConfiguration<C>(options?: IConfigurationOptions): C
	public getConfiguration<C>(arg?: any): C {
		return this.getConfigurationData().getValue<C>(this.toOptions(arg));
	}

	public lookup<C>(key: string, overrideIdentifier?: string): IConfigurationValue<C> {
		return this.getConfigurationData().lookup<C>(key, overrideIdentifier);
	}

	public keys(): IConfigurationKeys {
		return this.getConfigurationData().keys();
	}

	public values<V>(): IConfigurationValues {
		return this._configuration.values();
	}

	public getConfigurationData(): ConfigurationData<T> {
		return this._configuration || (this._configuration = this.consolidateConfigurations());
	}

	private reset(): void {
		this._configuration = this.consolidateConfigurations();
	}

	private toOptions(arg: any): IConfigurationOptions {
		if (typeof arg === 'string') {
			return { section: arg };
		}
		if (typeof arg === 'object') {
			return arg;
		}
		return {};
	}

	private consolidateConfigurations(): ConfigurationData<T> {
		const defaults = new DefaultConfigurationModel<T>();
		const user = this.userConfigModelWatcher.getConfig();
		return new ConfigurationData(defaults, user);
	}
}