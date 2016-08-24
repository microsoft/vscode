/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import types = require('vs/base/common/types');
import {IConfigurationNode, IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';

export function setNode(root: any, key: string, value: any): void {
	const segments = key.split('.');
	const last = segments.pop();

	let curr = root;
	segments.forEach(s => {
		let obj = curr[s];
		switch (typeof obj) {
			case 'undefined':
				obj = curr[s] = Object.create(null);
				break;
			case 'object':
				break;
			default:
				console.log('Conflicting configuration setting: ' + key + ' at ' + s + ' with ' + JSON.stringify(obj));
		}
		curr = obj;
	});

	curr[last] = value;
}

function processDefaultValues(withConfig: (config: IConfigurationNode, isTop?: boolean) => boolean): void {
	const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();

	const visit = (config: IConfigurationNode, level: number) => {
		const handled = withConfig(config, level === 0);

		if (Array.isArray(config.allOf)) {
			config.allOf.forEach((c) => {
				// if the config node only contains an `allOf` we treat the `allOf` children as if they were at the top level
				visit(c, (!handled && level === 0) ? level : level + 1);
			});
		}
	};

	configurations.sort((c1, c2) => {
		if (typeof c1.order !== 'number') {
			return 1;
		}

		if (typeof c2.order !== 'number') {
			return -1;
		}
		if (c1.order === c2.order) {
			const title1 = c1.title || '';
			const title2 = c2.title || '';
			return title1.localeCompare(title2);
		}
		return c1.order - c2.order;
	}).forEach((config) => {
		visit(config, 0);
	});
}

export function getDefaultValues(): any {
	const ret: any = Object.create(null);

	const handleConfig = (config: IConfigurationNode, isTop: boolean): boolean => {
		if (config.properties) {
			Object.keys(config.properties).forEach((key) => {
				const prop = config.properties[key];
				let value = prop.default;
				if (types.isUndefined(prop.default)) {
					value = getDefaultValue(prop.type);
				}
				setNode(ret, key, value);
			});

			return true;
		}

		return false;
	};

	processDefaultValues(handleConfig);

	return ret;
}

export function getDefaultValuesContent(indent: string): string {
	let lastEntry = -1;
	const result: string[] = [];
	result.push('{');

	const handleConfig = (config: IConfigurationNode, isTop: boolean): boolean => {
		let handled = false;
		if (config.title) {
			handled = true;
			if (isTop) {
				result.push('');
				result.push('// ' + config.title);
			} else {
				result.push(indent + '// ' + config.title);
			}
			result.push('');
		}

		if (config.properties) {
			handled = true;
			Object.keys(config.properties).forEach((key) => {

				const prop = config.properties[key];
				let defaultValue = prop.default;
				if (types.isUndefined(defaultValue)) {
					defaultValue = getDefaultValue(prop.type);
				}
				if (prop.description) {
					result.push(indent + '// ' + prop.description);
				}

				let valueString = JSON.stringify(defaultValue, null, indent);
				if (valueString && (typeof defaultValue === 'object')) {
					valueString = addIndent(valueString, indent);
				}

				if (lastEntry !== -1) {
					result[lastEntry] += ',';
				}
				lastEntry = result.length;

				result.push(indent + JSON.stringify(key) + ': ' + valueString);
				result.push('');
			});
		}

		return handled;
	};

	processDefaultValues(handleConfig);

	result.push('}');

	return result.join('\n');
}

function addIndent(str: string, indent: string): string {
	return str.split('\n').join('\n' + indent);
}

function getDefaultValue(type: string | string[]): any {
	const t = Array.isArray(type) ? (<string[]>type)[0] : <string>type;
	switch (t) {
		case 'boolean':
			return false;
		case 'integer':
		case 'number':
			return 0;
		case 'string':
			return '';
		case 'array':
			return [];
		case 'object':
			return {};
		default:
			return null;
	}
}

export function flatten(contents: any): any {
	const root = Object.create(null);

	for (let key in contents) {
		setNode(root, key, contents[key]);
	}

	return root;
}

export function getConfigurationKeys(): string[] {
	const keys: string[] = [];

	const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
	configurations.forEach(config => {
		if (config.properties) {
			keys.push(...Object.keys(config.properties));
		}
	});

	return keys;
}