/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NotebookSerializer } from './serializer';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.workspace.registerNotebookSerializer('jupyter-notebook', new NotebookSerializer(context), {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			inputCollapsed: true,
			outputCollapsed: true,
			custom: false
		}
	}));
}

export function deactivate() { }
