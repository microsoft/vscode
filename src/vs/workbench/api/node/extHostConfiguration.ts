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
import { WorkspaceConfigurationNode, IWorkspaceConfigurationValue } from 'vs/workbench/services/configuration/common/configuration';

export class ExtHostConfiguration extends ExtHostConfigurationShape {

	private _proxy: MainThreadConfigurationShape;
	private _config: WorkspaceConfigurationNode;
	private _onDidChangeConfiguration = new Emitter<void>();

	constructor(proxy: MainThreadConfigurationShape, config: WorkspaceConfigurationNode) {
		super();
		this._proxy = proxy;
		this._config = config;
	}

	get onDidChangeConfiguration(): Event<void> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	public $acceptConfigurationChanged(config: WorkspaceConfigurationNode) {
		this._config = config;
		this._onDidChangeConfiguration.fire(undefined);
	}

	public getConfiguration(section?: string): WorkspaceConfiguration {

		const config = section
			? ExtHostConfiguration._lookUp(section, this._config)
			: this._config;

		const result: WorkspaceConfiguration = {
			has(key: string): boolean {
				return typeof ExtHostConfiguration._lookUp(key, <WorkspaceConfigurationNode>config) !== 'undefined';
			},
			get<T>(key: string, defaultValue?: T): any {
				let result = ExtHostConfiguration._lookUp(key, <WorkspaceConfigurationNode>config);
				if (typeof result === 'undefined') {
					return defaultValue;
				} else if (isConfigurationValue(result)) {
					return result.value;
				} else {
					return ExtHostConfiguration._values(result);
				}
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
			inspect(key: string) {
				let result = ExtHostConfiguration._lookUp(key, <WorkspaceConfigurationNode>config);
				if (isConfigurationValue(result)) {
					return {
						key: section ? `${section}.${key}` : key,
						defaultValue: result.default,
						globalValue: result.user,
						workspaceValue: result.workspace
					};
				}
			}
		};

		if (!isConfigurationValue(config)) {
			mixin(result, ExtHostConfiguration._values(config), false);
		}

		return Object.freeze(result);

	}

	private static _lookUp(section: string, config: WorkspaceConfigurationNode): WorkspaceConfigurationNode | IWorkspaceConfigurationValue<any> {
		if (!section) {
			return;
		}
		let parts = section.split('.');
		let node = config;
		while (node && parts.length) {
			let child = node[parts.shift()];
			if (isConfigurationValue(child)) {
				return child;
			} else {
				node = child;
			}
		}

		return node;
	}

	private static _values(node: WorkspaceConfigurationNode): any {
		let target = Object.create(null);
		for (let key in node) {
			let child = node[key];
			if (isConfigurationValue(child)) {
				target[key] = child.value;
			} else {
				target[key] = ExtHostConfiguration._values(child);
			}
		}
		return target;
	}
}

function isConfigurationValue(thing: any): thing is IWorkspaceConfigurationValue<any> {
	return typeof thing === 'object'
		// must have 'value'
		&& typeof (<IWorkspaceConfigurationValue<any>>thing).value !== 'undefined'
		// and at least one source 'default', 'user', or 'workspace'
		&& (typeof (<IWorkspaceConfigurationValue<any>>thing).default !== 'undefined'
			|| typeof (<IWorkspaceConfigurationValue<any>>thing).user !== 'undefined'
			|| typeof (<IWorkspaceConfigurationValue<any>>thing).workspace !== 'undefined');
}
