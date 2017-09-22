/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command, commands, workspace, WorkspaceEdit, window, QuickPickItem, Selection } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { tsTextSpanToVsRange, vsRangeToTsFileRange, tsLocationToVsPosition } from '../utils/convert';
import FormattingOptionsManager from './formattingConfigurationManager';

export default class TypeScriptRefactorProvider implements CodeActionProvider {
	private doRefactorCommandId: string;
	private selectRefactorCommandId: string;

	constructor(
		private readonly client: ITypescriptServiceClient,
		private formattingOptionsManager: FormattingOptionsManager,
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

		const args: Proto.GetApplicableRefactorsRequestArgs = vsRangeToTsFileRange(file, range);
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
						arguments: [document, file, info, range]
					});
				} else {
					for (const action of info.actions) {
						actions.push({
							title: action.description,
							command: this.doRefactorCommandId,
							arguments: [document, file, info.name, action.name, range]
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
					tsTextSpanToVsRange(textChange),
					textChange.newText);
			}
		}
		return workspaceEdit;
	}

	private async selectRefactoring(document: TextDocument, file: string, info: Proto.ApplicableRefactorInfo, range: Range): Promise<boolean> {
		return window.showQuickPick(info.actions.map((action): QuickPickItem => ({
			label: action.name,
			description: action.description
		}))).then(selected => {
			if (!selected) {
				return false;
			}
			return this.doRefactoring(document, file, info.name, selected.label, range);
		});
	}

	private async doRefactoring(document: TextDocument, file: string, refactor: string, action: string, range: Range): Promise<boolean> {
		await this.formattingOptionsManager.ensureFormatOptionsForDocument(document, undefined);

		const args: Proto.GetEditsForRefactorRequestArgs = {
			...vsRangeToTsFileRange(file, range),
			refactor,
			action
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
				const pos = tsLocationToVsPosition(renameLocation);
				window.activeTextEditor.selection = new Selection(pos, pos);
				await commands.executeCommand('editor.action.rename');
			}
		}
		return true;
	}
}