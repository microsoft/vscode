/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import { getDefaultValues, flatten } from 'vs/platform/configuration/common/model';
import { ConfigWatcher } from 'vs/base/node/config';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, getConfigurationValue } from 'vs/platform/configuration/common/configuration';
import Event, { Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class ConfigurationService<T> implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private disposables: IDisposable[];

	private rawConfig: ConfigWatcher<T>;
	private cache: T;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent>;

	private _telemetryService: ITelemetryService;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.disposables = [];

		this._onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent>();
		this.disposables.push(this._onDidUpdateConfiguration);

		this.rawConfig = new ConfigWatcher(environmentService.appSettingsPath, { changeBufferDelay: 300, defaultConfig: Object.create(null) });
		this.disposables.push(toDisposable(() => this.rawConfig.dispose()));

		// Listeners
		this.disposables.push(this.rawConfig.onDidUpdateConfiguration(event => {
			this.onConfigurationChange();
			if (this._telemetryService) {
				this._telemetryService.publicLog('updateUserConfiguration', { userConfigurationKeys: Object.keys(event.config) });
			}
		}));
		this.disposables.push(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(() => this.onConfigurationChange()));
	}

	private onConfigurationChange(): void {
		this.cache = void 0; // reset our caches

		this._onDidUpdateConfiguration.fire({ config: this.getConfiguration() });
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
		let consolidatedConfig = this.cache;
		if (!consolidatedConfig) {
			consolidatedConfig = this.getConsolidatedConfig();
			this.cache = consolidatedConfig;
		}

		return section ? consolidatedConfig[section] : consolidatedConfig;
	}

	public lookup<C>(key: string): IConfigurationValue<C> {
		// make sure to clone the configuration so that the receiver does not tamper with the values
		return {
			default: objects.clone(getConfigurationValue<C>(getDefaultValues(), key)),
			user: objects.clone(getConfigurationValue<C>(flatten(this.rawConfig.getConfig()), key)),
			value: objects.clone(getConfigurationValue<C>(this.getConfiguration(), key))
		};
	}

	private getConsolidatedConfig(): T {
		const defaults = getDefaultValues();				// defaults coming from contributions to registries
		const user = flatten(this.rawConfig.getConfig());	// user configured settings

		return objects.mixin(
			objects.clone(defaults), 	// target: default values (but dont modify!)
			user,						// source: user settings
			true						// overwrite
		);
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}

	public set telemetryService(value: ITelemetryService) {
		this._telemetryService = value;
	}
}