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

exports.collectModules = function(excludes) {
	var languageMainExcludes = ['vs/editor/common/languages.common'];
	var languageWorkerExcludes = ['vs/base/common/worker/workerServer', 'vs/editor/common/worker/editorWorkerServer'];

	var modules = [
		createModuleDescription('vs/workbench/parts/search/browser/searchViewlet', excludes),
		createModuleDescription('vs/workbench/parts/search/browser/openAnythingHandler', excludes),

		createModuleDescription('vs/workbench/parts/git/browser/gitViewlet', excludes),
		createModuleDescription('vs/workbench/parts/git/node/gitApp', []),
		createModuleDescription('vs/workbench/parts/git/node/askpass', []),

		createModuleDescription('vs/workbench/parts/output/common/outputMode', languageMainExcludes),
		createModuleDescription('vs/workbench/parts/output/common/outputWorker', languageWorkerExcludes),
		createModuleDescription('vs/workbench/parts/output/browser/outputPanel', excludes),

		createModuleDescription('vs/workbench/parts/debug/browser/debugViewlet', excludes),
		createModuleDescription('vs/workbench/parts/debug/electron-browser/repl', excludes),
		createModuleDescription('vs/workbench/parts/debug/node/telemetryApp', []),

		createModuleDescription('vs/workbench/parts/extensions/electron-browser/extensionsViewlet', excludes),

		createModuleDescription('vs/workbench/parts/markers/browser/markersPanel', excludes),

		createModuleDescription('vs/workbench/parts/terminal/electron-browser/terminalPanel', excludes),

		createModuleDescription('vs/workbench/services/search/node/searchApp', []),
		createModuleDescription('vs/workbench/services/files/node/watcher/unix/watcherApp', []),

		createModuleDescription('vs/workbench/node/extensionHostProcess', []),
	];

	return modules;
};