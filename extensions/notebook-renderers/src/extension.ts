/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NteractRenderer } from './nteractRenderer';

export function activate(context: vscode.ExtensionContext) {
	console.log(context.extensionPath);

	context.subscriptions.push(vscode.window.registerNotebookOutputRenderer(
		'nteract',
		{
			type: 'display_data',
			subTypes: [
				'text/latex',
				'text/markdown',
				'application/json',
				'application/vnd.plotly.v1+json',
				'application/vnd.vega.v5+json'
			]
		},
		new NteractRenderer(context.extensionPath))
	);
}

