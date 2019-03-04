/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

function getSymbolKind(item: Proto.NavtoItem): vscode.SymbolKind {
	switch (item.kind) {
		case 'method': return vscode.SymbolKind.Method;
		case 'enum': return vscode.SymbolKind.Enum;
		case 'function': return vscode.SymbolKind.Function;
		case 'class': return vscode.SymbolKind.Class;
		case 'interface': return vscode.SymbolKind.Interface;
		case 'var': return vscode.SymbolKind.Variable;
		default: return vscode.SymbolKind.Variable;
	}
}

class TypeScriptWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly modeIds: string[]
	) { }

	public async provideWorkspaceSymbols(
		search: string,
		token: vscode.CancellationToken
	): Promise<vscode.SymbolInformation[]> {
		const document = this.getDocument();
		if (!document) {
			return [];
		}

		const filepath = this.client.toOpenedFilePath(document);
		if (!filepath) {
			return [];
		}

		const args: Proto.NavtoRequestArgs = {
			file: filepath,
			searchValue: search
		};

		const response = await this.client.execute('navto', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		const result: vscode.SymbolInformation[] = [];
		for (const item of response.body) {
			if (!item.containerName && item.kind === 'alias') {
				continue;
			}
			const label = TypeScriptWorkspaceSymbolProvider.getLabel(item);
			result.push(new vscode.SymbolInformation(label, getSymbolKind(item), item.containerName || '',
				typeConverters.Location.fromTextSpan(this.client.toResource(item.file), item)));
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

	private getDocument(): vscode.TextDocument | undefined {
		// typescript wants to have a resource even when asking
		// general questions so we check the active editor. If this
		// doesn't match we take the first TS document.

		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			if (document && this.modeIds.indexOf(document.languageId) >= 0) {
				return document;
			}
		}

		const documents = vscode.workspace.textDocuments;
		for (const document of documents) {
			if (this.modeIds.indexOf(document.languageId) >= 0) {
				return document;
			}
		}
		return undefined;
	}
}

export function register(
	client: ITypeScriptServiceClient,
	modeIds: string[],
) {
	return vscode.languages.registerWorkspaceSymbolProvider(new TypeScriptWorkspaceSymbolProvider(client, modeIds));
}