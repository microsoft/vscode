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
		},
		{
			'type': 'object',
			'title': nls.localize('lint', "Controls various aspects of validation."),
			'properties': {
				'javascript.validate.lint.curlyBracketsMustNotBeOmitted': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.curlyBracketsMustNotBeOmitted,
					'description': nls.localize('lint.curlyBracketsMustNotBeOmitted', "Don't spare curly brackets."),
				},
				'javascript.validate.lint.emptyBlocksWithoutComment': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.emptyBlocksWithoutComment,
					'description': nls.localize('lint.emptyBlocksWithoutComment', "Empty block should have a comment."),
				},
				'javascript.validate.lint.comparisonOperatorsNotStrict': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.comparisonOperatorsNotStrict,
					'description': nls.localize('lint.comparisonOperatorsNotStrict', "Use '!==' and '===' instead of '!=' and '=='."),
				},
				'javascript.validate.lint.missingSemicolon': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.missingSemicolon,
					'description': nls.localize('lint.missingSemicolon', "Missing semicolon."),
				},
				'javascript.validate.lint.unknownTypeOfResults': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unknownTypeOfResults,
					'description': nls.localize('lint.unknownTypeOfResults', "Unexpected output of the 'typeof' operator."),
				},
				'javascript.validate.lint.semicolonsInsteadOfBlocks': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.semicolonsInsteadOfBlocks,
					'description': nls.localize('lint.semicolonsInsteadOfBlocks', "Semicolon instead of block."),
				},
				'javascript.validate.lint.functionsInsideLoops': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.functionsInsideLoops,
					'description': nls.localize('lint.functionsInsideLoops', "Function inside loop."),
				},
				'javascript.validate.lint.newOnLowercaseFunctions': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.newOnLowercaseFunctions,
					'description': nls.localize('lint.newOnLowercaseFunctions', "Function with lowercase name used as constructor."),
				},
				'javascript.validate.lint.tripleSlashReferenceAlike': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.tripleSlashReferenceAlike,
					'description': nls.localize('lint.tripleSlashReferenceAlike', "Looks for mistyped triple-slash references."),
				},
				'javascript.validate.lint.unusedVariables': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unusedVariables,
					'description': nls.localize('lint.unusedVariables', "Unused local variable."),
				},
				'javascript.validate.lint.unusedFunctions': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unusedFunctions,
					'description': nls.localize('lint.unusedFunctions', "Unused local function."),
				},

				// below rules are changing the severity of some
				// TypeScript diagnostics, e.g ignore unknown property
				'javascript.validate.lint.parametersDontMatchSignature': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.parametersDontMatchSignature,
					'description': nls.localize('lint.parametersDontMatchSignature', "Parameters don't match a function signature"),
				},
				'javascript.validate.lint.redeclaredVariables': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.redeclaredVariables,
					'description': nls.localize('lint.redeclaredVariables', "Don't re-declare a variable and change its type."),
				},
				'javascript.validate.lint.undeclaredVariables': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.undeclaredVariables,
					'description': nls.localize('lint.undeclaredVariables', "Don't use an undeclared variable."),
				},
				'javascript.validate.lint.unknownProperty': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unknownProperty,
					'description': nls.localize('lint.unknownProperty', "Don't use an unknown property."),
				},
				'javascript.validate.lint.unknownModule': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.unknownModule,
					'description': nls.localize('lint.unknownModule', "Don't require an unknown module."),
				},
				'javascript.validate.lint.forcedTypeConversion': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.forcedTypeConversion,
					'description': nls.localize('lint.forcedTypeConversion', "Don't re-declare a variable type by an assignment."),
				},
				'javascript.validate.lint.mixedTypesArithmetics': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.mixedTypesArithmetics,
					'description': nls.localize('lint.mixedTypesArithmetics', "Only use numbers for arithmetic operations."),
				},
				'javascript.validate.lint.primitivesInInstanceOf': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.primitivesInInstanceOf,
					'description': nls.localize('lint.primitivesInInstanceOf', "Don't use instanceof with primitive types."),
				},
				'javascript.validate.lint.newOnReturningFunctions': {
					'enum': ['ignore', 'warning', 'error'],
					'default': defaults.validate.lint.newOnReturningFunctions,
					'description': nls.localize('lint.newOnReturningFunctions', "Function with return statement used as constructor."),
				}
			}
		}
	]
});
