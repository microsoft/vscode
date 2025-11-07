/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../src/vs/monaco.d.ts" />

import './style.css';

/* eslint-disable local/code-no-standalone-editor */
export * from '../../src/vs/editor/editor.main';

import * as monaco from '../../src/vs/editor/editor.main';

globalThis.monaco = monaco;

/*
const root = document.getElementById('root')!;
const d = m.editor.createDiffEditor(root);

d.setModel({
	modified: m.editor.createModel(`hello world`),
	original: m.editor.createModel(`hello monaco`),
});

*/
