/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./typescript';
import nls = require('vs/nls');
import platform = require('vs/platform/platform');
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');
import options = require('vs/languages/typescript/common/options');
let defaults = options.typeScriptOptions;

// ----- Registration and Configuration --------------------------------------------------------

ModesRegistry.registerCompatMode({
	id: 'typescript',
	extensions: ['.ts'],
	aliases: ['TypeScript', 'ts', 'typescript'],
	mimetypes: ['text/typescript'],
	moduleId: 'vs/languages/typescript/common/typescriptMode',
	ctorName: 'TypeScriptMode'
});

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'typescript',
	'order': 20,
	'title': nls.localize('tsConfigurationTitle', "TypeScript configuration"),
	'allOf': [
		{
			'type': 'object',
			'title': nls.localize('suggestSettings', "Controls how TypeScript IntelliSense works."),
			'properties': {
				'typescript.suggest.alwaysAllWords': {
					'type': 'boolean',
					'default': defaults.suggest.alwaysAllWords,
					'description': nls.localize('allwaysAllWords', "Always include all words from the current document."),
				},
				'typescript.suggest.useCodeSnippetsOnMethodSuggest': {
					'type': 'boolean',
					'default': defaults.suggest.useCodeSnippetsOnMethodSuggest,
					'description': nls.localize('useCodeSnippetsOnMethodSuggest', "Complete functions with their parameter signature."),
				}
			}
		}
	]
});

