/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as cp from 'child_process';


export function activate(context: vscode.ExtensionContext) {
	const releaseNotesShown = 'javascript.releasenotesshown';

	if (!context.globalState.get(releaseNotesShown)) {
		// cheating with nls, this is a temporary extenion only, that doesn't need be localized
		vscode.window.showInformationMessage('The JavaScript infrastructure has changed, please read the change notes.', 'Change Notes').then(selection => {
			if (selection) {
				open('http://go.microsoft.com/fwlink/?LinkId=733559');
			}
			context.globalState.update(releaseNotesShown, true);
		});
	}
}

function open(url: string) {
	var cmd: string;

	switch (process.platform) {
		case 'darwin':
			cmd = 'open';
			break;
		case 'win32':
			cmd = 'start';
			break;
		default:
			cmd = 'xdg-open';
	}
	return cp.exec(cmd + ' ' + url);
}

export function deactivate() {
}