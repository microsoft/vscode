/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import * as types from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationRegistry, Extensions, OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationOverrides {
	overrideIdentifier?: string;
	resource?: URI;
}

export enum ConfigurationTarget {
	DEFAULT = 1,
	USER,
	WORKSPACE,
	WORKSPACE_FOLDER,
	MEMORY
}

export interface IConfigurationChangeEvent {
	keys: string[];
	sections: string[];
	overrideIdentifiers?: string[];

	hasSectionChanged(section: string): boolean;
	hasKeyChanged(key: string): boolean;

	// Following data is used for telemetry
	source: ConfigurationTarget;
	sourceConfig: any;
}

export interface IConfigurationService {
	_serviceBrand: any;

	onDidUpdateConfiguration: Event<IConfigurationChangeEvent>;

	getConfiguration<T>(): T;
	getConfiguration<T>(section: string): T;
	getConfiguration<T>(overrides: IConfigurationOverrides): T;
	getConfiguration<T>(section: string, overrides: IConfigurationOverrides): T;

	getValue<T>(key: string, overrides?: IConfigurationOverrides): T;

	updateValue(key: string, value: any): TPromise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): TPromise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): TPromise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): TPromise<void>;

	reloadConfiguration(): TPromise<void>;
	reloadConfiguration(folder: IWorkspaceFolder): TPromise<void>;

	inspect<T>(key: string): {
		default: T,
		user: T,
		workspace: T,
		workspaceFolder: T,
		memory?: T,
		value: T,
	};

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
		memory?: string[];
	};
}

export interface IConfiguraionModel<T> {
	contents: T;
	keys: string[];
	overrides: IOverrides<T>[];
}

export interface IOverrides<T> {
	contents: T;
	identifiers: string[];
}

export interface IConfigurationData<T> {
	defaults: IConfiguraionModel<T>;
	user: IConfiguraionModel<T>;
	workspace: IConfiguraionModel<T>;
	folders: { [folder: string]: IConfiguraionModel<T> };
}

export function compare(from: IConfiguraionModel<any>, to: IConfiguraionModel<any>): { added: string[], removed: string[], updated: string[] } {
	const added = to.keys.filter(key => from.keys.indexOf(key) === -1);
	const removed = from.keys.filter(key => to.keys.indexOf(key) === -1);
	const updated = [];

	for (const key of from.keys) {
		const value1 = getConfigurationValue(from.contents, key);
		const value2 = getConfigurationValue(to.contents, key);
		if (!objects.equals(value1, value2)) {
			updated.push(key);
		}
	}

	return { added, removed, updated };
}

export function toConfigurationUpdateEvent(udpated: string[], source: ConfigurationTarget, sourceConfig: any): IConfigurationChangeEvent {
	const overrideIdentifiers = [];
	const keys: string[] = [];
	for (const key of udpated) {
		if (OVERRIDE_PROPERTY_PATTERN.test(key)) {
			overrideIdentifiers.push(overrideIdentifierFromKey(key).trim());
		} else {
			keys.push(key);
		}
	}
	const sections = arrays.distinct(keys.map(key => key.split('.')[0]));
	const hasSectionChanged = (section) => sections.indexOf(section) !== -1;
	const hasKeyChanged = (key) => keys.indexOf(key) !== -1;

	return { keys, sections, overrideIdentifiers, source, sourceConfig, hasSectionChanged, hasKeyChanged };
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
	const last = segments.pop();

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
	};

	if (typeof curr === 'object') {
		curr[last] = value; // workaround https://github.com/Microsoft/vscode/issues/13606
	} else {
		conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
	}
}

/**
 * A helper function to get the configuration value with a specific settings path (e.g. config.some.setting)
 */
export function getConfigurationValue<T>(config: any, settingPath: string, defaultValue?: T): T {
	function accessSetting(config: any, path: string[]): any {
		let current = config;
		for (let i = 0; i < path.length; i++) {
			if (typeof current !== 'object' || current === null) {
				return undefined;
			}
			current = current[path[i]];
		}
		return <T>current;
	}

	const path = settingPath.split('.');
	const result = accessSetting(config, path);

	return typeof result === 'undefined' ? defaultValue : result;
}

export function merge(base: any, add: any, overwrite: boolean): void {
	Object.keys(add).forEach(key => {
		if (key in base) {
			if (types.isObject(base[key]) && types.isObject(add[key])) {
				merge(base[key], add[key], overwrite);
			} else if (overwrite) {
				base[key] = add[key];
			}
		} else {
			base[key] = add[key];
		}
	});
}

export function getConfigurationKeys(): string[] {
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
	return Object.keys(properties);
}

export function getDefaultValues(): any {
	const valueTreeRoot: any = Object.create(null);
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();

	for (let key in properties) {
		let value = properties[key].default;
		addToValueTree(valueTreeRoot, key, value, message => console.error(`Conflict in default settings: ${message}`));
	}

	return valueTreeRoot;
}

export function overrideIdentifierFromKey(key: string): string {
	return key.substring(1, key.length - 1);
}

export function keyFromOverrideIdentifier(overrideIdentifier: string): string {
	return `[${overrideIdentifier}]`;
}