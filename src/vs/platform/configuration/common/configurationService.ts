/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { extUriBiasedIgnorePathCase } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget, IConfigurationChange, IConfigurationChangeEvent, IConfigurationData, IConfigurationOverrides, IConfigurationService, IConfigurationValue, isConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { Configuration, ConfigurationChangeEvent, ConfigurationModel, UserSettings } from 'vs/platform/configuration/common/configurationModels';
import { DefaultConfiguration, IPolicyConfiguration, NullPolicyConfiguration, PolicyConfiguration } from 'vs/platform/configuration/common/configurations';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IPolicyService, NullPolicyService } from 'vs/platform/policy/common/policy';

export class ConfigurationService extends Disposable implements IConfigurationService, IDisposable {

	declare readonly _serviceBrand: undefined;

	private configuration: Configuration;
	private readonly defaultConfiguration: DefaultConfiguration;
	private readonly policyConfiguration: IPolicyConfiguration;
	private readonly userConfiguration: UserSettings;
	private readonly reloadConfigurationScheduler: RunOnceScheduler;

	private readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	constructor(
		private readonly settingsResource: URI,
		fileService: IFileService,
		policyService: IPolicyService,
		logService: ILogService,
	) {
		super();
		this.defaultConfiguration = this._register(new DefaultConfiguration());
		this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
		this.userConfiguration = this._register(new UserSettings(this.settingsResource, {}, extUriBiasedIgnorePathCase, fileService));
		this.configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, new ConfigurationModel(), new ConfigurationModel());

		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reloadConfiguration(), 50));
		this._register(this.defaultConfiguration.onDidChangeConfiguration(({ defaults, properties }) => this.onDidDefaultConfigurationChange(defaults, properties)));
		this._register(this.policyConfiguration.onDidChangeConfiguration(model => this.onDidPolicyConfigurationChange(model)));
		this._register(this.userConfiguration.onDidChange(() => this.reloadConfigurationScheduler.schedule()));
	}

	async initialize(): Promise<void> {
		const [defaultModel, policyModel, userModel] = await Promise.all([this.defaultConfiguration.initialize(), this.policyConfiguration.initialize(), this.userConfiguration.loadConfiguration()]);
		this.configuration = new Configuration(defaultModel, policyModel, new ConfigurationModel(), userModel);
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
		return this.configuration.getValue(section, overrides, undefined);
	}

	updateValue(key: string, value: any): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): Promise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, arg3?: any, arg4?: any): Promise<void> {
		return Promise.reject(new Error('not supported'));
	}

	inspect<T>(key: string): IConfigurationValue<T> {
		return this.configuration.inspect<T>(key, {}, undefined);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this.configuration.keys(undefined);
	}

	async reloadConfiguration(): Promise<void> {
		const configurationModel = await this.userConfiguration.loadConfiguration();
		this.onDidChangeUserConfiguration(configurationModel);
	}

	private onDidChangeUserConfiguration(userConfigurationModel: ConfigurationModel): void {
		const previous = this.configuration.toData();
		const change = this.configuration.compareAndUpdateLocalUserConfiguration(userConfigurationModel);
		this.trigger(change, previous, ConfigurationTarget.USER);
	}

	private onDidDefaultConfigurationChange(defaultConfigurationModel: ConfigurationModel, properties: string[]): void {
		const previous = this.configuration.toData();
		const change = this.configuration.compareAndUpdateDefaultConfiguration(defaultConfigurationModel, properties);
		this.trigger(change, previous, ConfigurationTarget.DEFAULT);
	}

	private onDidPolicyConfigurationChange(policyConfiguration: ConfigurationModel): void {
		const previous = this.configuration.toData();
		const change = this.configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
		this.trigger(change, previous, ConfigurationTarget.DEFAULT);
	}

	private trigger(configurationChange: IConfigurationChange, previous: IConfigurationData, source: ConfigurationTarget): void {
		const event = new ConfigurationChangeEvent(configurationChange, { data: previous }, this.configuration);
		event.source = source;
		event.sourceConfig = this.getTargetConfiguration(source);
		this._onDidChangeConfiguration.fire(event);
	}

	private getTargetConfiguration(target: ConfigurationTarget): any {
		switch (target) {
			case ConfigurationTarget.DEFAULT:
				return this.configuration.defaults.contents;
			case ConfigurationTarget.USER:
				return this.configuration.localUserConfiguration.contents;
		}
		return {};
	}
}
