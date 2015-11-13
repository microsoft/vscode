/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

function createModuleDescription(name, exclude) {
	var result= {};
	result.name= name;
	var excludes = ['vs/css', 'vs/nls', 'vs/text'];
	if (Array.isArray(exclude) && exclude.length > 0) {
		excludes = excludes.concat(exclude);
	}
	result.exclude= excludes;
	return result;
}

function addInclude(config, include) {
	if (!config.include) {
		config.include = [];
	}
	config.include.push(include);
	return config;
}

exports.collectModules= function() {
	return [
		// Include the severity module into the base worker code since it is used by many languages
		// It can cause waterfall loading if one language excludes another language it depends on and
		// both use vs/base/common/severity
		addInclude(
			createModuleDescription('vs/editor/common/worker/editorWorkerServer', ['vs/base/common/worker/workerServer']),
			'vs/base/common/severity'
		)
	];
};