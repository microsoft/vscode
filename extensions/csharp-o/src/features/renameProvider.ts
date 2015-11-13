/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import AbstractSupport from './abstractProvider';
import * as proto from '../protocol';
import {createRequest, toRange} from '../typeConvertion';
import {RenameProvider, TextEdit, WorkspaceEdit, TextDocument, Uri, CancellationToken, Position, Range} from 'vscode';

export default class OmnisharpRenameProvider extends AbstractSupport implements RenameProvider {

	public provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): Promise<WorkspaceEdit> {

		let request = createRequest<proto.RenameRequest>(document, position);
		request.WantsTextChanges = true,
		request.RenameTo = newName;

		return this._server.makeRequest<proto.RenameResponse>(proto.Rename, request, token).then(response => {

			if (!response) {
				return;
			}

			const edit = new WorkspaceEdit();
			response.Changes.forEach(change => {
				const uri = Uri.file(change.FileName);
				change.Changes.forEach(change => {
					edit.replace(uri,
						new Range(change.StartLine - 1, change.StartColumn - 1, change.EndLine - 1, change.EndColumn - 1),
						change.NewText);
				});
			});

			return edit;
		});
	}
}
