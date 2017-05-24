/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command, commands, workspace, WorkspaceEdit } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';


export default class TypeScriptRefactorProvider implements CodeActionProvider {
	private commandId: string;

	constructor(
		private readonly client: ITypescriptServiceClient,
		mode: string
	) {
		this.commandId = `_typescript.applyRefactoring.${mode}`;
		commands.registerCommand(this.commandId, this.onCodeAction, this);
	}

	public async provideCodeActions(
		document: TextDocument,
		range: Range,
		_context: CodeActionContext,
		token: CancellationToken
	): Promise<Command[]> {
		if (!this.client.apiVersion.has240Features()) {
			return [];
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		const args: Proto.GetApplicableRefactorsRequestArgs = {
			file: file,
			startLine: range.start.line + 1,
			startOffset: range.start.character + 1,
			endLine: range.end.line + 1,
			endOffset: range.end.character + 1
		};

		try {
			const response = await this.client.execute('getApplicableRefactors', args, token);
			if (!response || !response.body) {
				return [];
			}

			return response.body.map(action => ({
				title: action.description,
				command: this.commandId,
				arguments: [file, action.name, range]
			}));
		} catch (err) {
			this.client.error(`'getApplicableRefactors' request failed with error.`, err);
			return [];
		}
	}

	private actionsToEdit(actions: Proto.CodeAction[]): WorkspaceEdit {
		const workspaceEdit = new WorkspaceEdit();
		for (const action of actions) {
			for (const change of action.changes) {
				for (const textChange of change.textChanges) {
					workspaceEdit.replace(this.client.asUrl(change.fileName),
						new Range(
							textChange.start.line - 1, textChange.start.offset - 1,
							textChange.end.line - 1, textChange.end.offset - 1),
						textChange.newText);
				}
			}
		}
		return workspaceEdit;
	}

	private async onCodeAction(file: string, refactorName: string, range: Range): Promise<boolean> {
		const args: Proto.GetRefactorCodeActionsRequestArgs = {
			file,
			refactorName,
			startLine: range.start.line + 1,
			startOffset: range.start.character + 1,
			endLine: range.end.line + 1,
			endOffset: range.end.character + 1
		};

		const response = await this.client.execute('getRefactorCodeActions', args);
		if (!response || !response.body || !response.body.actions.length) {
			return false;
		}

		const edit = this.actionsToEdit(response.body.actions);
		return workspace.applyEdit(edit);
	}
}