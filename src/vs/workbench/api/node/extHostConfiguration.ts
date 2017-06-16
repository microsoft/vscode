/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { mixin } from 'vs/base/common/objects';
import Event, { Emitter } from 'vs/base/common/event';
import { WorkspaceConfiguration } from 'vscode';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostConfigurationShape, MainThreadConfigurationShape } from './extHost.protocol';
import { IConfigurationData, Configuration } from 'vs/platform/configuration/common/configuration';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';

function lookUp(tree: any, key: string) {
	if (key) {
		const parts = key.split('.');
		let node = tree;
		for (let i = 0; node && i < parts.length; i++) {
			node = node[parts[i]];
		}
		return node;
	}
}

export class ExtHostConfiguration extends ExtHostConfigurationShape {

	private _onDidChangeConfiguration = new Emitter<void>();
	private _proxy: MainThreadConfigurationShape;
	private _data: IConfigurationData<any>;
	private _configuration: Configuration<any>;

	constructor(proxy: MainThreadConfigurationShape, data: IConfigurationData<any>, private extWorkspace: ExtHostWorkspace) {
		super();
		this._proxy = proxy;
		this._data = data;
	}

	get onDidChangeConfiguration(): Event<void> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	public $acceptConfigurationChanged(data: IConfigurationData<any>) {
		this._configuration = null;
		this._data = data;
		this._onDidChangeConfiguration.fire(undefined);
	}

	private get configuration(): Configuration<any> {
		if (!this._configuration) {
			this._configuration = Configuration.parse(this._data, this.extWorkspace.workspace);
		}
		return this._configuration;
	}

	public getConfiguration(section?: string): WorkspaceConfiguration {

		const config = section
			? lookUp(this.configuration.getValue(), section)
			: this.configuration.getValue();

		const result: WorkspaceConfiguration = {
			has(key: string): boolean {
				return typeof lookUp(config, key) !== 'undefined';
			},
			get<T>(key: string, defaultValue?: T): T {
				let result = lookUp(config, key);
				if (typeof result === 'undefined') {
					result = defaultValue;
				}
				return result;
			},
			update: (key: string, value: any, global: boolean = false) => {
				key = section ? `${section}.${key}` : key;
				const target = global ? ConfigurationTarget.USER : ConfigurationTarget.WORKSPACE;
				if (value !== void 0) {
					return this._proxy.$updateConfigurationOption(target, key, value);
				} else {
					return this._proxy.$removeConfigurationOption(target, key);
				}
			},
			inspect: <T>(key: string): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T } => {
				key = section ? `${section}.${key}` : key;
				const config = this.configuration.values()[key];
				if (config) {
					return {
						key,
						defaultValue: config.default,
						globalValue: config.user,
						workspaceValue: config.workspace
					};
				}
				return undefined;
			}
		};

		if (typeof config === 'object') {
			mixin(result, config, false);
		}

		return <WorkspaceConfiguration>Object.freeze(result);
	}
}
