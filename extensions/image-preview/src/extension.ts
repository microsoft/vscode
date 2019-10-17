/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Preview } from './preview';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { ZoomStatusBarEntry } from './zoomStatusBarEntry';

export function activate(context: vscode.ExtensionContext) {
	const extensionRoot = vscode.Uri.file(context.extensionPath);

	const sizeStatusBarEntry = new SizeStatusBarEntry();
	context.subscriptions.push(sizeStatusBarEntry);

	const zoomStatusBarEntry = new ZoomStatusBarEntry();
	context.subscriptions.push(zoomStatusBarEntry);

	context.subscriptions.push(vscode.window.registerWebviewEditorProvider(
		Preview.viewType,
		{
			async resolveWebviewEditor(resource: vscode.Uri, editor: vscode.WebviewEditor): Promise<void> {
				// tslint:disable-next-line: no-unused-expression
				new Preview(extensionRoot, resource, editor, sizeStatusBarEntry, zoomStatusBarEntry);
			}
		}));
}