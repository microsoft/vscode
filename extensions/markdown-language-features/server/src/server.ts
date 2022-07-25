/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Connection, InitializeParams, InitializeResult, NotebookDocuments, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import { IDisposable } from 'vscode-markdown-languageservice/out/util/dispose';
import { URI } from 'vscode-uri';
import { getLsConfiguration } from './config';
import { ConfigurationManager } from './configuration';
import { registerValidateSupport } from './languageFeatures/diagnostics';
import { LogFunctionLogger } from './logging';
import * as protocol from './protocol';
import { VsCodeClientWorkspace } from './workspace';

export async function startServer(connection: Connection) {
	const documents = new TextDocuments(TextDocument);
	const notebooks = new NotebookDocuments(documents);

	const configurationManager = new ConfigurationManager(connection);

	let provider: md.IMdLanguageService | undefined;
	let workspace: VsCodeClientWorkspace | undefined;

	connection.onInitialize((params: InitializeParams): InitializeResult => {
		const parser = new class implements md.IMdParser {
			slugifier = md.githubSlugifier;

			async tokenize(document: md.ITextDocument): Promise<md.Token[]> {
				return await connection.sendRequest(protocol.parse, { uri: document.uri.toString() });
			}
		};

		const config = getLsConfiguration({
			markdownFileExtensions: params.initializationOptions.markdownFileExtensions,
		});

		const logger = new LogFunctionLogger(connection.console.log.bind(connection.console));
		workspace = new VsCodeClientWorkspace(connection, config, documents, notebooks, logger);
		provider = md.createLanguageService({
			workspace,
			parser,
			logger,
			markdownFileExtensions: config.markdownFileExtensions,
		});

		registerCompletionsSupport(connection, documents, provider, configurationManager);
		registerValidateSupport(connection, workspace, provider, configurationManager);

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
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider!.getDocumentLinks(document, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onDocumentLinkResolve(async (link, token): Promise<lsp.DocumentLink | undefined> => {
		try {
			return await provider!.resolveDocumentLink(link, token);
		} catch (e) {
			console.error(e.stack);
		}
		return undefined;
	});

	connection.onDocumentSymbol(async (params, token): Promise<lsp.DocumentSymbol[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider!.getDocumentSymbols(document, token);
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
				return await provider!.getFoldingRanges(document, token);
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
				return await provider!.getSelectionRanges(document, params.positions, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onWorkspaceSymbol(async (params, token): Promise<lsp.WorkspaceSymbol[]> => {
		try {
			return await provider!.getWorkspaceSymbols(params.query, token);
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onReferences(async (params, token): Promise<lsp.Location[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider!.getReferences(document, params.position, params.context, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onDefinition(async (params, token): Promise<lsp.Definition | undefined> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider!.getDefinition(document, params.position, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return undefined;
	});

	connection.onPrepareRename(async (params, token) => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider!.prepareRename(document, params.position, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return undefined;
	});

	connection.onRenameRequest(async (params, token) => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				const edit = await provider!.getRenameEdit(document, params.position, params.newName, token);
				console.log(JSON.stringify(edit));
				return edit;
			}
		} catch (e) {
			console.error(e.stack);
		}
		return undefined;
	});

	connection.onRequest(protocol.getReferencesToFileInWorkspace, (async (params: { uri: string }, token: CancellationToken) => {
		try {
			return await provider!.getFileReferences(URI.parse(params.uri), token);
		} catch (e) {
			console.error(e.stack);
		}
		return undefined;
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
