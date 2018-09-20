/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import {
	runScript, findScriptAtPosition
} from './tasks';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function runSelectedScript() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	let document = editor.document;
	let contents = document.getText();
	let selection = editor.selection;
	let offset = document.offsetAt(selection.anchor);

	let script = findScriptAtPosition(contents, offset);
	if (script) {
		runScript(script, document);
	} else {
		let message = localize('noScriptFound', 'Could not find a valid npm script at the selection.');
		vscode.window.showErrorMessage(message);
	}
}