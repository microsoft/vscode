/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceEdit, workspace } from 'vscode';
import * as Proto from '../protocol';
import { tsTextSpanToVsRange } from './convert';
import { ITypescriptServiceClient } from '../typescriptService';


export async function applyCodeAction(
	client: ITypescriptServiceClient,
	action: Proto.CodeAction,
	file: string
): Promise<boolean> {
	if (action.changes && action.changes.length) {
		const workspaceEdit = new WorkspaceEdit();
		for (const change of action.changes) {
			for (const textChange of change.textChanges) {
				workspaceEdit.replace(client.asUrl(change.fileName),
					tsTextSpanToVsRange(textChange),
					textChange.newText);
			}
		}

		if (!(await workspace.applyEdit(workspaceEdit))) {
			return false;
		}
	}

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