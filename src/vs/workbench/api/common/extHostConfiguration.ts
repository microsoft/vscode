/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mixin, deepClone } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import * as vscode from 'vscode';
import { ExtHostWorkspace, IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { ExtHostConfigurationShape, MainThreadConfigurationShape, IWorkspaceConfigurationChangeEventData, IConfigurationInitData, MainContext } from './extHost.protocol';
import { ConfigurationTarget as ExtHostConfigurationTarget } from './extHostTypes';
import { IConfigurationData, ConfigurationTarget, IConfigurationModel } from 'vs/platform/configuration/common/configuration';
import { Configuration, ConfigurationChangeEvent, ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { WorkspaceConfigurationChangeEvent } from 'vs/workbench/services/configuration/common/configurationModels';
import { ResourceMap } from 'vs/base/common/map';
import { ConfigurationScope, OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';
import { isObject } from 'vs/base/common/types';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { Barrier } from 'vs/base/common/async';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

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

	readonly _serviceBrand: any;

	private readonly _proxy: MainThreadConfigurationShape;
	private readonly _extHostWorkspace: ExtHostWorkspace;
	private readonly _barrier: Barrier;
	private _actual: ExtHostConfigProvider | null;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostWorkspace extHostWorkspace: IExtHostWorkspace
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadConfiguration);
		this._extHostWorkspace = extHostWorkspace;
		this._barrier = new Barrier();
		this._actual = null;
	}

	public getConfigProvider(): Promise<ExtHostConfigProvider> {
		return this._barrier.wait().then(_ => this._actual!);
	}

	$initializeConfiguration(data: IConfigurationInitData): void {
		this._actual = new ExtHostConfigProvider(this._proxy, this._extHostWorkspace, data);
		this._barrier.open();
	}

	$acceptConfigurationChanged(data: IConfigurationInitData, eventData: IWorkspaceConfigurationChangeEventData): void {
		this.getConfigProvider().then(provider => provider.$acceptConfigurationChanged(data, eventData));
	}
}

export class ExtHostConfigProvider {

	private readonly _onDidChangeConfiguration = new Emitter<vscode.ConfigurationChangeEvent>();
	private readonly _proxy: MainThreadConfigurationShape;
	private readonly _extHostWorkspace: ExtHostWorkspace;
	private _configurationScopes: Map<string, ConfigurationScope | undefined>;
	private _configuration: Configuration;

	constructor(proxy: MainThreadConfigurationShape, extHostWorkspace: ExtHostWorkspace, data: IConfigurationInitData) {
		this._proxy = proxy;
		this._extHostWorkspace = extHostWorkspace;
		this._configuration = ExtHostConfigProvider.parse(data);
		this._configurationScopes = this._toMap(data.configurationScopes);
	}

	get onDidChangeConfiguration(): Event<vscode.ConfigurationChangeEvent> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	$acceptConfigurationChanged(data: IConfigurationInitData, eventData: IWorkspaceConfigurationChangeEventData) {
		this._configuration = ExtHostConfigProvider.parse(data);
		this._configurationScopes = this._toMap(data.configurationScopes);
		this._onDidChangeConfiguration.fire(this._toConfigurationChangeEvent(eventData));
	}

	getConfiguration(section?: string, resource?: URI, extensionId?: ExtensionIdentifier): vscode.WorkspaceConfiguration {
		const config = this._toReadonlyValue(section
			? lookUp(this._configuration.getValue(undefined, { resource }, this._extHostWorkspace.workspace), section)
			: this._configuration.getValue(undefined, { resource }, this._extHostWorkspace.workspace));

		if (section) {
			this._validateConfigurationAccess(section, resource, extensionId);
		}

		function parseConfigurationTarget(arg: boolean | ExtHostConfigurationTarget): ConfigurationTarget | null {
			if (arg === undefined || arg === null) {
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
			get: <T>(key: string, defaultValue?: T) => {
				this._validateConfigurationAccess(section ? `${section}.${key}` : key, resource, extensionId);
				let result = lookUp(config, key);
				if (typeof result === 'undefined') {
					result = defaultValue;
				} else {
					let clonedConfig: any | undefined = undefined;
					const cloneOnWriteProxy = (target: any, accessor: string): any => {
						let clonedTarget: any | undefined = undefined;
						const cloneTarget = () => {
							clonedConfig = clonedConfig ? clonedConfig : deepClone(config);
							clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
						};
						return isObject(target) ?
							new Proxy(target, {
								get: (target: any, property: string) => {
									if (typeof property === 'string' && property.toLowerCase() === 'tojson') {
										cloneTarget();
										return () => clonedTarget;
									}
									if (clonedConfig) {
										clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
										return clonedTarget[property];
									}
									const result = target[property];
									if (typeof property === 'string') {
										return cloneOnWriteProxy(result, `${accessor}.${property}`);
									}
									return result;
								},
								set: (_target: any, property: string, value: any) => {
									cloneTarget();
									if (clonedTarget) {
										clonedTarget[property] = value;
									}
									return true;
								},
								deleteProperty: (_target: any, property: string) => {
									cloneTarget();
									if (clonedTarget) {
										delete clonedTarget[property];
									}
									return true;
								},
								defineProperty: (_target: any, property: string, descriptor: any) => {
									cloneTarget();
									if (clonedTarget) {
										Object.defineProperty(clonedTarget, property, descriptor);
									}
									return true;
								}
							}) : target;
					};
					result = cloneOnWriteProxy(result, key);
				}
				return result;
			},
			update: (key: string, value: any, arg: ExtHostConfigurationTarget | boolean) => {
				key = section ? `${section}.${key}` : key;
				const target = parseConfigurationTarget(arg);
				if (value !== undefined) {
					return this._proxy.$updateConfigurationOption(target, key, value, resource);
				} else {
					return this._proxy.$removeConfigurationOption(target, key, resource);
				}
			},
			inspect: <T>(key: string): ConfigurationInspect<T> | undefined => {
				key = section ? `${section}.${key}` : key;
				const config = deepClone(this._configuration.inspect<T>(key, { resource }, this._extHostWorkspace.workspace));
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

	private _toReadonlyValue(result: any): any {
		const readonlyProxy = (target: any): any => {
			return isObject(target) ?
				new Proxy(target, {
					get: (target: any, property: string) => readonlyProxy(target[property]),
					set: (_target: any, property: string, _value: any) => { throw new Error(`TypeError: Cannot assign to read only property '${property}' of object`); },
					deleteProperty: (_target: any, property: string) => { throw new Error(`TypeError: Cannot delete read only property '${property}' of object`); },
					defineProperty: (_target: any, property: string) => { throw new Error(`TypeError: Cannot define property '${property}' for a readonly object`); },
					setPrototypeOf: (_target: any) => { throw new Error(`TypeError: Cannot set prototype for a readonly object`); },
					isExtensible: () => false,
					preventExtensions: () => true
				}) : target;
		};
		return readonlyProxy(result);
	}

	private _validateConfigurationAccess(key: string, resource: URI | undefined, extensionId?: ExtensionIdentifier): void {
		const scope = OVERRIDE_PROPERTY_PATTERN.test(key) ? ConfigurationScope.RESOURCE : this._configurationScopes.get(key);
		const extensionIdText = extensionId ? `[${extensionId.value}] ` : '';
		if (ConfigurationScope.RESOURCE === scope) {
			if (resource === undefined) {
				console.warn(`${extensionIdText}Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for '${key}', provide the URI of a resource or 'null' for any resource.`);
			}
			return;
		}
		if (ConfigurationScope.WINDOW === scope) {
			if (resource) {
				console.warn(`${extensionIdText}Accessing a window scoped configuration for a resource is not expected. To associate '${key}' to a resource, define its scope to 'resource' in configuration contributions in 'package.json'.`);
			}
			return;
		}
	}

	private _toConfigurationChangeEvent(data: IWorkspaceConfigurationChangeEventData): vscode.ConfigurationChangeEvent {
		const changedConfiguration = new ConfigurationModel(data.changedConfiguration.contents, data.changedConfiguration.keys, data.changedConfiguration.overrides);
		const changedConfigurationByResource: ResourceMap<ConfigurationModel> = new ResourceMap<ConfigurationModel>();
		for (const key of Object.keys(data.changedConfigurationByResource)) {
			const resource = URI.parse(key);
			const model = data.changedConfigurationByResource[key];
			changedConfigurationByResource.set(resource, new ConfigurationModel(model.contents, model.keys, model.overrides));
		}
		const event = new WorkspaceConfigurationChangeEvent(new ConfigurationChangeEvent(changedConfiguration, changedConfigurationByResource), this._extHostWorkspace.workspace);
		return Object.freeze({
			affectsConfiguration: (section: string, resource?: URI) => event.affectsConfiguration(section, resource)
		});
	}

	private _toMap(scopes: [string, ConfigurationScope | undefined][]): Map<string, ConfigurationScope | undefined> {
		return scopes.reduce((result, scope) => { result.set(scope[0], scope[1]); return result; }, new Map<string, ConfigurationScope | undefined>());
	}

	private static parse(data: IConfigurationData): Configuration {
		const defaultConfiguration = ExtHostConfigProvider.parseConfigurationModel(data.defaults);
		const userConfiguration = ExtHostConfigProvider.parseConfigurationModel(data.user);
		const workspaceConfiguration = ExtHostConfigProvider.parseConfigurationModel(data.workspace);
		const folders: ResourceMap<ConfigurationModel> = data.folders.reduce((result, value) => {
			result.set(URI.revive(value[0]), ExtHostConfigProvider.parseConfigurationModel(value[1]));
			return result;
		}, new ResourceMap<ConfigurationModel>());
		return new Configuration(defaultConfiguration, userConfiguration, new ConfigurationModel(), workspaceConfiguration, folders, new ConfigurationModel(), new ResourceMap<ConfigurationModel>(), false);
	}

	private static parseConfigurationModel(model: IConfigurationModel): ConfigurationModel {
		return new ConfigurationModel(model.contents, model.keys, model.overrides).freeze();
	}
}

export const IExtHostConfiguration = createDecorator<IExtHostConfiguration>('IExtHostConfiguration');
export interface IExtHostConfiguration extends ExtHostConfiguration { }
