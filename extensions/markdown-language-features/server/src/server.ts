/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, InitializeParams, InitializeResult, NotebookDocuments, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import { LogFunctionLogger } from './logging';
import { parseRequestType } from './protocol';
import { VsCodeClientWorkspace } from './workspace';

export async function startServer(connection: Connection) {
	const documents = new TextDocuments(TextDocument);
	const notebooks = new NotebookDocuments(documents);

	connection.onInitialize((params: InitializeParams): InitializeResult => {
		workspace.workspaceFolders = (params.workspaceFolders ?? []).map(x => URI.parse(x.uri));
		return {
			capabilities: {
				documentLinkProvider: { resolveProvider: true },
				documentSymbolProvider: true,
				completionProvider: { triggerCharacters: ['.', '/', '#'] },
				foldingRangeProvider: true,
				selectionRangeProvider: true,
				workspaceSymbolProvider: true,
				workspace: {
					workspaceFolders: {
						supported: true,
						changeNotifications: true,
					},
				}
			}
		};
	});

	const parser = new class implements md.IMdParser {
		slugifier = md.githubSlugifier;

		async tokenize(document: md.ITextDocument): Promise<md.Token[]> {
			return await connection.sendRequest(parseRequestType, { uri: document.uri.toString() });
		}
	};

	const workspace = new VsCodeClientWorkspace(connection, documents, notebooks);
	const logger = new LogFunctionLogger(connection.console.log.bind(connection.console));
	const provider = md.createLanguageService({ workspace, parser, logger });

	connection.onDocumentLinks(async (params, token): Promise<lsp.DocumentLink[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.getDocumentLinks(document, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onDocumentLinkResolve(async (link, token): Promise<lsp.DocumentLink | undefined> => {
		try {
			return await provider.resolveDocumentLink(link, token);
		} catch (e) {
			console.error(e.stack);
		}
		return undefined;
	});

	connection.onDocumentSymbol(async (params, token): Promise<lsp.DocumentSymbol[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.getDocumentSymbols(document, token);
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
				return await provider.getFoldingRanges(document, token);
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
				return await provider.getSelectionRanges(document, params.positions, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onWorkspaceSymbol(async (params, token): Promise<lsp.WorkspaceSymbol[]> => {
		try {
			return await provider.getWorkspaceSymbols(params.query, token);
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onCompletion(async (params, token): Promise<lsp.CompletionItem[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.getCompletionItems(document, params.position, params.context!, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	documents.listen(connection);
	notebooks.listen(connection);
	connection.listen();
}
