/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import * as vscode from 'vscode';

import {
	detectNpmScriptsForFolder,
	findScriptAtPosition,
	getPackageJsonUriFromTask,
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

export async function selectAndRunScriptFromFolder(folderInfo: vscode.Uri) {
	type TaskMap = { [id: string]: vscode.Task; };
	let taskList = await detectNpmScriptsForFolder(folderInfo.path);

	if (taskList && taskList.length > 0) {
		let taskMap: TaskMap = {};
		taskList.forEach(t => {
			let uri = getPackageJsonUriFromTask(t);
			if (uri && uri.fsPath.length >= folderInfo.fsPath.length) {
				let taskName = uri.fsPath.substring(folderInfo.fsPath.length, uri.fsPath.length - '/package.json'.length) + ' > ' + t.name.substring(0, t.name.search('-'));
				taskMap[taskName] = t;
			}
		});
		let result = await vscode.window.showQuickPick(Object.keys(taskMap).sort(), {
			placeHolder: `Run scripts on folder ${folderInfo.fsPath}...`,
		});
		if (result) {
			vscode.tasks.executeTask(taskMap[result]);
		}
	}
	else {
		vscode.window.showInformationMessage(`No scripts detected in folder ${folderInfo.path}`);
	}
}
