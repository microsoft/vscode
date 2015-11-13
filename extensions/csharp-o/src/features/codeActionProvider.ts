/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {CodeActionProvider, CodeActionContext, Command, CancellationToken, TextDocument, WorkspaceEdit, TextEdit, Range, Uri, workspace, commands} from 'vscode';
import {OmnisharpServer} from '../omnisharpServer';
import AbstractProvider from './abstractProvider';
import {TextChange, V2} from '../protocol';
import {toRange2} from '../typeConvertion';

export default class OmnisharpCodeActionProvider extends AbstractProvider implements CodeActionProvider {

	private _disabled: boolean;
	private _commandId: string;

	constructor(server: OmnisharpServer) {
		super(server);
		this._commandId = 'omnisharp.runCodeAction';

		this._updateEnablement();
		let d1 = workspace.onDidChangeConfiguration(this._updateEnablement, this);
		let d2 = commands.registerCommand(this._commandId, this._runCodeAction, this);
		this._disposables.push(d1, d2);
	}

	private _updateEnablement(): void {
		let value = workspace.getConfiguration().get('csharp.disableCodeActions', false);
		this._disabled = value;
	}

	public provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Promise<Command[]> {

		if (this._disabled) {
			return;
		}

		let req: V2.GetCodeActionsRequest = {
			Filename: document.fileName,
			Selection: OmnisharpCodeActionProvider._asRange(range)
		}

		return this._server.makeRequest<V2.GetCodeActionsResponse>(V2.GetCodeActions, req, token).then(response => {
			return response.CodeActions.map(ca => {
				return {
					title: ca.Name,
					command: this._commandId,
					arguments: [ca.Identifier, document, range]
				};
			});
		}, (error) => {
			return Promise.reject('Problem invoking \'GetCodeActions\' on OmniSharp server: ' + error);
		});
	}

	private _runCodeAction(id: string, document: TextDocument, range: Range): Promise<any> {

		let req: V2.RunCodeActionRequest = {
			Filename: document.fileName,
			Selection: OmnisharpCodeActionProvider._asRange(range),
			Identifier: id,
			WantsTextChanges: true
		};

		return this._server.makeRequest<V2.RunCodeActionResponse>(V2.RunCodeAction, req).then(response => {

			if (response && Array.isArray(response.Changes)) {

				let edit = new WorkspaceEdit();

				for (let change of response.Changes) {
					let uri = Uri.file(change.FileName);
					let edits: TextEdit[] = [];
					for (let textChange of change.Changes) {
						edits.push(TextEdit.replace(toRange2(textChange), textChange.NewText));
					}

					edit.set(uri, edits);
				}

				return workspace.applyEdit(edit);
			}

		}, (error) => {
			return Promise.reject('Problem invoking \'RunCodeAction\' on OmniSharp server: ' + error);
		});
	}

	private static _asRange(range: Range): V2.Range {
		let {start, end} = range;
		return {
			Start: { Line: start.line + 1, Column: start.character + 1 },
			End: { Line: end.line + 1, Column: end.character + 1 }
		};
	}
}
