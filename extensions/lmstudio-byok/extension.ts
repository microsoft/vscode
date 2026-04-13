/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LMStudioLMProvider } from './lmstudioProvider';

export function activate(context: vscode.ExtensionContext) {
	const provider = new LMStudioLMProvider();
	context.subscriptions.push(provider);
	context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider('lmstudio', provider));
}
