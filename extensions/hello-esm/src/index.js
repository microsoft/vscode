/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

console.log(vscode)

export const activate = () => {
	vscode.commands.registerCommand('hello-esm.hello', () => {
		vscode.window.showInformationMessage('hello world esm');
	})
};
