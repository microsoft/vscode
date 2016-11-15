/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import { IConfigurationNode, IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

export function getDefaultValues(): any {
	const valueTreeRoot: any = Object.create(null);
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
	for (let key in properties) {
		let value = properties[key].default;
		addToValueTree(valueTreeRoot, key, value);
	}
	return valueTreeRoot;
}

export function getDefaultValuesContent(indent: string): string {
	let lastEntry = -1;
	const result: string[] = [];
	result.push('{');

	const handleConfig = (config: IConfigurationNode, hasTopLevelTitle: boolean) => {
		if (config.title) {
			if (!hasTopLevelTitle) {
				result.push('');
				result.push('// ' + config.title);
				hasTopLevelTitle = true;
			} else {
				result.push(indent + '// ' + config.title);
			}
			result.push('');
		}

		if (config.properties) {
			Object.keys(config.properties).forEach((key) => {

				const prop = config.properties[key];

				if (prop.description) {
					result.push(indent + '// ' + prop.description);
				}
				let defaultValue = prop.default;
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

		if (config.allOf) {
			config.allOf.forEach(c => handleConfig(c, hasTopLevelTitle));
		}
	};

	const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
	configurations.sort(compareConfigurationNodes).forEach(c => handleConfig(c, false));

	result.push('}');

	return result.join('\n');
}

function compareConfigurationNodes(c1: IConfigurationNode, c2: IConfigurationNode): number {
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
}

function addIndent(str: string, indent: string): string {
	return str.split('\n').join('\n' + indent);
}

export function toValuesTree(properties: { [qualifiedKey: string]: any }): any {
	const root = Object.create(null);
	for (let key in properties) {
		addToValueTree(root, key, properties[key]);
	}
	return root;
}

function addToValueTree(settingsTreeRoot: any, key: string, value: any): void {
	const segments = key.split('.');
	const last = segments.pop();

	let curr = settingsTreeRoot;
	segments.forEach(s => {
		let obj = curr[s];
		switch (typeof obj) {
			case 'undefined':
				obj = curr[s] = Object.create(null);
				break;
			case 'object':
				break;
			default:
				console.error(`Conflicting configuration setting: ${key} at ${s} with ${JSON.stringify(obj)}`);
		}
		curr = obj;
	});

	if (typeof curr === 'object') {
		curr[last] = value; // workaround https://github.com/Microsoft/vscode/issues/13606
	}
}

export function getConfigurationKeys(): string[] {
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
	return Object.keys(properties);
}