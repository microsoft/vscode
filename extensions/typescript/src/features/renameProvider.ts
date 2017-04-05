/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RenameProvider, WorkspaceEdit, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptRenameProvider implements RenameProvider {
	public constructor(
		private client: ITypescriptServiceClient) { }

	public provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): Promise<WorkspaceEdit | undefined | null> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return Promise.resolve(null);
		}
		const args: Proto.RenameRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1,
			findInStrings: false,
			findInComments: false
		};

		return this.client.execute('rename', args, token).then((response) => {
			const renameResponse = response.body;
			if (!renameResponse) {
				return Promise.resolve(null);
			}
			const renameInfo = renameResponse.info;
			const result = new WorkspaceEdit();

			if (!renameInfo.canRename) {
				return Promise.reject<WorkspaceEdit>(renameInfo.localizedErrorMessage);
			}

			renameResponse.locs.forEach((spanGroup) => {
				const resource = this.client.asUrl(spanGroup.file);
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
			this.client.error(`'rename' request failed with error.`, err);
			return null;
		});
	}
}