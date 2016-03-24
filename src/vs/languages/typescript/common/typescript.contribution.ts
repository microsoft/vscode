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
		},

		/* Note: we cannot enable this feature because in VS this is an ultimate feature and not available for free
		{
			'type': 'object',
			'properties': {
				'typescript.referenceInfos': {
					'type': 'boolean',
					'description': nls.localize('referenceInfos', "Enables reference infos for types, methods and functions."),
					'default': false
				}
			}
		},*/
		{
			'type': 'object',
			'title': nls.localize('lint', "Controls various aspects of validation."),
			'properties': {
				'typescript.validate.lint.curlyBracketsMustNotBeOmitted': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.curlyBracketsMustNotBeOmitted,
					'description': nls.localize('lint.curlyBracketsMustNotBeOmitted', "Don't spare curly brackets."),
				},
				'typescript.validate.lint.emptyBlocksWithoutComment': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.emptyBlocksWithoutComment,
					'description': nls.localize('lint.emptyBlocksWithoutComment', "Empty block should have a comment."),
				},
				'typescript.validate.lint.comparisonOperatorsNotStrict': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.comparisonOperatorsNotStrict,
					'description': nls.localize('lint.comparisonOperatorsNotStrict', "Use '!==' and '===' instead of '!=' and '=='."),
				},
				'typescript.validate.lint.missingSemicolon': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.missingSemicolon,
					'description': nls.localize('lint.missingSemicolon', "Missing semicolon."),
				},
				'typescript.validate.lint.unknownTypeOfResults': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unknownTypeOfResults,
					'description': nls.localize('lint.unknownTypeOfResults', "Unexpected output of the 'typeof'-operator."),
				},
				'typescript.validate.lint.semicolonsInsteadOfBlocks': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.semicolonsInsteadOfBlocks,
					'description': nls.localize('lint.semicolonsInsteadOfBlocks', "Semicolon instead of block."),
				},
				'typescript.validate.lint.functionsInsideLoops': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.functionsInsideLoops,
					'description': nls.localize('lint.functionsInsideLoops', "Function inside loop."),
				},
				'typescript.validate.lint.newOnLowercaseFunctions': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.newOnLowercaseFunctions,
					'description': nls.localize('lint.newOnLowercaseFunctions', "Function with lowercase name used as constructor."),
				},
				'typescript.validate.lint.tripleSlashReferenceAlike': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.tripleSlashReferenceAlike,
					'description': nls.localize('lint.tripleSlashReferenceAlike', "Looks for mistyped triple-slash references."),
				},
				'typescript.validate.lint.unusedVariables': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unusedVariables,
					'description': nls.localize('lint.unusedVariables', "Unused local variable."),
				},
				'typescript.validate.lint.unusedFunctions': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unusedFunctions,
					'description': nls.localize('lint.unusedFunctions', "Unused local function."),
				},
				'typescript.validate.lint.unusedMembers': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unusedMembers,
					'description': nls.localize('lint.unusedMembers', "Unused private member."),
				},
				'typescript.validate.lint.functionsWithoutReturnType': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.functionsWithoutReturnType,
					'description': nls.localize('lint.functionsWithoutReturnType', "Don't spare the return-type annotation for functions."),
				}
			}
		}
	]
});

