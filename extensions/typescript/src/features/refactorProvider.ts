/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command, commands, workspace, WorkspaceEdit, window, QuickPickItem, Selection, Position } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';


export default class TypeScriptRefactorProvider implements CodeActionProvider {
	private doRefactorCommandId: string;
	private selectRefactorCommandId: string;

	constructor(
		private readonly client: ITypescriptServiceClient,
		mode: string
	) {
		this.doRefactorCommandId = `_typescript.applyRefactoring.${mode}`;
		this.selectRefactorCommandId = `_typescript.selectRefactoring.${mode}`;

		commands.registerCommand(this.doRefactorCommandId, this.doRefactoring, this);
		commands.registerCommand(this.selectRefactorCommandId, this.selectRefactoring, this);

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

			const actions: Command[] = [];
			for (const info of response.body) {
				if (info.inlineable === false) {
					actions.push({
						title: info.description,
						command: this.selectRefactorCommandId,
						arguments: [file, info, range]
					});
				} else {
					for (const action of info.actions) {
						actions.push({
							title: action.description,
							command: this.doRefactorCommandId,
							arguments: [file, info.name, action.name, range]
						});
					}
				}
			}
			return actions;
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

	private async selectRefactoring(file: string, info: Proto.ApplicableRefactorInfo, range: Range): Promise<boolean> {
		return window.showQuickPick(info.actions.map((action): QuickPickItem => ({
			label: action.name,
			description: action.description
		}))).then(selected => {
			if (!selected) {
				return false;
			}
			return this.doRefactoring(file, info.name, selected.label, range);
		});
	}

	private async doRefactoring(file: string, refactor: string, action: string, range: Range): Promise<boolean> {
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
		if (!(await workspace.applyEdit(edit))) {
			return false;
		}

		const renameLocation = response.body.renameLocation;
		if (renameLocation) {
			if (window.activeTextEditor && window.activeTextEditor.document.uri.fsPath === file) {
				const pos = new Position(renameLocation.line - 1, renameLocation.offset - 1);
				window.activeTextEditor.selection = new Selection(pos, pos);
				await commands.executeCommand('editor.action.rename');
			}
		}
		return true;
	}
}