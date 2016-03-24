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
			_surpressSuperWithoutSuperTypeError: false
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
			_surpressSuperWithoutSuperTypeError: false
		}
	});

	export function withDefaultOptions(something: any, defaults: Options): Options {
		return objects.mixin(objects.clone(defaults), something);
	}
}

export = Options;