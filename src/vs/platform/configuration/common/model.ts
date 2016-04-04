/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/objects');
import platform = require('vs/platform/platform');
import types = require('vs/base/common/types');
import json = require('vs/base/common/json');

import configurationRegistry = require('./configurationRegistry');

export const CONFIG_DEFAULT_NAME = 'settings';

export interface IConfigFile {
	contents: any;
	parseError?: any;
}

function setNode(root: any, key: string, value: any): void {
	let segments = key.split('.');
	let last = segments.pop();

	let curr = root;
	segments.forEach((s) => {
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


export function newConfigFile(value: string): IConfigFile {
	try {
		let root: any = Object.create(null);
		let contents = json.parse(value) || {};
		for (let key in contents) {
			setNode(root, key, contents[key]);
		}
		return {
			contents: root
		};
	} catch (e) {
		return {
			contents: {},
			parseError: e
		};
	}
}

export function merge(base: any, add: any, overwrite: boolean): void {
	Object.keys(add).forEach((key) => {
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

export function consolidate(configMap: { [key: string]: IConfigFile; }): { contents: any; parseErrors: string[]; } {
	let finalConfig: any = Object.create(null);
	let parseErrors: string[] = [];
	let regexp = /\/(team\.)?([^\.]*)*\.json/;

	// For each config file in .vscode folder
	Object.keys(configMap).forEach((configFileName) => {
		let config = objects.clone(configMap[configFileName]);

		let matches = regexp.exec(configFileName);
		if (!matches) {
			return;
		}

		// If a file is team.foo.json, it indicates team settings, strip this away
		let isTeamSetting = !!matches[1];

		// Extract the config key from the file name (except for settings.json which is the default)
		let configElement: any = finalConfig;
		if (matches && matches[2] && matches[2] !== CONFIG_DEFAULT_NAME) {

			// Use the name of the file as top level config section for all settings inside
			let configSection = matches[2];
			let element = configElement[configSection];
			if (!element) {
				element = Object.create(null);
				configElement[configSection] = element;
			}
			configElement = element;
		}

		merge(configElement, config.contents, !isTeamSetting /* user settings overrule team settings */);
		if (config.parseError) {
			parseErrors.push(configFileName);
		}

	});

	return {
		contents: finalConfig,
		parseErrors: parseErrors
	};
}

// defaults...

function processDefaultValues(withConfig: (config: configurationRegistry.IConfigurationNode, isTop?: boolean) => void): void {

	let configurations = (<configurationRegistry.IConfigurationRegistry>platform.Registry.as(configurationRegistry.Extensions.Configuration)).getConfigurations();

	let visit = (config: configurationRegistry.IConfigurationNode, isFirst: boolean) => {
		withConfig(config, isFirst);

		if (Array.isArray(config.allOf)) {
			config.allOf.forEach((c) => {
				visit(c, false);
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

		return c1.order - c2.order;
	}).forEach((config) => {
		visit(config, true);
	});
}


export function getDefaultValues(): any {
	let ret: any = Object.create(null);

	let handleConfig = (config: configurationRegistry.IConfigurationNode, isTop: boolean) => {
		if (config.properties) {
			Object.keys(config.properties).forEach((key) => {
				let prop = config.properties[key];
				let value = prop.default;
				if (types.isUndefined(prop.default)) {
					value = getDefaultValue(prop.type);
				}
				setNode(ret, key, value);
			});
		}
	};
	processDefaultValues(handleConfig);
	return ret;
}


export function getDefaultValuesContent(): string {
	let lastEntry = -1;
	let result: string[] = [];
	result.push('{');

	let handleConfig = (config: configurationRegistry.IConfigurationNode, isTop: boolean) => {

		if (config.title) {
			if (isTop) {
				result.push('');
				result.push('\t//-------- ' + config.title + ' --------');
			} else {
				result.push('\t// ' + config.title);
			}
			result.push('');
		}
		if (config.properties) {
			Object.keys(config.properties).forEach((key) => {

				let prop = config.properties[key];
				let defaultValue = prop.default;
				if (types.isUndefined(defaultValue)) {
					defaultValue = getDefaultValue(prop.type);
				}
				if (prop.description) {
					result.push('\t// ' + prop.description);
				}

				let valueString = JSON.stringify(defaultValue, null, '\t');
				if (valueString && (typeof defaultValue === 'object')) {
					valueString = addIndent(valueString);
				}

				if (lastEntry !== -1) {
					result[lastEntry] += ',';
				}
				lastEntry = result.length;

				result.push('\t' + JSON.stringify(key) + ': ' + valueString);
				result.push('');
			});
		}
	};
	processDefaultValues(handleConfig);

	result.push('}');
	return result.join('\n');
}

function addIndent(str: string): string {
	return str.split('\n').join('\n\t');
}

function getDefaultValue(type: string | string[]): any {
	let t = Array.isArray(type) ? (<string[]> type)[0] : <string> type;
	switch (t) {
		case 'boolean':
			return false;
		case 'integer':
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