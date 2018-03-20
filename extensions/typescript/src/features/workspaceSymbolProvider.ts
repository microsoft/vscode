/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, window, Uri, WorkspaceSymbolProvider, SymbolInformation, SymbolKind, Location, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { tsTextSpanToVsRange } from '../utils/typeConverters';

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
		private client: ITypeScriptServiceClient,
		private modeIds: string[]
	) { }

	public async provideWorkspaceSymbols(search: string, token: CancellationToken): Promise<SymbolInformation[]> {
		// typescript wants to have a resource even when asking
		// general questions so we check the active editor. If this
		// doesn't match we take the first TS document.
		let uri: Uri | undefined = undefined;
		const editor = window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			if (document && this.modeIds.indexOf(document.languageId) >= 0) {
				uri = document.uri;
			}
		}
		if (!uri) {
			const documents = workspace.textDocuments;
			for (const document of documents) {
				if (this.modeIds.indexOf(document.languageId) >= 0) {
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
		if (!response.body) {
			return [];
		}

		const result: SymbolInformation[] = [];
		for (const item of response.body) {
			if (!item.containerName && item.kind === 'alias') {
				continue;
			}
			const range = tsTextSpanToVsRange(item);
			const label = TypeScriptWorkspaceSymbolProvider.getLabel(item);
			result.push(new SymbolInformation(label, getSymbolKind(item), item.containerName || '',
				new Location(this.client.asUrl(item.file), range)));
		}
		return result;
	}

	private static getLabel(item: Proto.NavtoItem) {
		let label = item.name;
		if (item.kind === 'method' || item.kind === 'function') {
			label += '()';
		}
		return label;
	}
}