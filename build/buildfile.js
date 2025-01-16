/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @param {string} name
 * @param {string[]=} exclude
 * @returns {import('./lib/bundle').IEntryPoint}
 */
function createModuleDescription(name, exclude) {
	return {
		name,
		exclude
	};
}

/**
 * @param {string} name
 */
function createEditorWorkerModuleDescription(name) {
	return createModuleDescription(name, ['vs/base/common/worker/simpleWorker', 'vs/editor/common/services/editorSimpleWorker']);
}

exports.workerEditor = createEditorWorkerModuleDescription('vs/editor/common/services/editorSimpleWorkerMain');
exports.workerExtensionHost = createEditorWorkerModuleDescription('vs/workbench/api/worker/extensionHostWorkerMain');
exports.workerNotebook = createEditorWorkerModuleDescription('vs/workbench/contrib/notebook/common/services/notebookSimpleWorkerMain');
exports.workerLanguageDetection = createEditorWorkerModuleDescription('vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorkerMain');
exports.workerLocalFileSearch = createEditorWorkerModuleDescription('vs/workbench/services/search/worker/localFileSearchMain');
exports.workerProfileAnalysis = createEditorWorkerModuleDescription('vs/platform/profiling/electron-sandbox/profileAnalysisWorkerMain');
exports.workerOutputLinks = createEditorWorkerModuleDescription('vs/workbench/contrib/output/common/outputLinkComputerMain');
exports.workerBackgroundTokenization = createEditorWorkerModuleDescription('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain');

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
	createModuleDescription('vs/code/electron-sandbox/processExplorer/processExplorerMain'),
	createModuleDescription('vs/code/electron-sandbox/workbench/workbench'),
	createModuleDescription('vs/code/electron-sandbox/processExplorer/processExplorer')
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
