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

	public async prepareRename(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Range | null> {
		const body = await this.execRename(document, position, token);
		if (!body) {
			return null;
		}

		const renameInfo = body.info;
		if (!renameInfo.canRename) {
			return Promise.reject<vscode.Range>(new Error(renameInfo.localizedErrorMessage));
		}
		return null;
	}

	public async provideRenameEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: string,
		token: vscode.CancellationToken
	): Promise<vscode.WorkspaceEdit | null> {
		const body = await this.execRename(document, position, token);
		if (!body) {
			return null;
		}

		const renameInfo = body.info;
		if (!renameInfo.canRename) {
			return Promise.reject<vscode.WorkspaceEdit>(renameInfo.localizedErrorMessage);
		}
		return this.toWorkspaceEdit(body.locs, newName);
	}

	public async execRename(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<Proto.RenameResponseBody | undefined> {
		const file = this.client.toPath(document.uri);
		if (!file) {
			return undefined;
		}

		const args: Proto.RenameRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			findInStrings: false,
			findInComments: false
		};

		try {
			return (await this.client.execute('rename', args, token)).body;
		} catch {
			// noop
			return undefined;
		}
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
