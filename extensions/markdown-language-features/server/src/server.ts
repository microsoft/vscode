/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, InitializeParams, InitializeResult, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import { LogFunctionLogger } from './logging';
import { parseRequestType } from './protocol';
import { VsCodeClientWorkspace } from './workspace';

declare const TextDecoder: any;

export function startServer(connection: Connection) {
	const documents = new TextDocuments(TextDocument);
	documents.listen(connection);

	connection.onInitialize((_params: InitializeParams): InitializeResult => {
		return {
			capabilities: {
				documentSymbolProvider: true,
				foldingRangeProvider: true,
				selectionRangeProvider: true,
				workspaceSymbolProvider: true,
			}
		};
	});

	const parser = new class implements md.IMdParser {
		slugifier = md.githubSlugifier;

		async tokenize(document: md.ITextDocument): Promise<md.Token[]> {
			return await connection.sendRequest(parseRequestType, { uri: document.uri.toString() });
		}
	};

	const workspace = new VsCodeClientWorkspace(connection, documents);
	const logger = new LogFunctionLogger(connection.console.log.bind(connection.console));
	const provider = md.createLanguageService({ workspace, parser, logger });

	connection.onDocumentSymbol(async (params, token): Promise<lsp.DocumentSymbol[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.provideDocumentSymbols(document, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onFoldingRanges(async (params, token): Promise<lsp.FoldingRange[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.provideFoldingRanges(document, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onSelectionRanges(async (params, token): Promise<lsp.SelectionRange[] | undefined> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.provideSelectionRanges(document, params.positions, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onWorkspaceSymbol(async (params, token): Promise<lsp.WorkspaceSymbol[]> => {
		try {
			return await provider.provideWorkspaceSymbols(params.query, token);
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.listen();
}

