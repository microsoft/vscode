/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService, IConfigurationChangeEvent, IConfigurationOverrides, ConfigurationTarget, compare, isConfigurationOverrides, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { DefaultConfigurationModel, Configuration, ConfigurationChangeEvent, ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { Event, Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { UserConfiguration } from 'vs/platform/configuration/node/configuration';

export class ConfigurationService extends Disposable implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private _configuration: Configuration;
	private userConfiguration: UserConfiguration;

	private readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.userConfiguration = this._register(new UserConfiguration(environmentService.appSettingsPath));

		// Initialize
		const defaults = new DefaultConfigurationModel();
		const user = this.userConfiguration.initializeSync();
		this._configuration = new Configuration(defaults, user);

		// Listeners
		this._register(this.userConfiguration.onDidChangeConfiguration(userConfigurationModel => this.onDidChangeUserConfiguration(userConfigurationModel)));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(configurationProperties => this.onDidRegisterConfiguration(configurationProperties)));
	}

	get configuration(): Configuration {
		return this._configuration;
	}

	getConfigurationData(): IConfigurationData {
		return this.configuration.toData();
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
		return this.configuration.getValue(section, overrides, null);
	}

	updateValue(key: string, value: any): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): Promise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, arg3?: any, arg4?: any): Promise<void> {
		return Promise.reject(new Error('not supported'));
	}

	inspect<T>(key: string): {
		default: T,
		user: T,
		workspace?: T,
		workspaceFolder?: T
		value: T
	} {
		return this.configuration.inspect<T>(key, {}, null);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this.configuration.keys(null);
	}

	reloadConfiguration(folder?: IWorkspaceFolder): Promise<void> {
		return folder ? Promise.resolve(undefined) :
			this.userConfiguration.reload().then(userConfigurationModel => this.onDidChangeUserConfiguration(userConfigurationModel));
	}

	private onDidChangeUserConfiguration(userConfigurationModel: ConfigurationModel): void {
		const { added, updated, removed } = compare(this._configuration.user, userConfigurationModel);
		const changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			this._configuration.updateUserConfiguration(userConfigurationModel);
			this.trigger(changedKeys, ConfigurationTarget.USER);
		}
	}

	private onDidRegisterConfiguration(keys: string[]): void {
		this._configuration.updateDefaultConfiguration(new DefaultConfigurationModel());
		this.trigger(keys, ConfigurationTarget.DEFAULT);
	}

	private trigger(keys: string[], source: ConfigurationTarget): void {
		this._onDidChangeConfiguration.fire(new ConfigurationChangeEvent().change(keys).telemetryData(source, this.getTargetConfiguration(source)));
	}

	private getTargetConfiguration(target: ConfigurationTarget): any {
		switch (target) {
			case ConfigurationTarget.DEFAULT:
				return this._configuration.defaults.contents;
			case ConfigurationTarget.USER:
				return this._configuration.user.contents;
		}
		return {};
	}
}