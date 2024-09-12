/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as main from './ipynbMain';
import { NotebookSerializer } from './notebookSerializer.node';

export function activate(context: vscode.ExtensionContext) {
	return main.activate(context, new NotebookSerializer(context));
}

export function deactivate() {
	return main.deactivate();
}
