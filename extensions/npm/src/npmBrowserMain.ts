/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { addJSONProviders } from './features/jsonContributions';
import { xhr } from './fetch';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	context.subscriptions.push(addJSONProviders(xhr, undefined));
}

export function deactivate(): void {
}
