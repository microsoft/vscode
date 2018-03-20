/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as Proto from '../protocol';
import { tsTextSpanToVsRange } from './convert';

export function createWorkspaceEditFromFileCodeEdits(
	client: ITypeScriptServiceClient,
	edits: Iterable<Proto.FileCodeEdits>
): vscode.WorkspaceEdit {
	const workspaceEdit = new vscode.WorkspaceEdit();
	for (const edit of edits) {
		for (const textChange of edit.textChanges) {
			workspaceEdit.replace(client.asUrl(edit.fileName),
				tsTextSpanToVsRange(textChange),
				textChange.newText);
		}
	}

	return workspaceEdit;
}

export function tsCodeEditToVsTextEdit(edit: Proto.CodeEdit): vscode.TextEdit {
	return new vscode.TextEdit(
		tsTextSpanToVsRange(edit),
		edit.newText);
}