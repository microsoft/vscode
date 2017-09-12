/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command, commands, Uri, workspace, WorkspaceEdit, TextEdit, FormattingOptions, window } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

interface NumberSet {
	[key: number]: boolean;
}

interface Source {
	uri: Uri;
	version: number;
	range: Range;
	formattingOptions: FormattingOptions | undefined;
}

export default class TypeScriptCodeActionProvider implements CodeActionProvider {
	private commandId: string;

	private _supportedCodeActions?: Thenable<NumberSet>;

	constructor(
		private readonly client: ITypescriptServiceClient,
		mode: string
	) {
		this.commandId = `_typescript.applyCodeAction.${mode}`;
		commands.registerCommand(this.commandId, this.onCodeAction, this);
	}

	public async provideCodeActions(
		document: TextDocument,
		range: Range,
		context: CodeActionContext,
		token: CancellationToken
	): Promise<Command[]> {
		if (!this.client.apiVersion.has213Features()) {
			return [];
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		const supportedActions = await this.getSupportedActionsForContext(context);
		if (!supportedActions.size) {
			return [];
		}

		let formattingOptions: FormattingOptions | undefined = undefined;
		for (const editor of window.visibleTextEditors) {
			if (editor.document.fileName === document.fileName) {
				formattingOptions = { tabSize: editor.options.tabSize, insertSpaces: editor.options.insertSpaces } as FormattingOptions;
				break;
			}
		}

		const source: Source = {
			uri: document.uri,
			version: document.version,
			range: range,
			formattingOptions: formattingOptions
		};
		const args: Proto.CodeFixRequestArgs = {
			file: file,
			startLine: range.start.line + 1,
			endLine: range.end.line + 1,
			startOffset: range.start.character + 1,
			endOffset: range.end.character + 1,
			errorCodes: Array.from(supportedActions)
		};
		const response = await this.client.execute('getCodeFixes', args, token);
		return (response.body || []).map(action => this.getCommandForAction(source, action));
	}

	private get supportedCodeActions(): Thenable<NumberSet> {
		if (!this._supportedCodeActions) {
			this._supportedCodeActions = this.client.execute('getSupportedCodeFixes', null, undefined)
				.then(response => response.body || [])
				.then(codes => codes.map(code => +code).filter(code => !isNaN(code)))
				.then(codes =>
					codes.reduce((obj, code) => {
						obj[code] = true;
						return obj;
					}, Object.create(null)));
		}
		return this._supportedCodeActions;
	}

	private getSupportedActionsForContext(context: CodeActionContext): Thenable<Set<number>> {
		return this.supportedCodeActions.then(supportedActions =>
			new Set(context.diagnostics
				.map(diagnostic => +diagnostic.code)
				.filter(code => supportedActions[code])));
	}

	private getCommandForAction(source: Source, action: Proto.CodeAction): Command {
		return {
			title: action.description,
			command: this.commandId,
			arguments: [source, action]
		};
	}

	private async onCodeAction(source: Source, action: Proto.CodeAction): Promise<boolean> {
		const workspaceEdit = new WorkspaceEdit();
		for (const change of action.changes) {
			for (const textChange of change.textChanges) {
				workspaceEdit.replace(this.client.asUrl(change.fileName),
					new Range(
						textChange.start.line - 1, textChange.start.offset - 1,
						textChange.end.line - 1, textChange.end.offset - 1),
					textChange.newText);
			}
		}

		const success = workspace.applyEdit(workspaceEdit);
		if (!success) {
			return false;
		}

		let firstEdit: TextEdit | undefined = undefined;
		for (const [uri, edits] of workspaceEdit.entries()) {
			if (uri.fsPath === source.uri.fsPath) {
				firstEdit = edits[0];
				break;
			}
		}

		if (!firstEdit) {
			return true;
		}

		const newLines = firstEdit.newText.match(/\n/g);
		const editedRange = new Range(
			firstEdit.range.start.line, 0,
			firstEdit.range.end.line + 1 + (newLines ? newLines.length : 0), 0);
		// TODO: Workaround for https://github.com/Microsoft/TypeScript/issues/12249
		// apply formatting to the source range until TS returns formatted results
		const edits = (await commands.executeCommand('vscode.executeFormatRangeProvider', source.uri, editedRange, source.formattingOptions || {})) as TextEdit[];
		if (!edits || !edits.length) {
			return false;
		}
		const formattingEdit = new WorkspaceEdit();
		formattingEdit.set(source.uri, edits);
		return workspace.applyEdit(formattingEdit);
	}
}