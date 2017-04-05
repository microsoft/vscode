/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

const statusItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE);

export interface BuildInfo {
	queueLength: number;
}

export function update(info: BuildInfo): void {
	if (info.queueLength === 0) {
		statusItem.hide();
		return;
	}
	statusItem.text = info.queueLength.toString();
	statusItem.show();
}