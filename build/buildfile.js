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

	let excludes = ['vs/css'];
	if (Array.isArray(exclude) && exclude.length > 0) {
		excludes = excludes.concat(exclude);
	}

	return {
		name,
		include: [],
		exclude: excludes
	};
}

/**
 * @param {string} name
 */
function createEditorWorkerModuleDescription(name) {
	const description = createModuleDescription(name, ['vs/base/common/worker/simpleWorker', 'vs/editor/common/services/editorSimpleWorker']);
	description.name = `${description.name}.esm`;

	return description;
}

exports.workerEditor = createEditorWorkerModuleDescription('vs/editor/common/services/editorSimpleWorker');
exports.workerExtensionHost = createEditorWorkerModuleDescription('vs/workbench/api/worker/extensionHostWorker');
exports.workerNotebook = createEditorWorkerModuleDescription('vs/workbench/contrib/notebook/common/services/notebookSimpleWorker');
exports.workerLanguageDetection = createEditorWorkerModuleDescription('vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker');
exports.workerLocalFileSearch = createEditorWorkerModuleDescription('vs/workbench/services/search/worker/localFileSearch');
exports.workerProfileAnalysis = createEditorWorkerModuleDescription('vs/platform/profiling/electron-sandbox/profileAnalysisWorker');
exports.workerOutputLinks = createEditorWorkerModuleDescription('vs/workbench/contrib/output/common/outputLinkComputer');
exports.workerBackgroundTokenization = createEditorWorkerModuleDescription('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker');

exports.workbenchDesktop = [
	createModuleDescription('vs/workbench/contrib/debug/node/telemetryApp'),
	createModuleDescription('vs/platform/files/node/watcher/watcherMain'),
	createModuleDescription('vs/platform/terminal/node/ptyHostMain'),
	createModuleDescription('vs/workbench/api/node/extensionHostProcess'),
	createModuleDescription('vs/workbench/contrib/issue/electron-sandbox/issueReporterMain'),
	createModuleDescription('vs/workbench/workbench.desktop.main')
];

exports.workbenchWeb = createModuleDescription('vs/workbench/workbench.web.main');

exports.keyboardMaps = [
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.linux'),
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.darwin'),
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.win')
];

exports.code = [
	createModuleDescription('vs/code/electron-main/main'),
	createModuleDescription('vs/code/node/cli'),
	createModuleDescription('vs/code/node/cliProcessMain', ['vs/code/node/cli']),
	createModuleDescription('vs/code/electron-utility/sharedProcess/sharedProcessMain'),
	createModuleDescription('vs/code/electron-sandbox/processExplorer/processExplorerMain')
];

exports.codeWeb = createModuleDescription('vs/code/browser/workbench/workbench');

exports.entrypoint = createModuleDescription;
