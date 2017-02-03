/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { mixin } from 'vs/base/common/objects';
import Event, { Emitter } from 'vs/base/common/event';
import { WorkspaceConfiguration } from 'vscode';
import { ExtHostConfigurationShape, MainThreadConfigurationShape } from './extHost.protocol';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceConfigurationValues } from 'vs/workbench/services/configuration/common/configuration';
import { toValuesTree } from 'vs/platform/configuration/common/model';

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

interface UsefulConfiguration {
	data: IWorkspaceConfigurationValues;
	valueTree: any;
}

function createUsefulConfiguration(data: IWorkspaceConfigurationValues): { data: IWorkspaceConfigurationValues, valueTree: any } {
	const valueMap: { [key: string]: any } = Object.create(null);
	for (let key in data) {
		if (Object.prototype.hasOwnProperty.call(data, key)) {
			valueMap[key] = data[key].value;
		}
	}
	const valueTree = toValuesTree(valueMap, message => console.error(`Conflict in configuration settings: ${message}`));
	return {
		data,
		valueTree
	};
}

export class ExtHostConfiguration extends ExtHostConfigurationShape {

	private _onDidChangeConfiguration = new Emitter<void>();
	private _proxy: MainThreadConfigurationShape;
	private _configuration: UsefulConfiguration;

	constructor(proxy: MainThreadConfigurationShape, data: IWorkspaceConfigurationValues) {
		super();
		this._proxy = proxy;
		this._configuration = createUsefulConfiguration(data);
	}

	get onDidChangeConfiguration(): Event<void> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	public $acceptConfigurationChanged(data: IWorkspaceConfigurationValues) {
		this._configuration = createUsefulConfiguration(data);
		this._onDidChangeConfiguration.fire(undefined);
	}

	public getConfiguration(section?: string): WorkspaceConfiguration {

		const config = section
			? lookUp(this._configuration.valueTree, section)
			: this._configuration.valueTree;

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
				const config = this._configuration.data[key];
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
