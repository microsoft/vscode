/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, window, Uri, WorkspaceSymbolProvider, SymbolInformation, SymbolKind, Range, Location, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

function getSymbolKind(item: Proto.NavtoItem): SymbolKind {
	switch (item.kind) {
		case 'method': return SymbolKind.Method;
		case 'enum': return SymbolKind.Enum;
		case 'function': return SymbolKind.Function;
		case 'class': return SymbolKind.Class;
		case 'interface': return SymbolKind.Interface;
		case 'var': return SymbolKind.Variable;
		default: return SymbolKind.Variable;
	}
}

export default class TypeScriptWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
	public constructor(
		private client: ITypescriptServiceClient,
		private modeId: string) { }

	public async provideWorkspaceSymbols(search: string, token: CancellationToken): Promise<SymbolInformation[]> {
		// typescript wants to have a resource even when asking
		// general questions so we check the active editor. If this
		// doesn't match we take the first TS document.
		let uri: Uri | undefined = undefined;
		const editor = window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			if (document && document.languageId === this.modeId) {
				uri = document.uri;
			}
		}
		if (!uri) {
			const documents = workspace.textDocuments;
			for (const document of documents) {
				if (document.languageId === this.modeId) {
					uri = document.uri;
					break;
				}
			}
		}

		if (!uri) {
			return [];
		}

		const filepath = this.client.normalizePath(uri);
		if (!filepath) {
			return [];
		}
		const args: Proto.NavtoRequestArgs = {
			file: filepath,
			searchValue: search
		};
		const response = await this.client.execute('navto', args, token);
		const result: SymbolInformation[] = [];
		const data = response.body;
		if (data) {
			for (const item of data) {
				if (!item.containerName && item.kind === 'alias') {
					continue;
				}
				const range = new Range(item.start.line - 1, item.start.offset - 1, item.end.line - 1, item.end.offset - 1);
				let label = item.name;
				if (item.kind === 'method' || item.kind === 'function') {
					label += '()';
				}
				result.push(new SymbolInformation(label, getSymbolKind(item), item.containerName || '',
					new Location(this.client.asUrl(item.file), range)));
			}
		}
		return result;
	}
}