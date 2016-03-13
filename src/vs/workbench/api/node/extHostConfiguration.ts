/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {clone} from 'vs/base/common/objects';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {IThreadService, Remotable} from 'vs/platform/thread/common/thread';
import {IConfigurationService, ConfigurationServiceEventTypes, IConfigurationServiceEvent} from 'vs/platform/configuration/common/configuration';
import Event, {Emitter} from 'vs/base/common/event';
import {WorkspaceConfiguration} from 'vscode';

@Remotable.ExtHostContext('ExtHostConfiguration')
export class ExtHostConfiguration {

	private _config: any;
	private _hasConfig: boolean;
	private _onDidChangeConfiguration: Emitter<void>;

	constructor() {
		this._onDidChangeConfiguration = new Emitter<void>();
	}

	get onDidChangeConfiguration(): Event<void> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	public _acceptConfigurationChanged(config:any) {
		this._config = config;
		this._hasConfig = true;
		this._onDidChangeConfiguration.fire(undefined);
	}

	public getConfiguration(section?: string): WorkspaceConfiguration {
		if (!this._hasConfig) {
			return;
		}

		const config = section
			? ExtHostConfiguration._lookUp(section, this._config)
			: this._config;


		let result = config ? clone(config) : {};
		// result = Object.freeze(result);
		result.has = function(key: string): boolean {
			return typeof ExtHostConfiguration._lookUp(key, config) !== 'undefined';
		};
		result.get = function <T>(key: string, defaultValue?: T): T {
			let result = ExtHostConfiguration._lookUp(key, config);
			if (typeof result === 'undefined') {
				result = defaultValue;
			}
			return result;
		};
		return result;
	}

	private static _lookUp(section: string, config: any) {
		if (!section) {
			return;
		}
		let parts = section.split('.');
		let node = config;
		while (node && parts.length) {
			node = node[parts.shift()];
		}

		return node;
	}
}

@Remotable.MainContext('MainProcessConfigurationServiceHelper')
export class MainThreadConfiguration {

	private _configurationService: IConfigurationService;
	private _toDispose: IDisposable[];
	private _proxy: ExtHostConfiguration;

	constructor(@IConfigurationService configurationService: IConfigurationService,
		@IThreadService threadService: IThreadService) {

		this._configurationService = configurationService;
		this._proxy = threadService.getRemotable(ExtHostConfiguration);

		this._toDispose = [];
		this._toDispose.push(this._configurationService.addListener2(ConfigurationServiceEventTypes.UPDATED, (e:IConfigurationServiceEvent) => {
			this._proxy._acceptConfigurationChanged(e.config);
		}));
		this._configurationService.loadConfiguration().then((config) => {
			this._proxy._acceptConfigurationChanged(config);
		});
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);
	}
}