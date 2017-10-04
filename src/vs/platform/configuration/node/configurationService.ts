/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ConfigWatcher } from 'vs/base/node/config';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService, IConfigurationServiceEvent, IConfigurationOverrides, IConfiguration } from 'vs/platform/configuration/common/configuration2';
import { ConfigurationModel, Configuration } from 'vs/platform/configuration/common/configuration';
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
		this._register(this.userConfigModelWatcher);

		// Listeners
		this._register(this.userConfigModelWatcher.onDidUpdateConfiguration(() => this.onDidUpdateConfigModel()));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(configurationNodes => this.onDidRegisterConfiguration(configurationNodes)));
	}

	public get configuration(): Configuration<any> {
		return this._configuration || (this._configuration = this.consolidateConfigurations());
	}

	private onDidUpdateConfigModel(): void {
		// get the diff
		// reset and trigger
		this.onConfigurationChange([], []);
	}

	private onDidRegisterConfiguration(configurations: IConfigurationNode[]): void {
		// get the diff
		// reset and trigger
		this.onConfigurationChange([], []);
	}

	private onConfigurationChange(sections: string[], keys: string[]): void {
		this.reset(); // reset our caches

		this._onDidUpdateConfiguration.fire({ sections, keys });
	}

	public getConfiguration(section?: string, options?: IConfigurationOverrides): IConfiguration {
		return this.configuration.getValue(section, options);
	}

	public inspect<T>(key: string): {
		default: T,
		user: T,
		workspace: T,
		workspaceFolder: T
		value: T
	} {
		return this.configuration.lookup<T>(key);
	}

	public keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this.configuration.keys();
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