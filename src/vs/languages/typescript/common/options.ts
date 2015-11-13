/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/objects');

interface Options {

	suggest: {
		alwaysAllWords: boolean;
		useCodeSnippetsOnMethodSuggest: boolean;
	};
	validate: {
		enable: boolean;
		semanticValidation: boolean;
		syntaxValidation: boolean;
		_surpressSuperWithoutSuperTypeError: boolean;
		lint: {
			comparisonOperatorsNotStrict: string;
			curlyBracketsMustNotBeOmitted: string;
			emptyBlocksWithoutComment: string;
			forcedTypeConversion: string;
			functionsInsideLoops: string;
			functionsWithoutReturnType: string;
			missingSemicolon: string;
			mixedTypesArithmetics: string;
			newOnLowercaseFunctions: string;
			newOnReturningFunctions: string;
			parametersDontMatchSignature: string;
			parametersOptionalButNotLast: string;
			primitivesInInstanceOf: string;
			redeclaredVariables: string;
			semicolonsInsteadOfBlocks: string;
			tripleSlashReferenceAlike: string;
			undeclaredVariables: string;
			unknownModule: string;
			unknownProperty: string;
			unknownTypeOfResults: string;
			unusedFunctions: string;
			unusedImports: string;
			unusedMembers: string;
			unusedVariables: string;
		};
	};
}

namespace Options {

	export var typeScriptOptions: Options = Object.freeze({
		suggest: {
			alwaysAllWords: false,
			useCodeSnippetsOnMethodSuggest: false
		},
		validate: {
			enable: true,
			semanticValidation: true,
			syntaxValidation: true,
			_surpressSuperWithoutSuperTypeError: false,
			lint: {
				comparisonOperatorsNotStrict: 'ignore',
				curlyBracketsMustNotBeOmitted: 'ignore',
				emptyBlocksWithoutComment: 'ignore',
				functionsInsideLoops: 'ignore',
				functionsWithoutReturnType: 'ignore',
				missingSemicolon: 'ignore',
				newOnLowercaseFunctions: 'ignore',
				semicolonsInsteadOfBlocks: 'ignore',
				tripleSlashReferenceAlike: 'ignore',
				unknownTypeOfResults: 'ignore',
				unusedFunctions: 'ignore',
				unusedImports: 'ignore',
				unusedMembers: 'ignore',
				unusedVariables: 'ignore',

				// the below lint checks are done by
				// the TypeScript compiler and we can
				// change the severity with this. Tho
				// the default remains error
				forcedTypeConversion: 'error',
				mixedTypesArithmetics: 'error',
				newOnReturningFunctions: 'error',
				parametersDontMatchSignature: 'error',
				parametersOptionalButNotLast: 'error',
				primitivesInInstanceOf: 'error',
				redeclaredVariables: 'error',
				undeclaredVariables: 'error',
				unknownModule: 'error',
				unknownProperty: 'error',
			}
		}
	});

	export var javaScriptOptions: Options = Object.freeze({
		suggest: {
			alwaysAllWords: false,
			useCodeSnippetsOnMethodSuggest: false
		},
		validate: {
			enable: true,
			semanticValidation: true,
			syntaxValidation: true,
			_surpressSuperWithoutSuperTypeError: false,
			lint: {
				comparisonOperatorsNotStrict: 'ignore',
				curlyBracketsMustNotBeOmitted: 'ignore',
				emptyBlocksWithoutComment: 'ignore',
				forcedTypeConversion: 'warning',
				functionsInsideLoops: 'ignore',
				functionsWithoutReturnType: 'ignore',
				missingSemicolon: 'ignore',
				mixedTypesArithmetics: 'warning',
				newOnLowercaseFunctions: 'warning',
				newOnReturningFunctions: 'warning',
				parametersDontMatchSignature: 'ignore',
				parametersOptionalButNotLast: 'ignore',
				primitivesInInstanceOf: 'error',
				redeclaredVariables: 'warning',
				semicolonsInsteadOfBlocks: 'ignore',
				tripleSlashReferenceAlike: 'warning',
				undeclaredVariables: 'warning',
				unknownModule: 'ignore',
				unknownProperty: 'ignore',
				unknownTypeOfResults: 'warning',
				unusedFunctions: 'ignore',
				unusedImports: 'ignore',
				unusedMembers: 'ignore',
				unusedVariables: 'warning',
			}
		}
	});

	export function withDefaultOptions(something: any, defaults: Options): Options {
		return objects.mixin(objects.clone(defaults), something);
	}
}

export = Options;