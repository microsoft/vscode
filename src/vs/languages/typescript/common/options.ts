/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/objects');

interface Options {

	validate: {
		enable: boolean;
		semanticValidation: boolean;
		syntaxValidation: boolean;
	};
}

namespace Options {

	export var typeScriptOptions: Options = Object.freeze({
		validate: {
			enable: true,
			semanticValidation: true,
			syntaxValidation: true,
		}
	});

	export var javaScriptOptions: Options = Object.freeze({
		validate: {
			enable: true,
			semanticValidation: true,
			syntaxValidation: true,
		}
	});

	export function withDefaultOptions(something: any, defaults: Options): Options {
		return objects.mixin(objects.clone(defaults), something);
	}
}

export = Options;