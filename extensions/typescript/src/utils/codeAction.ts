/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceEdit, workspace } from 'vscode';
import * as Proto from '../protocol';
import { tsTextSpanToVsRange } from './convert';
import { ITypeScriptServiceClient } from '../typescriptService';

export function getEditForCodeAction(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction
): WorkspaceEdit | undefined {
	if (action.changes && action.changes.length) {
		const workspaceEdit = new WorkspaceEdit();
		for (const change of action.changes) {
			for (const textChange of change.textChanges) {
				workspaceEdit.replace(client.asUrl(change.fileName),
					tsTextSpanToVsRange(textChange),
					textChange.newText);
			}
		}

		return workspaceEdit;
	}
	return undefined;
}

export async function applyCodeAction(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction,
	file: string
): Promise<boolean> {
	const workspaceEdit = getEditForCodeAction(client, action);
	if (workspaceEdit) {
		if (!(await workspace.applyEdit(workspaceEdit))) {
			return false;
		}
	}
	return applyCodeActionCommands(client, action, file);
}

export async function applyCodeActionCommands(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction,
	file: string
): Promise<boolean> {
	if (action.commands && action.commands.length) {
		for (const command of action.commands) {
			const response = await client.execute('applyCodeActionCommand', { file, command });
			if (!response || !response.body) {
				return false;
			}
		}
	}
	return true;
}