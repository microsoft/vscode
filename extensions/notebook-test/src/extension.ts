/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NotebookProvider } from './notebookProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log(context.extensionPath);

	context.subscriptions.push(vscode.window.registerNotebookProvider('jupyter', new NotebookProvider()));
}

