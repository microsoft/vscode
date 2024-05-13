/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MdLanguageClient } from '../client/client';
import * as proto from '../client/protocol';

enum OpenMarkdownLinks {
	beside = 'beside',
	currentGroup = 'currentGroup',
}

export class MdLinkOpener {

	constructor(
		private readonly _client: MdLanguageClient,
	) { }

	public async resolveDocumentLink(linkText: string, fromResource: vscode.Uri): Promise<proto.ResolvedDocumentLinkTarget> {
		return this._client.resolveLinkTarget(linkText, fromResource);
	}

	public async openDocumentLink(linkText: string, fromResource: vscode.Uri, viewColumn?: vscode.ViewColumn): Promise<void> {
		const resolved = await this._client.resolveLinkTarget(linkText, fromResource);
		if (!resolved) {
			return;
		}

		const uri = vscode.Uri.from(resolved.uri);
		switch (resolved.kind) {
			case 'external':
				return vscode.commands.executeCommand('vscode.open', uri);

			case 'folder':
				return vscode.commands.executeCommand('revealInExplorer', uri);

			case 'file': {
				// If no explicit viewColumn is given, check if the editor is already open in a tab
				if (typeof viewColumn === 'undefined') {
					for (const tab of vscode.window.tabGroups.all.flatMap(x => x.tabs)) {
						if (tab.input instanceof vscode.TabInputText) {
							if (tab.input.uri.fsPath === uri.fsPath) {
								viewColumn = tab.group.viewColumn;
								break;
							}
						}
					}
				}

				return vscode.commands.executeCommand('vscode.open', uri, <vscode.TextDocumentShowOptions>{
					selection: resolved.position ? new vscode.Range(resolved.position.line, resolved.position.character, resolved.position.line, resolved.position.character) : undefined,
					viewColumn: viewColumn ?? getViewColumn(fromResource),
				});
			}
		}
	}
}

function getViewColumn(resource: vscode.Uri): vscode.ViewColumn {
	const config = vscode.workspace.getConfiguration('markdown', resource);
	const openLinks = config.get<OpenMarkdownLinks>('links.openLocation', OpenMarkdownLinks.currentGroup);
	switch (openLinks) {
		case OpenMarkdownLinks.beside:
			return vscode.ViewColumn.Beside;
		case OpenMarkdownLinks.currentGroup:
		default:
			return vscode.ViewColumn.Active;
	}
}

