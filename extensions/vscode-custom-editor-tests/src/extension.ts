/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AbcTextEditorProvider } from './customTextEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(new AbcTextEditorProvider(context).register());
}
