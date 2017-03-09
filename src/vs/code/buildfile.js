/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

function createModuleDescription(name, exclude) {
	var result= {};
	var excludes = ['vs/css', 'vs/nls'];
	result.name= name;
	if (Array.isArray(exclude) && exclude.length > 0) {
		excludes = excludes.concat(exclude);
	}
	result.exclude= excludes;
	return result;
}

exports.collectModules= function() {
	return [
		createModuleDescription('vs/code/electron-main/main', []),
		createModuleDescription('vs/code/node/cli', []),
		createModuleDescription('vs/code/node/cliProcessMain', ['vs/code/node/cli']),
		createModuleDescription('vs/code/electron-browser/sharedProcessMain', [])
	];
};