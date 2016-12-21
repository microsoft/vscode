/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command, commands, Uri, workspace, WorkspaceEdit, TextEdit } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

interface NumberSet {
	[key: number]: boolean;
}

interface Source {
	uri: Uri;
	version: number;
	range: Range;
}

export default class TypeScriptCodeActionProvider implements CodeActionProvider {
	private client: ITypescriptServiceClient;
	private commandId: string;

	private supportedCodeActions: Promise<NumberSet>;

	constructor(client: ITypescriptServiceClient, modeId: string) {
		this.client = client;
		this.commandId = `typescript.codeActions.${modeId}`;
		this.supportedCodeActions = client.execute('getSupportedCodeFixes', null, undefined)
			.then(response => response.body || [])
			.then(codes => {
				return codes.map(code => +code).filter(code => !isNaN(code));
			})
			.then(codes =>
				codes.reduce((obj, code) => {
					obj[code] = true;
					return obj;
				}, Object.create(null)));

		commands.registerCommand(this.commandId, this.onCodeAction, this);
	}

	public provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Thenable<Command[]> {
		const file = this.client.asAbsolutePath(document.uri);
		if (!file) {
			return Promise.resolve(null);
		}

		const source: Source = {
			uri: document.uri,
			version: document.version,
			range: range
		};
		return this.getSupportedCodeActions(context)
			.then(supportedActions => {
				return this.client.execute('getCodeFixes', {
					file: file,
					startLine: range.start.line + 1,
					endLine: range.end.line + 1,
					startOffset: range.start.character + 1,
					endOffset: range.end.character + 1,
					errorCodes: supportedActions
				}, token);
			})
			.then(response => response.body || [])
			.then(codeActions => codeActions.map(action => this.actionToEdit(source, action)));
	}

	private getSupportedCodeActions(context: CodeActionContext): Thenable<number[]> {
		return this.supportedCodeActions
			.then(supportedActions => {
				return context.diagnostics
					.map(diagnostic => +diagnostic.code)
					.filter(code => supportedActions[code]);
			});
	}

	private actionToEdit(source: Source, action: Proto.CodeAction): Command {
		const workspaceEdit = new WorkspaceEdit();
		action.changes.forEach(change => {
			change.textChanges.forEach(textChange => {
				workspaceEdit.replace(this.client.asUrl(change.fileName),
					new Range(
						textChange.start.line - 1, textChange.start.offset - 1,
						textChange.end.line - 1, textChange.end.offset - 1),
					textChange.newText);
			});
		});
		return {
			title: action.description,
			command: this.commandId,
			arguments: [source, workspaceEdit]
		};
	}

	private onCodeAction(source: Source, workspaceEdit: WorkspaceEdit) {
		workspace.applyEdit(workspaceEdit).then(success => {
			if (!success) {
				return Promise.reject(null);
			}
			// TODO: Workaround for https://github.com/Microsoft/TypeScript/issues/12249
			// apply formatting to the source range until TS returns formatted results
			return commands.executeCommand('vscode.executeFormatRangeProvider', source.uri, source.range, {}).then((edits: TextEdit[]) => {
				if (!edits || !edits.length) {
					return false;
				}
				const workspaceEdit = new WorkspaceEdit();
				workspaceEdit.set(source.uri, edits);
				return workspace.applyEdit(workspaceEdit);
			});
		});
	}
}