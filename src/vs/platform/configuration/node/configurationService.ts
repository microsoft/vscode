/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {JSONPath} from 'vs/base/common/json';
import * as objects from 'vs/base/common/objects';
import {getDefaultValues, flatten} from 'vs/platform/configuration/common/model';
import {ConfigWatcher} from 'vs/base/node/config';
import {Registry} from 'vs/platform/platform';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IDisposable, dispose, toDisposable} from 'vs/base/common/lifecycle';
import {IConfigurationService, IConfigurationServiceEvent } from 'vs/platform/configuration/common/configuration';
import Event, {Emitter} from 'vs/base/common/event';
import {IEnvironmentService} from 'vs/platform/environment/common/environment';

export class ConfigurationService implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private disposables: IDisposable[];

	private rawConfig: ConfigWatcher<any>;
	private cache: any;

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
		this.disposables.push(this.rawConfig.onDidUpdateConfiguration(config => this.onConfigurationChange()));
		this.disposables.push(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(() => this.onConfigurationChange()));
	}

	private onConfigurationChange(): void {
		this.cache = void 0; // reset our caches

		this._onDidUpdateConfiguration.fire({ config: this.getConfiguration() });
	}

	public get onDidUpdateConfiguration(): Event<IConfigurationServiceEvent> {
		return this._onDidUpdateConfiguration.event;
	}

	public loadConfiguration<T>(section?: string): TPromise<T> {
		return new TPromise<T>(c => {
			this.rawConfig.reload(() => {
				this.cache = void 0; // reset our caches

				c(this.getConfiguration<T>(section));
			});
		});
	}

	public getConfiguration<T>(section?: string): T {
		let consolidatedConfig = this.cache;
		if (!consolidatedConfig) {
			consolidatedConfig = this.getConsolidatedConfig();
			this.cache = consolidatedConfig;
		}

		return section ? consolidatedConfig[section] : consolidatedConfig;
	}

	private getConsolidatedConfig(): any {
		const defaults = getDefaultValues();				// defaults coming from contributions to registries
		const user = flatten(this.rawConfig.getConfig());	// user configured settings

		return objects.mixin(
			objects.clone(defaults), 	// target: default values (but dont modify!)
			user,						// source: user settings
			true						// overwrite
		);
	}

	public setUserConfiguration(key: string | JSONPath, value: any): Thenable<void> {
		return TPromise.as(null);
	}

	public hasWorkspaceConfiguration(): boolean {
		return false;
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}