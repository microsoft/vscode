/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @param {string} name
 * @param {string[]=} exclude
 */
function createModuleDescription(name, exclude) {

	let excludes = ['vs/css', 'vs/nls'];
	if (Array.isArray(exclude) && exclude.length > 0) {
		excludes = excludes.concat(exclude);
	}

	return {
		name: name,
		include: [],
		exclude: excludes
	};
}

/**
 * @param {string} name
 */
function createEditorWorkerModuleDescription(name) {
	return createModuleDescription(name, ['vs/base/common/worker/simpleWorker', 'vs/editor/common/services/editorSimpleWorker']);
}

exports.base = [
	{
		name: 'vs/editor/common/services/editorSimpleWorker',
		include: ['vs/base/common/worker/simpleWorker'],
		exclude: ['vs/nls'],
		prepend: [
			{ path: 'vs/loader.js' },
			{ path: 'vs/base/worker/workerMain.js' }
		],
		dest: 'vs/base/worker/workerMain.js'
	},
	{
		name: 'vs/base/common/worker/simpleWorker',
		exclude: ['vs/nls'],
	}
];

exports.workerExtensionHost = [createEditorWorkerModuleDescription('vs/workbench/api/worker/extensionHostWorker')];
exports.workerNotebook = [createEditorWorkerModuleDescription('vs/workbench/contrib/notebook/common/services/notebookSimpleWorker')];
exports.workerLanguageDetection = [createEditorWorkerModuleDescription('vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker')];
exports.workerLocalFileSearch = [createEditorWorkerModuleDescription('vs/workbench/services/search/worker/localFileSearch')];
exports.workerProfileAnalysis = [createEditorWorkerModuleDescription('vs/platform/profiling/electron-sandbox/profileAnalysisWorker')];

exports.workbenchDesktop = [
	createEditorWorkerModuleDescription('vs/workbench/contrib/output/common/outputLinkComputer'),
	createEditorWorkerModuleDescription('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker'),
	createModuleDescription('vs/workbench/contrib/debug/node/telemetryApp'),
	createModuleDescription('vs/platform/files/node/watcher/watcherMain'),
	createModuleDescription('vs/platform/terminal/node/ptyHostMain'),
	createModuleDescription('vs/workbench/api/node/extensionHostProcess')
];

exports.workbenchWeb = [
	createEditorWorkerModuleDescription('vs/workbench/contrib/output/common/outputLinkComputer'),
	createEditorWorkerModuleDescription('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker'),
	createModuleDescription('vs/code/browser/workbench/workbench', ['vs/workbench/workbench.web.main'])
];

exports.keyboardMaps = [
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.linux'),
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.darwin'),
	createModuleDescription('vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.win')
];

exports.code = [
	createModuleDescription('vs/code/electron-main/main'),
	createModuleDescription('vs/code/node/cli'),
	createModuleDescription('vs/code/node/cliProcessMain', ['vs/code/node/cli']),
	createModuleDescription('vs/code/electron-sandbox/issue/issueReporterMain'),
	createModuleDescription('vs/code/node/sharedProcess/sharedProcessMain'),
	createModuleDescription('vs/code/electron-sandbox/processExplorer/processExplorerMain')
];

exports.entrypoint = createModuleDescription;
