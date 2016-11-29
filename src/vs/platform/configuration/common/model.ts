/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

export function getDefaultValues(): any {
	const valueTreeRoot: any = Object.create(null);
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();

	for (let key in properties) {
		let value = properties[key].default;
		addToValueTree(valueTreeRoot, key, value);
	}

	return valueTreeRoot;
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