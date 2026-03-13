/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../src/vs/monaco.d.ts" />
/* eslint-disable local/code-no-standalone-editor */

export * from '../../src/vs/editor/editor.main';
import './style.css';
import * as monaco from '../../src/vs/editor/editor.main';

globalThis.monaco = monaco;
const root = document.getElementById('sampleContent');
if (root) {
	const d = monaco.editor.createDiffEditor(root);

	d.setModel({
		modified: monaco.editor.createModel(`hello world`),
		original: monaco.editor.createModel(`hello monaco`),
	});
}
