/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RenameProvider, WorkspaceEdit, TextDocument, Position, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

export default class TypeScriptRenameProvider implements RenameProvider {
	public constructor(
		private client: ITypeScriptServiceClient
	) { }

	public async provideRenameEdits(
		document: TextDocument,
		position: Position,
		newName: string,
		token: CancellationToken
	): Promise<WorkspaceEdit | null> {
		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return null;
		}

		const args: Proto.RenameRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			findInStrings: false,
			findInComments: false
		};

		try {
			const response = await this.client.execute('rename', args, token);
			if (!response.body) {
				return null;
			}

			const renameInfo = response.body.info;
			if (!renameInfo.canRename) {
				return Promise.reject<WorkspaceEdit>(renameInfo.localizedErrorMessage);
			}

			return this.toWorkspaceEdit(response.body.locs, newName);
		} catch {
			// noop
		}
		return null;
	}

	private toWorkspaceEdit(
		locations: ReadonlyArray<Proto.SpanGroup>,
		newName: string
	) {
		const result = new WorkspaceEdit();
		for (const spanGroup of locations) {
			const resource = this.client.asUrl(spanGroup.file);
			if (resource) {
				for (const textSpan of spanGroup.locs) {
					result.replace(resource, typeConverters.Range.fromTextSpan(textSpan), newName);
				}
			}
		}
		return result;
	}
}