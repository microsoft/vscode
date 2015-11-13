/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import paths = require('vs/base/common/paths');
import strings = require('vs/base/common/strings');

export interface IModulePath {
	value: string;
	alternateValue?: string;
}

var dtsExt = '.d.ts';

export function internal(path:string, relativeTo:string):IModulePath {
	return { value: paths.join(paths.dirname(relativeTo), path) };
}

export function external(path: string, relativeTo: string, moduleRoot: string = strings.empty): IModulePath {

	var extname = paths.extname(path);
	switch (extname) {
		case '.js':
		case '.ts':
			// reference was far.js or far.ts which we 
			// remove from path and store in extname
			path = path.substring(0, path.length - extname.length);
			break;
		default:
			// keep the file extension
			extname = paths.extname(relativeTo);
			break;
	}

	var basepath = paths.isRelative(path) ?
		paths.join(paths.dirname(relativeTo), path) :
		paths.join(moduleRoot, path);

	return {
		value: basepath + extname,
		alternateValue: basepath + dtsExt
	};
}
