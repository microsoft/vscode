/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import platform = require('vs/platform/platform');
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');
import Options = require('vs/languages/typescript/common/options');
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

let defaults = Options.javaScriptOptions;

ModesRegistry.registerCompatMode({
	id: 'javascript',
	extensions: ['.js', '.es6'],
	firstLine: '^#!.*\\bnode',
	filenames: ['jakefile'],
	aliases: ['JavaScript', 'javascript', 'js'],
	mimetypes: ['text/javascript'],
	moduleId: 'vs/languages/javascript/common/javascript',
	ctorName: 'JSMode'
});

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'javascript',
	'order': 20,
	'type': 'object',
	'title': nls.localize('jsConfigurationTitle', "JavaScript configuration"),
	'allOf': [
		{
			'type': 'object',
			'title': nls.localize('suggestSettings', "Controls how JavaScript IntelliSense works."),
			'properties': {
				'javascript.suggest.alwaysAllWords': {
					'type': 'boolean',
					'default': defaults.suggest.alwaysAllWords,
					'description': nls.localize('allwaysAllWords', "Always include all words from the current document."),
				},
				'javascript.suggest.useCodeSnippetsOnMethodSuggest': {
					'type': 'boolean',
					'default': defaults.suggest.useCodeSnippetsOnMethodSuggest,
					'description': nls.localize('useCodeSnippetsOnMethodSuggest', "Complete functions with their parameter signature."),
				}
			}
		},
		{
			'title': nls.localize('compilationSettings', "Controls how JavaScript validation works."),
			'type': 'object',
			'properties': {
				'javascript.validate.enable': {
					'type': 'boolean',
					'default': true,
					'description': nls.localize('vsclint', "Controls VSCode's JavaScript validation. If set to false both syntax and semantic validation is disabled"),
				},
				'javascript.validate.semanticValidation': {
					'type': 'boolean',
					'default': defaults.validate.semanticValidation,
					'description': nls.localize('semanticValidation', "Run linter checks for JavaScript files - overrides validate.lint.* settings."),
				},
				'javascript.validate.syntaxValidation': {
					'type': 'boolean',
					'default': defaults.validate.syntaxValidation,
					'description': nls.localize('syntaxValidation', "Check JavaScript files for syntax errors."),
				}
			}
		}
	]
});
