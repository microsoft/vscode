/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
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
			return Promise.reject<vscode.Range>(renameInfo.localizedErrorMessage);
		}

		if (this.client.apiVersion.gte(API.v310)) {
			const triggerSpan = (renameInfo as any).triggerSpan;
			if (triggerSpan) {
				return typeConverters.Range.fromTextSpan(triggerSpan);
			}
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

		const edit = new vscode.WorkspaceEdit();
		if (this.client.apiVersion.gte(API.v310)) {
			if (renameInfo.fileToRename) {
				this.renameFile(edit, renameInfo.fileToRename, newName);
			}
		}
		this.updateLocs(edit, body.locs, newName);
		return edit;
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

	private updateLocs(
		edit: vscode.WorkspaceEdit,
		locations: ReadonlyArray<Proto.SpanGroup>,
		newName: string
	) {
		for (const spanGroup of locations) {
			const resource = this.client.toResource(spanGroup.file);
			if (resource) {
				for (const textSpan of spanGroup.locs) {
					edit.replace(resource, typeConverters.Range.fromTextSpan(textSpan), newName);
				}
			}
		}
		return edit;
	}

	private renameFile(
		edit: vscode.WorkspaceEdit,
		fileToRename: string,
		newName: string,
	): vscode.WorkspaceEdit {
		// Make sure we preserve file exension if none provided
		if (path.extname(newName)) {
			newName += path.extname(fileToRename);
		}

		const dirname = path.dirname(fileToRename);
		const newFilePath = path.join(dirname, newName);
		edit.renameFile(vscode.Uri.file(fileToRename), vscode.Uri.file(newFilePath));

		return edit;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return vscode.languages.registerRenameProvider(selector, new TypeScriptRenameProvider(client));
}
