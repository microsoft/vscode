/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Connection, InitializeParams, InitializeResult, NotebookDocuments, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import { getLsConfiguration, LsConfiguration } from './config';
import { ConfigurationManager } from './configuration';
import { registerValidateSupport } from './languageFeatures/diagnostics';
import { LogFunctionLogger } from './logging';
import * as protocol from './protocol';
import { IDisposable } from './util/dispose';
import { VsCodeClientWorkspace } from './workspace';

interface MdServerInitializationOptions extends LsConfiguration { }

export async function startServer(connection: Connection) {
	const documents = new TextDocuments(TextDocument);
	const notebooks = new NotebookDocuments(documents);

	const configurationManager = new ConfigurationManager(connection);

	let mdLs: md.IMdLanguageService | undefined;
	let workspace: VsCodeClientWorkspace | undefined;

	connection.onInitialize((params: InitializeParams): InitializeResult => {
		const parser = new class implements md.IMdParser {
			slugifier = md.githubSlugifier;

			async tokenize(document: md.ITextDocument): Promise<md.Token[]> {
				return await connection.sendRequest(protocol.parse, { uri: document.uri.toString() });
			}
		};

		const initOptions = params.initializationOptions as MdServerInitializationOptions | undefined;
		const config = getLsConfiguration(initOptions ?? {});

		const logger = new LogFunctionLogger(connection.console.log.bind(connection.console));
		workspace = new VsCodeClientWorkspace(connection, config, documents, notebooks, logger);
		mdLs = md.createLanguageService({
			workspace,
			parser,
			logger,
			markdownFileExtensions: config.markdownFileExtensions,
			excludePaths: config.excludePaths,
		});

		registerCompletionsSupport(connection, documents, mdLs, configurationManager);
		registerValidateSupport(connection, workspace, mdLs, configurationManager, logger);

		workspace.workspaceFolders = (params.workspaceFolders ?? []).map(x => URI.parse(x.uri));
		return {
			capabilities: {
				diagnosticProvider: {
					documentSelector: null,
					identifier: 'markdown',
					interFileDependencies: true,
					workspaceDiagnostics: false,
				},
				completionProvider: { triggerCharacters: ['.', '/', '#'] },
				definitionProvider: true,
				documentLinkProvider: { resolveProvider: true },
				documentSymbolProvider: true,
				foldingRangeProvider: true,
				referencesProvider: true,
				renameProvider: { prepareProvider: true, },
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

	connection.onDocumentLinks(async (params, token): Promise<lsp.DocumentLink[]> => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return mdLs!.getDocumentLinks(document, token);
	});

	connection.onDocumentLinkResolve(async (link, token): Promise<lsp.DocumentLink | undefined> => {
		return mdLs!.resolveDocumentLink(link, token);
	});

	connection.onDocumentSymbol(async (params, token): Promise<lsp.DocumentSymbol[]> => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return mdLs!.getDocumentSymbols(document, token);
	});

	connection.onFoldingRanges(async (params, token): Promise<lsp.FoldingRange[]> => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return mdLs!.getFoldingRanges(document, token);
	});

	connection.onSelectionRanges(async (params, token): Promise<lsp.SelectionRange[] | undefined> => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return mdLs!.getSelectionRanges(document, params.positions, token);
	});

	connection.onWorkspaceSymbol(async (params, token): Promise<lsp.WorkspaceSymbol[]> => {
		return mdLs!.getWorkspaceSymbols(params.query, token);
	});

	connection.onReferences(async (params, token): Promise<lsp.Location[]> => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return mdLs!.getReferences(document, params.position, params.context, token);
	});

	connection.onDefinition(async (params, token): Promise<lsp.Definition | undefined> => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return undefined;
		}
		return mdLs!.getDefinition(document, params.position, token);
	});

	connection.onPrepareRename(async (params, token) => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return undefined;
		}
		return mdLs!.prepareRename(document, params.position, token);
	});

	connection.onRenameRequest(async (params, token) => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return undefined;
		}
		return mdLs!.getRenameEdit(document, params.position, params.newName, token);
	});

	connection.onRequest(protocol.getReferencesToFileInWorkspace, (async (params: { uri: string }, token: CancellationToken) => {
		return mdLs!.getFileReferences(URI.parse(params.uri), token);
	}));

	connection.onRequest(protocol.getEditForFileRenames, (async (params, token: CancellationToken) => {
		return mdLs!.getRenameFilesInWorkspaceEdit(params.map(x => ({ oldUri: URI.parse(x.oldUri), newUri: URI.parse(x.newUri) })), token);
	}));

	documents.listen(connection);
	notebooks.listen(connection);
	connection.listen();
}


function registerCompletionsSupport(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	ls: md.IMdLanguageService,
	config: ConfigurationManager,
): IDisposable {
	// let registration: Promise<IDisposable> | undefined;
	function update() {
		// TODO: client still makes the request in this case. Figure our how to properly unregister.
		return;
		// const settings = config.getSettings();
		// if (settings?.markdown.suggest.paths.enabled) {
		// 	if (!registration) {
		// 		registration = connection.client.register(CompletionRequest.type);
		// 	}
		// } else {
		// 	registration?.then(x => x.dispose());
		// 	registration = undefined;
		// }
	}

	connection.onCompletion(async (params, token): Promise<lsp.CompletionItem[]> => {
		try {
			const settings = config.getSettings();
			if (!settings?.markdown.suggest.paths.enabled) {
				return [];
			}

			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await ls.getCompletionItems(document, params.position, params.context!, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	update();
	return config.onDidChangeConfiguration(() => update());
}
