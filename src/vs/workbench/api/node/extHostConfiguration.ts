/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { mixin } from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import * as vscode from 'vscode';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostConfigurationShape, MainThreadConfigurationShape, IWorkspaceConfigurationChangeEventData } from './extHost.protocol';
import { ConfigurationTarget as ExtHostConfigurationTarget } from './extHostTypes';
import { IConfigurationData, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Configuration, ConfigurationModel, ConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationChangeEvent } from 'vs/workbench/services/configuration/common/configurationModels';
import { StrictResourceMap } from 'vs/base/common/map';

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

type ConfigurationInspect<T> = {
	key: string;
	defaultValue?: T;
	globalValue?: T;
	workspaceValue?: T;
	workspaceFolderValue?: T;
};

export class ExtHostConfiguration implements ExtHostConfigurationShape {

	private readonly _onDidChangeConfiguration = new Emitter<void>();
	private readonly _proxy: MainThreadConfigurationShape;
	private readonly _extHostWorkspace: ExtHostWorkspace;
	private _configuration: Configuration;

	constructor(proxy: MainThreadConfigurationShape, extHostWorkspace: ExtHostWorkspace, data: IConfigurationData) {
		this._proxy = proxy;
		this._extHostWorkspace = extHostWorkspace;
		this._configuration = Configuration.parse(data);
	}

	get onDidChangeConfiguration(): Event<void> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	$acceptConfigurationChanged(data: IConfigurationData, eventData: IWorkspaceConfigurationChangeEventData) {
		this._configuration = Configuration.parse(data);
		this._onDidChangeConfiguration.fire(undefined);
	}

	getConfiguration(section?: string, resource?: URI): vscode.WorkspaceConfiguration {
		const config = section
			? lookUp(this._configuration.getSection(null, { resource }, this._extHostWorkspace.workspace), section)
			: this._configuration.getSection(null, { resource }, this._extHostWorkspace.workspace);

		function parseConfigurationTarget(arg: boolean | ExtHostConfigurationTarget): ConfigurationTarget {
			if (arg === void 0 || arg === null) {
				return null;
			}
			if (typeof arg === 'boolean') {
				return arg ? ConfigurationTarget.USER : ConfigurationTarget.WORKSPACE;
			}

			switch (arg) {
				case ExtHostConfigurationTarget.Global: return ConfigurationTarget.USER;
				case ExtHostConfigurationTarget.Workspace: return ConfigurationTarget.WORKSPACE;
				case ExtHostConfigurationTarget.WorkspaceFolder: return ConfigurationTarget.WORKSPACE_FOLDER;
			}
		}

		const result: vscode.WorkspaceConfiguration = {
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
			update: (key: string, value: any, arg: ExtHostConfigurationTarget | boolean) => {
				key = section ? `${section}.${key}` : key;
				const target = parseConfigurationTarget(arg);
				if (value !== void 0) {
					return this._proxy.$updateConfigurationOption(target, key, value, resource);
				} else {
					return this._proxy.$removeConfigurationOption(target, key, resource);
				}
			},
			inspect: <T>(key: string): ConfigurationInspect<T> => {
				key = section ? `${section}.${key}` : key;
				const config = this._configuration.lookup<T>(key, { resource }, this._extHostWorkspace.workspace);
				if (config) {
					return {
						key,
						defaultValue: config.default,
						globalValue: config.user,
						workspaceValue: config.workspace,
						workspaceFolderValue: config.workspaceFolder
					};
				}
				return undefined;
			}
		};

		if (typeof config === 'object') {
			mixin(result, config, false);
		}

		return <vscode.WorkspaceConfiguration>Object.freeze(result);
	}

	protected toConfigurationChangeEvent(data: IWorkspaceConfigurationChangeEventData): WorkspaceConfigurationChangeEvent {
		const changedConfiguration = new ConfigurationModel(data.changedConfiguration.contents, data.changedConfiguration.keys, data.changedConfiguration.overrides);
		const changedConfigurationByResource: StrictResourceMap<ConfigurationModel> = new StrictResourceMap<ConfigurationModel>();
		for (const key of Object.keys(data.changedConfigurationByResource)) {
			const resource = URI.parse(key);
			const model = data.changedConfigurationByResource[key];
			changedConfigurationByResource.set(resource, new ConfigurationModel(model.contents, model.keys, model.overrides));
		}
		const event = new ConfigurationChangeEvent(changedConfiguration, changedConfigurationByResource);
		return new WorkspaceConfigurationChangeEvent(event, this._extHostWorkspace.workspace);
	}
}
