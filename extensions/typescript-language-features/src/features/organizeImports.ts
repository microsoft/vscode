/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { Command, CommandManager } from '../utils/commandManager';
import { isSupportedLanguageMode } from '../utils/languageModeIds';
import * as typeconverts from '../utils/typeConverters';

const localize = nls.loadMessageBundle();


class OrganizeImportsCommand implements Command {
	public static readonly Id = '_typescript.organizeImports';

	public readonly id = OrganizeImportsCommand.Id;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(): Promise<boolean> {
		if (!this.client.apiVersion.has280Features()) {
			return false;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor || !isSupportedLanguageMode(editor.document)) {
			return false;
		}

		const file = this.client.normalizePath(editor.document.uri);
		if (!file) {
			return false;
		}

		const args: Proto.OrganizeImportsRequestArgs = {
			scope: {
				type: 'file',
				args: {
					file
				}
			}
		};
		const response = await this.client.execute('organizeImports', args);
		if (!response || !response.success) {
			return false;
		}

		const edits = typeconverts.WorkspaceEdit.fromFromFileCodeEdits(this.client, response.body);
		return await vscode.workspace.applyEdit(edits);
	}
}

export class OrganizeImportsCodeActionProvider implements vscode.CodeActionProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient,
		commandManager: CommandManager
	) {
		commandManager.register(new OrganizeImportsCommand(client));
	}

	public readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [vscode.CodeActionKind.SourceOrganizeImports]
	};

	public provideCodeActions(
		_document: vscode.TextDocument,
		_range: vscode.Range,
		_context: vscode.CodeActionContext,
		_token: vscode.CancellationToken
	): vscode.CodeAction[] {
		if (!this.client.apiVersion.has280Features()) {
			return [];
		}

		const action = new vscode.CodeAction(
			localize('oraganizeImportsAction.title', "Organize Imports"),
			vscode.CodeActionKind.SourceOrganizeImports);
		action.command = { title: '', command: OrganizeImportsCommand.Id };
		return [action];
	}
}