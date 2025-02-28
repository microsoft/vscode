/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { Event } from '../../../base/common/event.js';
import * as types from '../../../base/common/types.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWorkspaceFolder } from '../../workspace/common/workspace.js';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export function isConfigurationOverrides(thing: any): thing is IConfigurationOverrides {
	return thing
		&& typeof thing === 'object'
		&& (!thing.overrideIdentifier || typeof thing.overrideIdentifier === 'string')
		&& (!thing.resource || thing.resource instanceof URI);
}

export interface IConfigurationOverrides {
	overrideIdentifier?: string | null;
	resource?: URI | null;
}

export function isConfigurationUpdateOverrides(thing: any): thing is IConfigurationUpdateOverrides {
	return thing
		&& typeof thing === 'object'
		&& (!thing.overrideIdentifiers || Array.isArray(thing.overrideIdentifiers))
		&& !thing.overrideIdentifier
		&& (!thing.resource || thing.resource instanceof URI);
}

export type IConfigurationUpdateOverrides = Omit<IConfigurationOverrides, 'overrideIdentifier'> & { overrideIdentifiers?: string[] | null };

export const enum ConfigurationTarget {
	APPLICATION = 1,
	USER,
	USER_LOCAL,
	USER_REMOTE,
	WORKSPACE,
	WORKSPACE_FOLDER,
	DEFAULT,
	MEMORY
}
export function ConfigurationTargetToString(configurationTarget: ConfigurationTarget) {
	switch (configurationTarget) {
		case ConfigurationTarget.APPLICATION: return 'APPLICATION';
		case ConfigurationTarget.USER: return 'USER';
		case ConfigurationTarget.USER_LOCAL: return 'USER_LOCAL';
		case ConfigurationTarget.USER_REMOTE: return 'USER_REMOTE';
		case ConfigurationTarget.WORKSPACE: return 'WORKSPACE';
		case ConfigurationTarget.WORKSPACE_FOLDER: return 'WORKSPACE_FOLDER';
		case ConfigurationTarget.DEFAULT: return 'DEFAULT';
		case ConfigurationTarget.MEMORY: return 'MEMORY';
	}
}

export interface IConfigurationChange {
	keys: string[];
	overrides: [string, string[]][];
}

export interface IConfigurationChangeEvent {

	readonly source: ConfigurationTarget;
	readonly affectedKeys: ReadonlySet<string>;
	readonly change: IConfigurationChange;

	affectsConfiguration(configuration: string, overrides?: IConfigurationOverrides): boolean;
}

export interface IInspectValue<T> {
	readonly value?: T;
	readonly override?: T;
	readonly overrides?: { readonly identifiers: string[]; readonly value: T }[];
}

export interface IConfigurationValue<T> {

	readonly defaultValue?: T;
	readonly applicationValue?: T;
	readonly userValue?: T;
	readonly userLocalValue?: T;
	readonly userRemoteValue?: T;
	readonly workspaceValue?: T;
	readonly workspaceFolderValue?: T;
	readonly memoryValue?: T;
	readonly policyValue?: T;
	readonly value?: T;

	readonly default?: IInspectValue<T>;
	readonly application?: IInspectValue<T>;
	readonly user?: IInspectValue<T>;
	readonly userLocal?: IInspectValue<T>;
	readonly userRemote?: IInspectValue<T>;
	readonly workspace?: IInspectValue<T>;
	readonly workspaceFolder?: IInspectValue<T>;
	readonly memory?: IInspectValue<T>;
	readonly policy?: { value?: T };

	readonly overrideIdentifiers?: string[];
}

export function isConfigured<T>(configValue: IConfigurationValue<T>): configValue is IConfigurationValue<T> & { value: T } {
	return configValue.applicationValue !== undefined ||
		configValue.userValue !== undefined ||
		configValue.userLocalValue !== undefined ||
		configValue.userRemoteValue !== undefined ||
		configValue.workspaceValue !== undefined ||
		configValue.workspaceFolderValue !== undefined;
}

export interface IConfigurationUpdateOptions {
	/**
	 * If `true`, do not notifies the error to user by showing the message box. Default is `false`.
	 */
	donotNotifyError?: boolean;
	/**
	 * How to handle dirty file when updating the configuration.
	 */
	handleDirtyFile?: 'save' | 'revert';
}

export interface IConfigurationService {
	readonly _serviceBrand: undefined;

	onDidChangeConfiguration: Event<IConfigurationChangeEvent>;

	getConfigurationData(): IConfigurationData | null;

	/**
	 * Fetches the value of the section for the given overrides.
	 * Value can be of native type or an object keyed off the section name.
	 *
	 * @param section - Section of the configuration. Can be `null` or `undefined`.
	 * @param overrides - Overrides that has to be applied while fetching
	 *
	 */
	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;

	/**
	 * Update a configuration value.
	 *
	 * Use `target` to update the configuration in a specific `ConfigurationTarget`.
	 *
	 * Use `overrides` to update the configuration for a resource or for override identifiers or both.
	 *
	 * Passing a resource through overrides will update the configuration in the workspace folder containing that resource.
	 *
	 * *Note 1:* Updating configuration to a default value will remove the configuration from the requested target. If not target is passed, it will be removed from all writeable targets.
	 *
	 * *Note 2:* Use `undefined` value to remove the configuration from the given target. If not target is passed, it will be removed from all writeable targets.
	 *
	 * Use `donotNotifyError` and set it to `true` to surpresss errors.
	 *
	 * @param key setting to be updated
	 * @param value The new value
	 */
	updateValue(key: string, value: any): Promise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;

	inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<Readonly<T>>;

	reloadConfiguration(target?: ConfigurationTarget | IWorkspaceFolder): Promise<void>;

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
		memory?: string[];
	};
}

export interface IConfigurationModel {
	contents: any;
	keys: string[];
	overrides: IOverrides[];
	raw?: IStringDictionary<any>;
}

export interface IOverrides {
	keys: string[];
	contents: any;
	identifiers: string[];
}

export interface IConfigurationData {
	defaults: IConfigurationModel;
	policy: IConfigurationModel;
	application: IConfigurationModel;
	userLocal: IConfigurationModel;
	userRemote: IConfigurationModel;
	workspace: IConfigurationModel;
	folders: [UriComponents, IConfigurationModel][];
}

export interface IConfigurationCompareResult {
	added: string[];
	removed: string[];
	updated: string[];
	overrides: [string, string[]][];
}

export function toValuesTree(properties: { [qualifiedKey: string]: any }, conflictReporter: (message: string) => void): any {
	const root = Object.create(null);

	for (const key in properties) {
		addToValueTree(root, key, properties[key], conflictReporter);
	}

	return root;
}

export function addToValueTree(settingsTreeRoot: any, key: string, value: any, conflictReporter: (message: string) => void): void {
	const segments = key.split('.');
	const last = segments.pop()!;

	let curr = settingsTreeRoot;
	for (let i = 0; i < segments.length; i++) {
		const s = segments[i];
		let obj = curr[s];
		switch (typeof obj) {
			case 'undefined':
				obj = curr[s] = Object.create(null);
				break;
			case 'object':
				if (obj === null) {
					conflictReporter(`Ignoring ${key} as ${segments.slice(0, i + 1).join('.')} is null`);
					return;
				}
				break;
			default:
				conflictReporter(`Ignoring ${key} as ${segments.slice(0, i + 1).join('.')} is ${JSON.stringify(obj)}`);
				return;
		}
		curr = obj;
	}

	if (typeof curr === 'object' && curr !== null) {
		try {
			curr[last] = value; // workaround https://github.com/microsoft/vscode/issues/13606
		} catch (e) {
			conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
		}
	} else {
		conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
	}
}

export function removeFromValueTree(valueTree: any, key: string): void {
	const segments = key.split('.');
	doRemoveFromValueTree(valueTree, segments);
}

function doRemoveFromValueTree(valueTree: any, segments: string[]): void {
	if (!valueTree) {
		return;
	}

	const first = segments.shift()!;
	if (segments.length === 0) {
		// Reached last segment
		delete valueTree[first];
		return;
	}

	if (Object.keys(valueTree).indexOf(first) !== -1) {
		const value = valueTree[first];
		if (typeof value === 'object' && !Array.isArray(value)) {
			doRemoveFromValueTree(value, segments);
			if (Object.keys(value).length === 0) {
				delete valueTree[first];
			}
		}
	}
}

/**
 * A helper function to get the configuration value with a specific settings path (e.g. config.some.setting)
 */
export function getConfigurationValue<T>(config: any, settingPath: string): T | undefined;
export function getConfigurationValue<T>(config: any, settingPath: string, defaultValue: T): T;
export function getConfigurationValue<T>(config: any, settingPath: string, defaultValue?: T): T | undefined {
	function accessSetting(config: any, path: string[]): any {
		let current = config;
		for (const component of path) {
			if (typeof current !== 'object' || current === null) {
				return undefined;
			}
			current = current[component];
		}
		return <T>current;
	}

	const path = settingPath.split('.');
	const result = accessSetting(config, path);

	return typeof result === 'undefined' ? defaultValue : result;
}

export function merge(base: any, add: any, overwrite: boolean): void {
	Object.keys(add).forEach(key => {
		if (key !== '__proto__') {
			if (key in base) {
				if (types.isObject(base[key]) && types.isObject(add[key])) {
					merge(base[key], add[key], overwrite);
				} else if (overwrite) {
					base[key] = add[key];
				}
			} else {
				base[key] = add[key];
			}
		}
	});
}

export function getLanguageTagSettingPlainKey(settingKey: string) {
	return settingKey.replace(/[\[\]]/g, '');
}
