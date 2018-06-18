/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceEdit, workspace } from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from './typeConverters';

export function getEditForCodeAction(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction
): WorkspaceEdit | undefined {
	return action.changes && action.changes.length
		? typeConverters.WorkspaceEdit.fromFromFileCodeEdits(client, action.changes)
		: undefined;
}

export async function applyCodeAction(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction
): Promise<boolean> {
	const workspaceEdit = getEditForCodeAction(client, action);
	if (workspaceEdit) {
		if (!(await workspace.applyEdit(workspaceEdit))) {
			return false;
		}
	}
	return applyCodeActionCommands(client, action);
}

export async function applyCodeActionCommands(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction
): Promise<boolean> {
	if (action.commands && action.commands.length) {
		for (const command of action.commands) {
			const response = await client.execute('applyCodeActionCommand', { command });
			if (!response || !response.body) {
				return false;
			}
		}
	}
	return true;
}