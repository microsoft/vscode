/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

const versionBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);

export function showHideStatus() {
	if (!versionBarEntry) {
		return;
	}
	if (!vscode.window.activeTextEditor) {
		versionBarEntry.hide();
		return;
	}

	let doc = vscode.window.activeTextEditor.document;
	if (vscode.languages.match('typescript', doc) || vscode.languages.match('typescriptreact', doc)) {
		versionBarEntry.show();
		return;
	}

	if (!vscode.window.activeTextEditor.viewColumn) {
		// viewColumn is undefined for the debug/output panel, but we still want
		// to show the version info
		return;
	}

	versionBarEntry.hide();
}

export function disposeStatus() {
	if (versionBarEntry) {
		versionBarEntry.dispose();
	}
}

export function setInfo(message: string, tooltip: string) {
	versionBarEntry.text = message;
	versionBarEntry.tooltip = tooltip;
	versionBarEntry.color = 'white';
	versionBarEntry.command = 'typescript.selectTypeScriptVersion';
}
