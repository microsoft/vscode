/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../src/vs/monaco.d.ts" />

// eslint-disable-next-line local/code-no-standalone-editor
import * as monaco from '../src/vs/editor/editor.main.ts';

// Make monaco available globally for fiddling in the console.
globalThis.monaco = monaco;

window.MonacoEnvironment = {
	getWorker(workerId, label) {
		switch (label) {
			case 'editorWorkerService':
				return new Worker(new URL('../src/vs/editor/editor.worker.start.ts', import.meta.url), {
					type: 'module'
				});
			default:
				throw new Error(`Unknown worker label: ${label}`);
		}
	},
};
