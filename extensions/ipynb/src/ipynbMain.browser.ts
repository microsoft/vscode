/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as main from './ipynbMain';
import { NotebookSerializer } from './notebookSerializer.web';

export function activate(context: vscode.ExtensionContext) {
	return main.activate(context, new NotebookSerializer(context));
}

export function deactivate() {
	return main.deactivate();
}
