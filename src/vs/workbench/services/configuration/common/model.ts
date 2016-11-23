/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/objects');
import types = require('vs/base/common/types');
import json = require('vs/base/common/json');
import { toValuesTree } from 'vs/platform/configuration/common/model';
import { CONFIG_DEFAULT_NAME, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';

export interface IConfigFile {
	contents: any;
	raw?: any;
	parseError?: any;
}

export function newConfigFile(value: string): IConfigFile {
	try {
		const contents = json.parse(value) || {};
		return {
			contents: toValuesTree(contents),
			raw: contents
		};
	} catch (e) {
		return {
			contents: {},
			parseError: e
		};
	}
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

export function consolidate(configMap: { [key: string]: IConfigFile; }): { contents: any; parseErrors: string[]; } {
	const finalConfig: any = Object.create(null);
	const parseErrors: string[] = [];
	const regexp = /\/([^\.]*)*\.json/;

	// We want to use the default settings file as base and let all other config
	// files overwrite the base one
	const configurationFiles = Object.keys(configMap);
	const defaultIndex = configurationFiles.indexOf(WORKSPACE_CONFIG_DEFAULT_PATH);
	if (defaultIndex > 0) {
		configurationFiles.unshift(configurationFiles.splice(defaultIndex, 1)[0]);
	}

	// For each config file in .vscode folder
	configurationFiles.forEach(configFileName => {
		const config = objects.clone(configMap[configFileName]);
		const matches = regexp.exec(configFileName);
		if (!matches || !config) {
			return;
		}

		// Extract the config key from the file name (except for settings.json which is the default)
		let configElement: any = finalConfig;
		if (matches && matches[1] && matches[1] !== CONFIG_DEFAULT_NAME) {

			// Use the name of the file as top level config section for all settings inside
			const configSection = matches[1];
			let element = configElement[configSection];
			if (!element) {
				element = Object.create(null);
				configElement[configSection] = element;
			}
			configElement = element;
		}

		merge(configElement, config.contents, true);
		if (config.parseError) {
			parseErrors.push(configFileName);
		}
	});

	return {
		contents: finalConfig,
		parseErrors: parseErrors
	};
}