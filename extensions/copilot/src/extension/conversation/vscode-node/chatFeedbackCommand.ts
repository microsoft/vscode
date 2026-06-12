/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export async function sendChatFeedback(): Promise<unknown> {
	return vscode.commands.executeCommand('github.copilot.report', 'Copilot chat feedback');
}
