/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as monaco from 'monaco-editor-core';

monaco.editor.create(document.getElementById('container'), {
	value: 'Hello world'
});

// The diff is computed in the editor worker.
const diffEditor = monaco.editor.createDiffEditor(document.getElementById('diff-container'));
diffEditor.setModel({
	original: monaco.editor.createModel('a\nb\nc', 'plaintext'),
	modified: monaco.editor.createModel('a\nB\nc\nd', 'plaintext'),
});
diffEditor.onDidUpdateDiff(() => {
	globalThis.esmCheck = {
		done: true,
		lineChanges: (diffEditor.getLineChanges() ?? []).map(c => [c.originalStartLineNumber, c.originalEndLineNumber, c.modifiedStartLineNumber, c.modifiedEndLineNumber]),
	};
});