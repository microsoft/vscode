/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RenameProvider, WorkspaceEdit, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptRenameProvider implements RenameProvider {

	private client: ITypescriptServiceClient;

	public tokens: string[] = [];

	public constructor(client: ITypescriptServiceClient) {
		this.client = client;
	}

	public provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): Promise<WorkspaceEdit> {
		let args: Proto.RenameRequestArgs = {
			file: this.client.asAbsolutePath(document.uri),
			line: position.line + 1,
			offset: position.character + 1,
			findInStrings: false,
			findInComments: false
		};
		if (!args.file) {
			return Promise.resolve<WorkspaceEdit>(null);
		}

		return this.client.execute('rename', args, token).then((response) => {
			let renameResponse = response.body;
			let renameInfo = renameResponse.info;
			let result = new WorkspaceEdit();

			if (!renameInfo.canRename) {
				return Promise.reject<WorkspaceEdit>(renameInfo.localizedErrorMessage);
			}

			renameResponse.locs.forEach((spanGroup) => {
				let resource = this.client.asUrl(spanGroup.file);
				if (!resource) {
					return;
				}
				spanGroup.locs.forEach((textSpan) => {
					result.replace(resource,
						new Range(textSpan.start.line - 1, textSpan.start.offset - 1, textSpan.end.line - 1, textSpan.end.offset - 1),
						newName);
				});
			});
			return result;
		}, (err) => {
			return null;
		});
	}
}