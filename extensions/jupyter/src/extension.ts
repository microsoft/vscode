/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { registerNotebookSerializer } from './serializer';

export function activate(context: vscode.ExtensionContext) {
	registerNotebookSerializer(context);
}

export function deactivate() {}
