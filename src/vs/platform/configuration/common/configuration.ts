/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import * as types from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IProcessEnvironment, isWindows } from 'vs/base/common/platform';
import { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';

type Environment = { env: IProcessEnvironment | undefined; userHome: string | undefined };

const VARIABLE_LHS = '${';
const VARIABLE_REGEXP = /\$\{(.*?)\}.*$/g;
const VARIABLE_REGEXP_ENV = /\$\{env:(.*?)\}.*$/g;

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
		&& (!thing.overrideIdentifiers || types.isArray(thing.overrideIdentifiers))
		&& !thing.overrideIdentifier
		&& (!thing.resource || thing.resource instanceof URI);
}

export type IConfigurationUpdateOverrides = Omit<IConfigurationOverrides, 'overrideIdentifier'> & { overrideIdentifiers?: string[] | null };

export const enum ConfigurationTarget {
	USER = 1,
	USER_LOCAL,
	USER_REMOTE,
	WORKSPACE,
	WORKSPACE_FOLDER,
	DEFAULT,
	MEMORY
}
export function ConfigurationTargetToString(configurationTarget: ConfigurationTarget) {
	switch (configurationTarget) {
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
	readonly affectedKeys: string[];
	readonly change: IConfigurationChange;

	affectsConfiguration(configuration: string, overrides?: IConfigurationOverrides): boolean;

	// Following data is used for telemetry
	readonly sourceConfig: any;
}

export interface IConfigurationValue<T> {

	readonly defaultValue?: T;
	readonly userValue?: T;
	readonly userLocalValue?: T;
	readonly userRemoteValue?: T;
	readonly workspaceValue?: T;
	readonly workspaceFolderValue?: T;
	readonly memoryValue?: T;
	readonly value?: T;

	readonly default?: { value?: T; override?: T };
	readonly user?: { value?: T; override?: T };
	readonly userLocal?: { value?: T; override?: T };
	readonly userRemote?: { value?: T; override?: T };
	readonly workspace?: { value?: T; override?: T };
	readonly workspaceFolder?: { value?: T; override?: T };
	readonly memory?: { value?: T; override?: T };

	readonly overrideIdentifiers?: string[];
}

export interface IConfigurationService {
	readonly _serviceBrand: undefined;

	onDidChangeConfiguration: Event<IConfigurationChangeEvent>;

	getConfigurationData(): IConfigurationData | null;

	/**
	 * Fetches the value of the section for the given overrides.
	 * Value can be of native type or an object keyed off the section name.
	 *
	 * @param section - Section of the configuraion. Can be `null` or `undefined`.
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
	 * *Note 1:* Updating configuraiton to a default value will remove the configuration from the requested target. If not target is passed, it will be removed from all writeable targets.
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
	updateValue(key: string, value: any, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, donotNotifyError?: boolean): Promise<void>;

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
}

export interface IOverrides {
	keys: string[];
	contents: any;
	identifiers: string[];
}

export interface IConfigurationData {
	defaults: IConfigurationModel;
	user: IConfigurationModel;
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

	for (let key in properties) {
		addToValueTree(root, key, properties[key], conflictReporter);
	}

	return root;
}

export function addToValueTree(settingsTreeRoot: any, key: string, value: any, conflictReporter: (message: string) => void): void {
	const segments = key.split('.');
	const last = segments.pop()!;

	let curr = settingsTreeRoot;
	for (let i = 0; i < segments.length; i++) {
		let s = segments[i];
		let obj = curr[s];
		switch (typeof obj) {
			case 'undefined':
				obj = curr[s] = Object.create(null);
				break;
			case 'object':
				break;
			default:
				conflictReporter(`Ignoring ${key} as ${segments.slice(0, i + 1).join('.')} is ${JSON.stringify(obj)}`);
				return;
		}
		curr = obj;
	}

	if (typeof curr === 'object' && curr !== null) {
		try {
			if (JSON.stringify(value).match(VARIABLE_REGEXP_ENV)) {
				const result = resolveWithEnvironment({ ...process.env, userHome: undefined }, undefined, value);
				curr[last] = result;
			} else {
				curr[last] = value; // workaround https://github.com/microsoft/vscode/issues/13606
			}
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
export function getConfigurationValue<T>(config: any, settingPath: string, defaultValue?: T): T {
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

export function getMigratedSettingValue<T>(configurationService: IConfigurationService, currentSettingName: string, legacySettingName: string): T {
	const setting = configurationService.inspect<T>(currentSettingName);
	const legacySetting = configurationService.inspect<T>(legacySettingName);

	if (typeof setting.userValue !== 'undefined' || typeof setting.workspaceValue !== 'undefined' || typeof setting.workspaceFolderValue !== 'undefined') {
		return setting.value!;
	} else if (typeof legacySetting.userValue !== 'undefined' || typeof legacySetting.workspaceValue !== 'undefined' || typeof legacySetting.workspaceFolderValue !== 'undefined') {
		return legacySetting.value!;
	} else {
		return setting.defaultValue!;
	}
}

export function getLanguageTagSettingPlainKey(settingKey: string) {
	return settingKey.replace(/[\[\]]/g, '');
}

function prepareEnv(envVariables: IProcessEnvironment): IProcessEnvironment {
	// windows env variables are case insensitive
	if (isWindows) {
		const ev: IProcessEnvironment = Object.create(null);
		Object.keys(envVariables).forEach(key => {
			ev[key.toLowerCase()] = envVariables[key];
		});
		return ev;
	}
	return envVariables;
}

function resolveWithEnvironment(environment: IProcessEnvironment, root: IWorkspaceFolder | undefined, value: string): any {
	return recursiveResolve({ env: prepareEnv(environment), userHome: undefined }, root ? root.uri : undefined, value);
}

function recursiveResolve(environment: Environment, folderUri: URI | undefined, value: any, commandValueMapping?: IStringDictionary<string>, resolvedVariables?: Map<string, any>): any {
	if (types.isString(value)) {
		return resolveString(environment, folderUri, value, commandValueMapping, resolvedVariables);
	} else if (types.isArray(value)) {
		return value.map(s => recursiveResolve(environment, folderUri, s, commandValueMapping, resolvedVariables));
	} else if (types.isObject(value)) {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		const replaced = Object.keys(value).map(key => {
			const replaced = resolveString(environment, folderUri, key, commandValueMapping, resolvedVariables);
			return [replaced, recursiveResolve(environment, folderUri, value[key], commandValueMapping, resolvedVariables)] as const;
		});
		// two step process to preserve object key order
		for (const [key, value] of replaced) {
			result[key] = value;
		}
		return result;
	}
	return value;
}

function resolveString(environment: Environment, folderUri: URI | undefined, value: string, commandValueMapping: IStringDictionary<string> | undefined, resolvedVariables?: Map<string, string>): string {
	// loop through all variables occurrences in 'value'
	return replaceSync(value, VARIABLE_REGEXP, (match: string, variable: string) => {
		// disallow attempted nesting, see #77289. This doesn't exclude variables that resolve to other variables.
		if (variable.includes(VARIABLE_LHS)) {
			return match;
		}

		let resolvedValue = evaluateSingleVariable(environment, match, variable, folderUri, commandValueMapping);

		if (resolvedVariables) {
			resolvedVariables.set(variable, resolvedValue);
		}

		if ((resolvedValue !== match) && types.isString(resolvedValue) && resolvedValue.match(VARIABLE_REGEXP)) {
			resolvedValue = resolveString(environment, folderUri, resolvedValue, commandValueMapping, resolvedVariables);
		}

		resolvedValue = match.replace(`\$\{${variable}\}`, resolvedValue);
		return resolvedValue;
	});
}

function evaluateSingleVariable(environment: Environment, match: string, variable: string, folderUri: URI | undefined, commandValueMapping: IStringDictionary<string> | undefined): string {

	// try to separate variable arguments from variable name
	let argument: string | undefined;
	const parts = variable.split(':');
	if (parts.length > 1) {
		variable = parts[0];
		argument = parts[1];
	}

	switch (variable) {

		case 'env':
			if (argument) {
				if (environment.env) {
					// Depending on the source of the environment, on Windows, the values may all be lowercase.
					const env = environment.env[isWindows ? argument.toLowerCase() : argument];
					if (types.isString(env)) {
						return env;
					}
				}
				// For `env` we should do the same as a normal shell does - evaluates undefined envs to an empty string #46436
				return '';
			}
			throw new Error(localize('missingEnvVarName', "Variable {0} can not be resolved because no environment variable name is given.", match));

		default: {
			return '';
		}
	}
}

function replaceSync(str: string, search: RegExp, replacer: (match: string, ...args: any[]) => string): string {
	let parts: (string)[] = [];

	let last = 0;
	for (const match of str.matchAll(search)) {
		parts.push(str.slice(last, match.index));
		if (match.index === undefined) {
			throw new Error('match.index should be defined');
		}

		last = match.index + match[0].length;
		parts.push(replacer(match[0], ...match.slice(1), match.index, str, match.groups));
	}

	parts.push(str.slice(last));

	return parts.join('');
}
