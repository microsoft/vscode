/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


self['extensions'] = {};
function wrap(name: string, script: string) {
	//https://github.com/nodejs/node/blob/master/lib/internal/modules/cjs/loader.js#L125
	return `self['extensions']['${name}']= (function (exports, require) { ${script}\n});`;
}

export function importWrappedScript(scriptSrc: string, scriptPath: string) {

	importScripts(`data:text/javascript;charset=utf-8,${encodeURIComponent(wrap(scriptPath, scriptSrc))}`);

	// const fn = new Function('exports', 'require', 'module', scriptSrc);
	// const exports = Object.create(null);
	// const thisRequire = function (path: string) {
	// 	console.log(path);
	// };
	// fn(exports, thisRequire, undefined);
	// console.log(exports);
}
