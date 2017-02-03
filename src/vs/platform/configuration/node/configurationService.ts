/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import { ConfigWatcher } from 'vs/base/node/config';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ConfigurationSource, IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, getConfigurationValue, IConfigurationKeys, IConfigModel, IConfigurationOptions } from 'vs/platform/configuration/common/configuration';
import { ConfigModel, DefaultConfigModel } from 'vs/platform/configuration/common/model';
import Event, { Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export interface ICache<T> {
	defaults: IConfigModel<T>;
	user: IConfigModel<T>;
	consolidated: IConfigModel<any>;
}

export class ConfigurationService<T> extends Disposable implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private cache: ICache<T>;
	private userConfigModelWatcher: ConfigWatcher<IConfigModel<T>>;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.userConfigModelWatcher = new ConfigWatcher(environmentService.appSettingsPath, {
			changeBufferDelay: 300, defaultConfig: new ConfigModel<T>(null, environmentService.appSettingsPath), parse: (content: string, parseErrors: any[]) => {
				const userConfigModel = new ConfigModel<T>(content, environmentService.appSettingsPath);
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
		this.cache = void 0; // reset our caches

		const cache = this.getCache();

		this._onDidUpdateConfiguration.fire({
			config: this.getConfiguration(),
			source,
			sourceConfig: source === ConfigurationSource.Default ? cache.defaults.contents : cache.user.contents
		});
	}

	public reloadConfiguration<C>(section?: string): TPromise<C> {
		return new TPromise<C>(c => {
			this.userConfigModelWatcher.reload(() => {
				this.cache = void 0; // reset our caches

				c(this.getConfiguration<C>(section));
			});
		});
	}

	public getConfiguration<C>(section?: string): C
	public getConfiguration<C>(options?: IConfigurationOptions): C
	public getConfiguration<C>(arg?: any): C {
		const options = this.toOptions(arg);
		const cache = this.getCache();
		const configModel = options.overrideIdentifier ? cache.consolidated.configWithOverrides<C>(options.overrideIdentifier) : cache.consolidated;
		return options.section ? configModel.config<C>(options.section).contents : configModel.contents;
	}

	public lookup<C>(key: string, overrideIdentifier?: string): IConfigurationValue<C> {
		const cache = this.getCache();

		// make sure to clone the configuration so that the receiver does not tamper with the values
		return {
			default: objects.clone(getConfigurationValue<C>(overrideIdentifier ? cache.defaults.configWithOverrides(overrideIdentifier).contents : cache.defaults.contents, key)),
			user: objects.clone(getConfigurationValue<C>(overrideIdentifier ? cache.user.configWithOverrides(overrideIdentifier).contents : cache.user.contents, key)),
			value: objects.clone(getConfigurationValue<C>(overrideIdentifier ? cache.consolidated.configWithOverrides(overrideIdentifier).contents : cache.consolidated.contents, key))
		};
	}

	public keys(): IConfigurationKeys {
		const cache = this.getCache();

		return {
			default: cache.defaults.keys,
			user: cache.user.keys
		};
	}

	public getCache(): ICache<T> {
		return this.cache || (this.cache = this.consolidateConfigurations());
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

	private consolidateConfigurations(): ICache<T> {
		const defaults = new DefaultConfigModel<T>();
		const user = this.userConfigModelWatcher.getConfig();
		const consolidated = defaults.merge(user);
		return { defaults, user, consolidated };
	}
}