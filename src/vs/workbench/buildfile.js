/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

function createModuleDescription(name, exclude) {
	var result = {};
	var excludes = ['vs/css', 'vs/nls'];
	result.name = name;
	if (Array.isArray(exclude) && exclude.length > 0) {
		excludes = excludes.concat(exclude);
	}
	result.exclude = excludes;
	return result;
}

exports.collectModules = function (excludes) {
	var modules = [
		createModuleDescription('vs/workbench/parts/git/node/gitApp', []),
		createModuleDescription('vs/workbench/parts/git/node/askpass', []),

		createModuleDescription('vs/workbench/parts/output/common/outputLinkComputer', ['vs/base/common/worker/simpleWorker', 'vs/editor/common/services/editorSimpleWorker']),

		createModuleDescription('vs/workbench/parts/debug/node/telemetryApp', []),

		createModuleDescription('vs/workbench/services/search/node/searchApp', []),
		createModuleDescription('vs/workbench/services/search/node/worker/searchWorkerApp', []),
		createModuleDescription('vs/workbench/services/files/node/watcher/unix/watcherApp', []),

		createModuleDescription('vs/workbench/node/extensionHostProcess', [])
	];

	return modules;
};