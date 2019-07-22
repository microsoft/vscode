/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService, IConfigurationChangeEvent, IConfigurationOverrides, ConfigurationTarget, compare, isConfigurationOverrides, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { DefaultConfigurationModel, Configuration, ConfigurationChangeEvent, ConfigurationModel, ConfigurationModelParser } from 'vs/platform/configuration/common/configurationModels';
import { Event, Emitter } from 'vs/base/common/event';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigWatcher } from 'vs/base/node/config';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

export class ConfigurationService extends Disposable implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private configuration: Configuration;
	private userConfigModelWatcher: ConfigWatcher<ConfigurationModelParser> | undefined;

	private readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	constructor(
		private readonly settingsResource: URI
	) {
		super();
		this.configuration = new Configuration(new DefaultConfigurationModel(), new ConfigurationModel());
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidUpdateConfiguration(configurationProperties => this.onDidDefaultConfigurationChange(configurationProperties)));
	}

	initialize(): Promise<void> {
		if (this.userConfigModelWatcher) {
			this.userConfigModelWatcher.dispose();
		}

		if (this.settingsResource.scheme !== Schemas.file) {
			return Promise.resolve();
		}
		return new Promise<void>((c, e) => {
			this.userConfigModelWatcher = this._register(new ConfigWatcher(this.settingsResource.fsPath, {
				changeBufferDelay: 300, onError: error => onUnexpectedError(error), defaultConfig: new ConfigurationModelParser(this.settingsResource.fsPath), parse: (content: string, parseErrors: any[]) => {
					const userConfigModelParser = new ConfigurationModelParser(this.settingsResource.fsPath);
					userConfigModelParser.parseContent(content);
					parseErrors = [...userConfigModelParser.errors];
					return userConfigModelParser;
				}, initCallback: () => {
					this.configuration = new Configuration(new DefaultConfigurationModel(), this.userConfigModelWatcher!.getConfig().configurationModel);
					this._register(this.userConfigModelWatcher!.onDidUpdateConfiguration(() => this.onDidChangeUserConfiguration(this.userConfigModelWatcher!.getConfig().configurationModel)));
					c();
				}
			}));
		});
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

	inspect<T>(key: string): {
		default: T,
		user: T,
		workspace?: T,
		workspaceFolder?: T
		value: T
	} {
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

	reloadConfiguration(folder?: IWorkspaceFolder): Promise<void> {
		if (this.userConfigModelWatcher) {
			return new Promise<void>(c => this.userConfigModelWatcher!.reload(userConfigModelParser => {
				this.onDidChangeUserConfiguration(userConfigModelParser.configurationModel);
				c();
			}));
		}
		return this.initialize();
	}

	private onDidChangeUserConfiguration(userConfigurationModel: ConfigurationModel): void {
		const { added, updated, removed } = compare(this.configuration.localUserConfiguration, userConfigurationModel);
		const changedKeys = [...added, ...updated, ...removed];
		if (changedKeys.length) {
			this.configuration.updateLocalUserConfiguration(userConfigurationModel);
			this.trigger(changedKeys, ConfigurationTarget.USER);
		}
	}

	private onDidDefaultConfigurationChange(keys: string[]): void {
		this.configuration.updateDefaultConfiguration(new DefaultConfigurationModel());
		this.trigger(keys, ConfigurationTarget.DEFAULT);
	}

	private trigger(keys: string[], source: ConfigurationTarget): void {
		this._onDidChangeConfiguration.fire(new ConfigurationChangeEvent().change(keys).telemetryData(source, this.getTargetConfiguration(source)));
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