/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient, ServerResponse } from '../typescriptService';
import API from '../utils/api';
import * as typeConverters from '../utils/typeConverters';

const localize = nls.loadMessageBundle();

class TypeScriptRenameProvider implements vscode.RenameProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async prepareRename(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Range | null> {
		const response = await this.execRename(document, position, token);
		if (!response || response.type !== 'response' || !response.body) {
			return null;
		}

		const renameInfo = response.body.info;
		if (!renameInfo.canRename) {
			return Promise.reject<vscode.Range>(renameInfo.localizedErrorMessage);
		}

		if (this.client.apiVersion.gte(API.v310)) {
			const triggerSpan = renameInfo.triggerSpan;
			if (triggerSpan) {
				const range = typeConverters.Range.fromTextSpan(triggerSpan);
				return range;
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
		const response = await this.execRename(document, position, token);
		if (!response || response.type !== 'response' || !response.body) {
			return null;
		}

		const renameInfo = response.body.info;
		if (!renameInfo.canRename) {
			return Promise.reject<vscode.WorkspaceEdit>(renameInfo.localizedErrorMessage);
		}


		if (this.client.apiVersion.gte(API.v310)) {
			if (renameInfo.fileToRename) {
				const edits = await this.renameFile(renameInfo.fileToRename, newName, token);
				if (edits) {
					return edits;
				} else {
					return Promise.reject<vscode.WorkspaceEdit>(localize('fileRenameFail', "An error occurred while renaming file"));
				}
			}
		}
		return this.updateLocs(response.body.locs, newName);
	}

	public async execRename(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<ServerResponse<Proto.RenameResponse> | undefined> {
		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return undefined;
		}

		const args: Proto.RenameRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			findInStrings: false,
			findInComments: false
		};

		return this.client.execute('rename', args, token);
	}

	private updateLocs(
		locations: ReadonlyArray<Proto.SpanGroup>,
		newName: string
	) {
		const edit = new vscode.WorkspaceEdit();
		for (const spanGroup of locations) {
			const resource = this.client.toResource(spanGroup.file);
			if (resource) {
				for (const textSpan of spanGroup.locs as Proto.RenameTextSpan[]) {
					edit.replace(resource, typeConverters.Range.fromTextSpan(textSpan),
						(textSpan.prefixText || '') + newName + (textSpan.suffixText || ''));
				}
			}
		}
		return edit;
	}

	private async renameFile(
		fileToRename: string,
		newName: string,
		token: vscode.CancellationToken,
	): Promise<vscode.WorkspaceEdit | undefined> {
		// Make sure we preserve file extension if none provided
		if (!path.extname(newName)) {
			newName += path.extname(fileToRename);
		}

		const dirname = path.dirname(fileToRename);
		const newFilePath = path.join(dirname, newName);

		const args: Proto.GetEditsForFileRenameRequestArgs & { file: string } = {
			file: fileToRename,
			oldFilePath: fileToRename,
			newFilePath: newFilePath,
		};
		const response = await this.client.execute('getEditsForFileRename', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const edits = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
		edits.renameFile(vscode.Uri.file(fileToRename), vscode.Uri.file(newFilePath));
		return edits;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return vscode.languages.registerRenameProvider(selector, new TypeScriptRenameProvider(client));
}
