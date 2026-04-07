/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { enableHotReload, hotRequire } from '@hediet/node-reload';
import path from 'path';
import { IDebugValueEditorGlobals, IPlaygroundRunnerGlobals } from '../src/util/common/debugValueEditorGlobals';

enableHotReload({ loggingEnabled: true });


/** See {@link file://./../.vscode/extensions/visualization-runner/README.md}, this is for stests and jsx tree visualization */

function run(args: { fileName: string; path: string }) {
	console.log('> Running test: ' + args.path);
	setTestFile(args.fileName);
	setTest(args.path);
	runCurrentTest();
}

const g = globalThis as any as IDebugValueEditorGlobals & IPlaygroundRunnerGlobals;
g.$$playgroundRunner_data = { currentPath: [] };


g.$$debugValueEditor_run = (...args) => { setTimeout(() => run(...args), 0); };
(g.$$debugValueEditor_debugChannels ?? (g.$$debugValueEditor_debugChannels = {}))['run'] = host => ({
	handleRequest: (args) => { setTimeout(() => run(args as any), 0); }
});

let runnerFn: (typeof import('./testVisualizationRunnerSTestRunner'))['run'] | undefined = undefined;

let hotRequireDisposable: any;
let currentFileName: string | undefined = undefined;
function setTestFile(fileName: string) {
	if (currentFileName === fileName) {
		return;
	}
	currentFileName = fileName;
	if (hotRequireDisposable) { hotRequireDisposable.dispose(); }
	let isFirst = true;
	hotRequireDisposable = hotRequire(module, './testVisualizationRunnerSTestRunner.ts', (cur: typeof import('./testVisualizationRunnerSTestRunner')) => {
		runnerFn = cur.run;

		if (isFirst) {
			console.log('> Loading tests');
			isFirst = false;
		} else {
			console.log('> Running test: ' + currentFullName);
			runCurrentTest();
		}
	});
}


let currentFullName: string = '';
function setTest(path: string) {
	currentFullName = path;
	g.$$playgroundRunner_data.currentPath = [path];
}
setTest('');

async function runCurrentTest() {
	const normalizedFileName = path.join(__dirname, path.relative(__dirname, currentFileName!));
	if (!runnerFn) {
		console.error('Runner not loaded yet');
	} else {
		runnerFn(normalizedFileName, currentFullName);
	}
}

console.log('> Playground runner ready.');
