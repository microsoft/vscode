/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/objects');
import types = require('vs/base/common/types');
import json = require('vs/base/common/json');
import model = require('vs/platform/configuration/common/model');
import {CONFIG_DEFAULT_NAME} from 'vs/workbench/services/configuration/common/configuration';

export interface IConfigFile {
	contents: any;
	parseError?: any;
}

export function newConfigFile(value: string): IConfigFile {
	try {
		const root: any = Object.create(null);
		const contents = json.parse(value) || {};
		for (let key in contents) {
			model.setNode(root, key, contents[key]);
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
	const finalConfig: any = Object.create(null);
	const parseErrors: string[] = [];
	const regexp = /\/(team\.)?([^\.]*)*\.json/;

	// For each config file in .vscode folder
	Object.keys(configMap).forEach((configFileName) => {
		const config = objects.clone(configMap[configFileName]);
		const matches = regexp.exec(configFileName);
		if (!matches || !config) {
			return;
		}

		// If a file is team.foo.json, it indicates team settings, strip this away
		const isTeamSetting = !!matches[1];

		// Extract the config key from the file name (except for settings.json which is the default)
		let configElement: any = finalConfig;
		if (matches && matches[2] && matches[2] !== CONFIG_DEFAULT_NAME) {

			// Use the name of the file as top level config section for all settings inside
			const configSection = matches[2];
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