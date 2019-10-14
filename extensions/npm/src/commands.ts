/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import * as vscode from 'vscode';

import {
	detectNpmScriptsForFolder,
	findScriptAtPosition,
	runScript
} from './tasks';

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

export async function selectAndRunScriptFromFolder(selectedFolder: vscode.Uri) {
	let taskList: { label: string, task: vscode.Task }[] = await detectNpmScriptsForFolder(selectedFolder);

	if (taskList && taskList.length > 0) {
		let result = await vscode.window.showQuickPick(taskList, { placeHolder: 'Select script' });
		if (result) {
			vscode.tasks.executeTask(result.task);
		}
	}
	else {
		vscode.window.showInformationMessage(`No npm scripts found in ${selectedFolder.fsPath}`, { modal: true });
	}
}
