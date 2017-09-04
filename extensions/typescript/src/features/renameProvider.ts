/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RenameProvider, WorkspaceEdit, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptRenameProvider implements RenameProvider {
	public constructor(
		private client: ITypescriptServiceClient) { }

	public async provideRenameEdits(
		document: TextDocument,
		position: Position,
		newName: string,
		token: CancellationToken
	): Promise<WorkspaceEdit | null> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return null;
		}

		const args: Proto.RenameRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1,
			findInStrings: false,
			findInComments: false
		};

		try {
			const response = await this.client.execute('rename', args, token);
			const renameResponse = response.body;
			if (!renameResponse) {
				return null;
			}
			const renameInfo = renameResponse.info;

			if (!renameInfo.canRename) {
				return Promise.reject<WorkspaceEdit>(renameInfo.localizedErrorMessage);
			}
			const result = new WorkspaceEdit();
			for (const spanGroup of renameResponse.locs) {
				const resource = this.client.asUrl(spanGroup.file);
				if (!resource) {
					continue;
				}
				for (const textSpan of spanGroup.locs) {
					result.replace(resource,
						new Range(textSpan.start.line - 1, textSpan.start.offset - 1, textSpan.end.line - 1, textSpan.end.offset - 1),
						newName);
				}
			}
			return result;
		} catch (e) {
			// noop
		}
		return null;
	}
}