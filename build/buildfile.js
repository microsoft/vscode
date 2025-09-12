/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

/**
 * @param {string} name
 * @returns {import('./lib/bundle').IEntryPoint}
 */
function createModuleDescription(name) {
	return {
		name
	};
}

exports.workerEditor = createModuleDescription('vs/editor/common/services/editorWebWorkerMain');
exports.workerExtensionHost = createModuleDescription('vs/workbench/api/worker/extensionHostWorkerMain');
exports.workerNotebook = createModuleDescription('vs/workbench/contrib/notebook/common/services/notebookWebWorkerMain');
exports.workerLanguageDetection = createModuleDescription('vs/workbench/services/languageDetection/browser/languageDetectionWebWorkerMain');
exports.workerLocalFileSearch = createModuleDescription('vs/workbench/services/search/worker/localFileSearchMain');
exports.workerProfileAnalysis = createModuleDescription('vs/platform/profiling/electron-browser/profileAnalysisWorkerMain');
exports.workerOutputLinks = createModuleDescription('vs/workbench/contrib/output/common/outputLinkComputerMain');
exports.workerBackgroundTokenization = createModuleDescription('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain');

exports.workbenchDesktop = [
	createModuleDescription('vs/workbench/contrib/debug/node/telemetryApp'),
	createModuleDescription('vs/platform/files/node/watcher/watcherMain'),
	createModuleDescription('vs/platform/terminal/node/ptyHostMain'),
	createModuleDescription('vs/workbench/api/node/extensionHostProcess'),
	createModuleDescription('vs/workbench/workbench.desktop.main')
];

exports.workbenchWeb = createModuleDescription('vs/workbench/workbench.web.main');

exports.keyboardMaps = [
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.linux'),
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.darwin'),
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.win')
];

exports.code = [
	// 'vs/code/electron-main/main' is not included here because it comes in via ./src/main.js
	// 'vs/code/node/cli' is not included here because it comes in via ./src/cli.js
	createModuleDescription('vs/code/node/cliProcessMain'),
	createModuleDescription('vs/code/electron-utility/sharedProcess/sharedProcessMain'),
	createModuleDescription('vs/code/electron-browser/workbench/workbench'),
];

exports.codeWeb = createModuleDescription('vs/code/browser/workbench/workbench');

exports.codeServer = [
	// 'vs/server/node/server.main' is not included here because it gets inlined via ./src/server-main.js
	// 'vs/server/node/server.cli' is not included here because it gets inlined via ./src/server-cli.js
	createModuleDescription('vs/workbench/api/node/extensionHostProcess'),
	createModuleDescription('vs/platform/files/node/watcher/watcherMain'),
	createModuleDescription('vs/platform/terminal/node/ptyHostMain')
];

exports.entrypoint = createModuleDescription;
