/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

let statusBarEntry: vscode.StatusBarItem;

export function showHideStatus() {
	if (!statusBarEntry) {
		return;
	}
	if (!vscode.window.activeTextEditor) {
		statusBarEntry.hide();
		return;
	}
	let doc = vscode.window.activeTextEditor.document;
	if (vscode.languages.match('javascript', doc) || vscode.languages.match('javascriptreact', doc)) {
		statusBarEntry.show();
		return;
	}
	statusBarEntry.hide();
}

export function disposeStatus() {
	if (statusBarEntry) {
		statusBarEntry.dispose();
	}
}

export function show(message: string, tooltip: string, error: boolean) {
	statusBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
	statusBarEntry.text = message;
	statusBarEntry.tooltip = tooltip;
	let color = 'yellow';
	if (error) {
		color = 'red';
	}
	statusBarEntry.color = color;
	statusBarEntry.show();
}