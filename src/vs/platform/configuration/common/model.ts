/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import * as types from 'vs/base/common/types';
import * as json from 'vs/base/common/json';
import * as objects from 'vs/base/common/objects';
import * as arrays from 'vs/base/common/arrays';
import { IConfigurationRegistry, Extensions, OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigModel, IOverrides } from 'vs/platform/configuration/common/configuration';

export function getDefaultValues(): any {
	const valueTreeRoot: any = Object.create(null);
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();

	for (let key in properties) {
		let value = properties[key].default;
		addToValueTree(valueTreeRoot, key, value, message => console.error(`Conflict in default settings: ${message}`));
	}

	return valueTreeRoot;
}

export function toValuesTree(properties: { [qualifiedKey: string]: any }, conflictReporter: (message: string) => void): any {
	const root = Object.create(null);

	for (let key in properties) {
		addToValueTree(root, key, properties[key], conflictReporter);
	}

	return root;
}

function addToValueTree(settingsTreeRoot: any, key: string, value: any, conflictReporter: (message: string) => void): void {
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

export function getConfigurationKeys(): string[] {
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();

	return Object.keys(properties);
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

interface Overrides<T> extends IOverrides<T> {
	raw: any;
}

export class ConfigModel<T> implements IConfigModel<T> {

	protected _contents: T;
	protected _overrides: IOverrides<T>[] = [];

	private _raw: any = {};
	private _unfilteredRaw: any = {};
	private _parseErrors: any[] = [];

	constructor(content: string, private name: string = '') {
		if (content) {
			this.update(content);
		}
	}

	public get contents(): T {
		return this._contents || <T>{};
	}

	public get overrides(): IOverrides<T>[] {
		return this._overrides;
	}

	public get keys(): string[] {
		return Object.keys(this._raw);
	}

	public get raw(): T {
		return this._raw;
	}

	public get unfilteredRaw(): T {
		return this._unfilteredRaw;
	}

	public get errors(): any[] {
		return this._parseErrors;
	}

	public merge(other: IConfigModel<T>, overwrite: boolean = true): ConfigModel<T> {
		const mergedModel = new ConfigModel<T>(null);
		this.doMerge(mergedModel, this, overwrite);
		this.doMerge(mergedModel, other, overwrite);
		return mergedModel;
	}

	protected doMerge(source: ConfigModel<T>, target: IConfigModel<T>, overwrite: boolean = true) {
		source._contents = objects.clone(this.contents);
		merge(source.contents, target.contents, overwrite);
		const overrides = objects.clone(source.overrides);
		for (const override of target.overrides) {
			const [sourceOverride] = overrides.filter(o => arrays.equals(o.identifiers, override.identifiers));
			if (sourceOverride) {
				merge(sourceOverride.contents, override.contents, overwrite);
			} else {
				overrides.push(override);
			}
		}
		source._overrides = overrides;
	}

	public config<V>(section: string): ConfigModel<V> {
		const result = new ConfigModel<V>(null);
		result._contents = objects.clone(this.contents[section]);
		return result;
	}

	public configWithOverrides<V>(identifier: string): ConfigModel<V> {
		const result = new ConfigModel<V>(null);
		const contents = objects.clone<any>(this.contents);
		if (this.overrides) {
			for (const override of this.overrides) {
				if (override.identifiers.indexOf(identifier) !== -1) {
					merge(contents, override.contents, true);
				}
			}
		}
		result._contents = contents;
		return result;
	}

	public update(content: string): void {
		let overrides: Overrides<T>[] = [];
		let currentProperty: string = null;
		let currentParent: any = [];
		let previousParents: any[] = [];
		let parseErrors: json.ParseError[] = [];

		function onValue(value: any) {
			if (Array.isArray(currentParent)) {
				(<any[]>currentParent).push(value);
			} else if (currentProperty) {
				currentParent[currentProperty] = value;
			}
			if (OVERRIDE_PROPERTY_PATTERN.test(currentProperty)) {
				onOverrideSettingsValue(currentProperty, value);
			}
		}

		function onOverrideSettingsValue(property: string, value: any): void {
			overrides.push({
				identifiers: [overrideIdentifierFromKey(property).trim()],
				raw: value,
				contents: null
			});
		}

		let visitor: json.JSONVisitor = {
			onObjectBegin: () => {
				let object = {};
				onValue(object);
				previousParents.push(currentParent);
				currentParent = object;
				currentProperty = null;
			},
			onObjectProperty: (name: string) => {
				currentProperty = name;
			},
			onObjectEnd: () => {
				currentParent = previousParents.pop();
			},
			onArrayBegin: () => {
				let array = [];
				onValue(array);
				previousParents.push(currentParent);
				currentParent = array;
				currentProperty = null;
			},
			onArrayEnd: () => {
				currentParent = previousParents.pop();
			},
			onLiteralValue: onValue,
			onError: (error: json.ParseErrorCode) => {
				parseErrors.push({ error: error });
			}
		};
		try {
			json.visit(content, visitor);
			this._raw = currentParent[0];
		} catch (e) {
			console.error(`Error while parsing settings file ${this.name}: ${e}`);
			this._raw = <T>{};
			this._parseErrors = [e];
		}
		this._unfilteredRaw = this._raw;
		this._raw = this.filterRaw(this._unfilteredRaw);
		this._contents = toValuesTree(this._raw, message => console.error(`Conflict in settings file ${this.name}: ${message}`));

		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		this._overrides = overrides.map<IOverrides<T>>(override => {
			// Filter unknown and non-overridable properties
			const raw = {};
			for (const key in override.raw) {
				if (configurationProperties[key] && configurationProperties[key].overridable) {
					raw[key] = override.raw[key];
				}
			}
			return {
				identifiers: override.identifiers,
				contents: <T>toValuesTree(raw, message => console.error(`Conflict in settings file ${this.name}: ${message}`))
			};
		});
	}

	/*
	 * If filterRaw is not a no-op, the returned object needs to be a copy.
	 * The input may not be modified in place. The default implementation
	 * is a no op.
	 */
	protected filterRaw(raw: any): any {
		return raw;
	}

	public refilter(): void {
		if (this._unfilteredRaw) {
			this._raw = this.filterRaw(this._unfilteredRaw);
			this._contents = toValuesTree(this._raw, message => console.error(`Conflict in settings file ${this.name}: ${message}`));
		}
	}
}

export class DefaultConfigModel<T> extends ConfigModel<T> {

	private _keys: string[];

	constructor() {
		super(null);
		this.update();
	}

	public get keys(): string[] {
		return this._keys;
	}

	public update(): void {
		this._contents = getDefaultValues(); // defaults coming from contributions to registries
		this._keys = getConfigurationKeys();
	}
}

export function overrideIdentifierFromKey(key: string): string {
	return key.substring(1, key.length - 1);
}

export function keyFromOverrideIdentifier(overrideIdentifier: string): string {
	return `[${overrideIdentifier}]`;
}