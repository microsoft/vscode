/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Connection, InitializeParams, InitializeResult, NotebookDocuments, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import * as nls from 'vscode-nls';
import { URI } from 'vscode-uri';
import { getLsConfiguration, LsConfiguration } from './config';
import { ConfigurationManager } from './configuration';
import { registerValidateSupport } from './languageFeatures/diagnostics';
import { LogFunctionLogger } from './logging';
import * as protocol from './protocol';
import { IDisposable } from './util/dispose';
import { VsCodeClientWorkspace } from './workspace';

const localize = nls.loadMessageBundle();

interface MdServerInitializationOptions extends LsConfiguration { }

const organizeLinkDefKind = 'source.organizeLinkDefinitions';

export async function startVsCodeServer(connection: Connection) {
	const logger = new LogFunctionLogger(connection.console.log.bind(connection.console));

	const parser = new class implements md.IMdParser {
		slugifier = md.githubSlugifier;

		tokenize(document: md.ITextDocument): Promise<md.Token[]> {
			return connection.sendRequest(protocol.parse, { uri: document.uri.toString() });
		}
	};

	const documents = new TextDocuments(TextDocument);
	const notebooks = new NotebookDocuments(documents);

	const workspaceFactory: WorkspaceFactory = ({ connection, config, workspaceFolders }) => {
		const workspace = new VsCodeClientWorkspace(connection, config, documents, notebooks, logger);
		workspace.workspaceFolders = (workspaceFolders ?? []).map(x => URI.parse(x.uri));
		return workspace;
	};

	return startServer(connection, { documents, notebooks, logger, parser, workspaceFactory });
}

type WorkspaceFactory = (config: {
	connection: Connection;
	config: LsConfiguration;
	workspaceFolders?: lsp.WorkspaceFolder[] | null;
}) => md.IWorkspace;

export async function startServer(connection: Connection, serverConfig: {
	documents: TextDocuments<md.ITextDocument>;
	notebooks?: NotebookDocuments<md.ITextDocument>;
	logger: md.ILogger;
	parser: md.IMdParser;
	workspaceFactory: WorkspaceFactory;
}) {
	const { documents, notebooks } = serverConfig;

	let mdLs: md.IMdLanguageService | undefined;

	connection.onInitialize((params: InitializeParams): InitializeResult => {
		const initOptions = params.initializationOptions as MdServerInitializationOptions | undefined;
		const config = getLsConfiguration(initOptions ?? {});

		const configurationManager = new ConfigurationManager(connection);

		const workspace = serverConfig.workspaceFactory({ connection, config, workspaceFolders: params.workspaceFolders });
		mdLs = md.createLanguageService({
			workspace,
			parser: serverConfig.parser,
			logger: serverConfig.logger,
			markdownFileExtensions: config.markdownFileExtensions,
			excludePaths: config.excludePaths,
		});

		registerCompletionsSupport(connection, documents, mdLs, configurationManager);
		registerValidateSupport(connection, workspace, mdLs, configurationManager, serverConfig.logger);

		return {
			capabilities: {
				diagnosticProvider: {
					documentSelector: null,
					identifier: 'markdown',
					interFileDependencies: true,
					workspaceDiagnostics: false,
				},
				codeActionProvider: { resolveProvider: true },
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
		return mdLs!.getDocumentSymbols(document, { includeLinkDefinitions: true }, token);
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

	interface OrganizeLinkActionData {
		readonly uri: string;
	}

	connection.onCodeAction(async (params, token) => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return undefined;
		}

		if (params.context.only?.some(kind => kind === 'source' || kind.startsWith('source.'))) {
			const action: lsp.CodeAction = {
				title: localize('organizeLinkDefAction.title', "Organize link definitions"),
				kind: organizeLinkDefKind,
				data: <OrganizeLinkActionData>{ uri: document.uri }
			};
			return [action];
		}

		return mdLs!.getCodeActions(document, params.range, params.context, token);
	});

	connection.onCodeActionResolve(async (codeAction, token) => {
		if (codeAction.kind === organizeLinkDefKind) {
			const data = codeAction.data as OrganizeLinkActionData;
			const document = documents.get(data.uri);
			if (!document) {
				return codeAction;
			}

			const edits = (await mdLs?.organizeLinkDefinitions(document, { removeUnused: true }, token)) || [];
			codeAction.edit = {
				changes: {
					[data.uri]: edits
				}
			};
			return codeAction;
		}

		return codeAction;
	});

	connection.onRequest(protocol.getReferencesToFileInWorkspace, (async (params: { uri: string }, token: CancellationToken) => {
		return mdLs!.getFileReferences(URI.parse(params.uri), token);
	}));

	connection.onRequest(protocol.getEditForFileRenames, (async (params, token: CancellationToken) => {
		return mdLs!.getRenameFilesInWorkspaceEdit(params.map(x => ({ oldUri: URI.parse(x.oldUri), newUri: URI.parse(x.newUri) })), token);
	}));

	connection.onRequest(protocol.resolveLinkTarget, (async (params, token: CancellationToken) => {
		return mdLs!.resolveLinkTarget(params.linkText, URI.parse(params.uri), token);
	}));

	documents.listen(connection);
	notebooks?.listen(connection);
	connection.listen();
}


function registerCompletionsSupport(
	connection: Connection,
	documents: TextDocuments<md.ITextDocument>,
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
