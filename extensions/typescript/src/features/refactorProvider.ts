/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { tsTextSpanToVsRange, vsRangeToTsFileRange, tsLocationToVsPosition } from '../utils/convert';
import FormattingOptionsManager from './formattingConfigurationManager';
import { CommandManager, Command } from '../utils/commandManager';

class ApplyRefactoringCommand implements Command {
	public static readonly ID = '_typescript.applyRefactoring';
	public readonly id = ApplyRefactoringCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private formattingOptionsManager: FormattingOptionsManager
	) { }

	public async execute(
		document: vscode.TextDocument,
		file: string,
		refactor: string,
		action: string,
		range: vscode.Range
	): Promise<boolean> {
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
		if (!(await vscode.workspace.applyEdit(edit))) {
			return false;
		}

		const renameLocation = response.body.renameLocation;
		if (renameLocation) {
			if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath === file) {
				const pos = tsLocationToVsPosition(renameLocation);
				vscode.window.activeTextEditor.selection = new vscode.Selection(pos, pos);
				await vscode.commands.executeCommand('editor.action.rename');
			}
		}
		return true;
	}

	private toWorkspaceEdit(edits: Proto.FileCodeEdits[]): vscode.WorkspaceEdit {
		const workspaceEdit = new vscode.WorkspaceEdit();
		for (const edit of edits) {
			for (const textChange of edit.textChanges) {
				workspaceEdit.replace(this.client.asUrl(edit.fileName),
					tsTextSpanToVsRange(textChange),
					textChange.newText);
			}
		}
		return workspaceEdit;
	}
}

class SelectRefactorCommand implements Command {
	public static readonly ID = '_typescript.selectRefactoring';
	public readonly id = SelectRefactorCommand.ID;

	constructor(
		private readonly doRefactoring: ApplyRefactoringCommand
	) { }

	public async execute(
		document: vscode.TextDocument,
		file: string,
		info: Proto.ApplicableRefactorInfo,
		range: vscode.Range
	): Promise<boolean> {
		const selected = await vscode.window.showQuickPick(info.actions.map((action): vscode.QuickPickItem => ({
			label: action.name,
			description: action.description
		})));
		if (!selected) {
			return false;
		}
		return this.doRefactoring.execute(document, file, info.name, selected.label, range);
	}
}

export default class TypeScriptRefactorProvider implements vscode.CodeActionProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient,
		formattingOptionsManager: FormattingOptionsManager,
		commandManager: CommandManager
	) {
		const doRefactoringCommand = commandManager.register(new ApplyRefactoringCommand(this.client, formattingOptionsManager));
		commandManager.register(new SelectRefactorCommand(doRefactoringCommand));
	}

	public async provideCodeActions() {
		// Uses provideCodeActions2 instead
		return [];
	}

	public async provideCodeActions2(
		document: vscode.TextDocument,
		range: vscode.Range,
		_context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.CodeAction[]> {
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

			const actions: vscode.CodeAction[] = [];
			for (const info of response.body) {
				if (info.inlineable === false) {
					actions.push({
						title: info.description,
						command: {
							title: info.description,
							command: SelectRefactorCommand.ID,
							arguments: [document, file, info, range]
						}
					});
				} else {
					for (const action of info.actions) {
						actions.push({
							title: info.description,
							command: {
								title: info.description,
								command: ApplyRefactoringCommand.ID,
								arguments: [document, file, info.name, action.name, range]
							}
						});
					}
				}
			}
			return actions;
		} catch (err) {
			return [];
		}
	}
}