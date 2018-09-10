/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';


class TypeScriptRenameProvider implements vscode.RenameProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideRenameEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: string,
		token: vscode.CancellationToken
	): Promise<vscode.WorkspaceEdit | null> {
		const file = this.client.toPath(document.uri);
		if (!file) {
			return null;
		}

		const args: Proto.RenameRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			findInStrings: false,
			findInComments: false
		};

		let body: Proto.RenameResponseBody | undefined;
		try {
			body = (await this.client.execute('rename', args, token)).body;
			if (!body) {
				return null;
			}
		} catch {
			// noop
			return null;
		}

		const renameInfo = body.info;
		if (!renameInfo.canRename) {
			return Promise.reject<vscode.WorkspaceEdit>(renameInfo.localizedErrorMessage);
		}
		return this.toWorkspaceEdit(body.locs, newName);
	}

	private toWorkspaceEdit(
		locations: ReadonlyArray<Proto.SpanGroup>,
		newName: string
	) {
		const result = new vscode.WorkspaceEdit();
		for (const spanGroup of locations) {
			const resource = this.client.toResource(spanGroup.file);
			if (resource) {
				for (const textSpan of spanGroup.locs) {
					result.replace(resource, typeConverters.Range.fromTextSpan(textSpan), newName);
				}
			}
		}
		return result;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return vscode.languages.registerRenameProvider(selector, new TypeScriptRenameProvider(client));
}
