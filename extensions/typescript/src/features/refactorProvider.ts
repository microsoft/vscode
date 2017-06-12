/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command, commands, workspace, WorkspaceEdit } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';


export default class TypeScriptRefactorProvider implements CodeActionProvider {
	private doRefactorCommandId: string;

	constructor(
		private readonly client: ITypescriptServiceClient,
		mode: string
	) {
		this.doRefactorCommandId = `_typescript.applyRefactoring.${mode}`;
		commands.registerCommand(this.doRefactorCommandId, this.onCodeAction, this);
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

			return Array.prototype.concat.apply([], response.body.map(info =>
				info.actions.map(action => ({
					title: action.description,
					command: this.doRefactorCommandId,
					arguments: [file, info.name, action.name, range]
				}))));
		} catch (err) {
			return [];
		}
	}

	private toWorkspaceEdit(edits: Proto.FileCodeEdits[]): WorkspaceEdit {
		const workspaceEdit = new WorkspaceEdit();
		for (const edit of edits) {
			for (const textChange of edit.textChanges) {
				workspaceEdit.replace(this.client.asUrl(edit.fileName),
					new Range(
						textChange.start.line - 1, textChange.start.offset - 1,
						textChange.end.line - 1, textChange.end.offset - 1),
					textChange.newText);
			}
		}
		return workspaceEdit;
	}

	private async onCodeAction(file: string, refactor: string, action: string, range: Range): Promise<boolean> {
		const args: Proto.GetEditsForRefactorRequestArgs = {
			file,
			refactor,
			action,
			startLine: range.start.line + 1,
			startOffset: range.start.character + 1,
			endLine: range.end.line + 1,
			endOffset: range.end.character + 1
		};

		const response = await this.client.execute('getEditsForRefactor', args);
		if (!response || !response.body || !response.body.edits.length) {
			return false;
		}

		const edit = this.toWorkspaceEdit(response.body.edits);
		return workspace.applyEdit(edit);
	}
}