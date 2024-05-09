/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { CancellationToken, CompletionRegistrationOptions, CompletionRequest, Connection, Disposable, DocumentHighlightRegistrationOptions, DocumentHighlightRequest, InitializeParams, InitializeResult, NotebookDocuments, ResponseError, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import { LsConfiguration, getLsConfiguration } from './config';
import { ConfigurationManager, Settings } from './configuration';
import { registerValidateSupport } from './languageFeatures/diagnostics';
import { LogFunctionLogger } from './logging';
import * as protocol from './protocol';
import { IDisposable } from './util/dispose';
import { VsCodeClientWorkspace } from './workspace';

interface MdServerInitializationOptions extends LsConfiguration { }

const organizeLinkDefKind = 'source.organizeLinkDefinitions';

export async function startVsCodeServer(connection: Connection) {
	const configurationManager = new ConfigurationManager(connection);
	const logger = new LogFunctionLogger(connection.console.log.bind(connection.console), configurationManager);

	const parser = new class implements md.IMdParser {
		slugifier = md.githubSlugifier;

		tokenize(document: md.ITextDocument): Promise<md.Token[]> {
			return connection.sendRequest(protocol.parse, {
				uri: document.uri,

				// Clients won't be able to read temp documents.
				// Send along the full text for parsing.
				text: document.version < 0 ? document.getText() : undefined
			});
		}
	};

	const documents = new TextDocuments(TextDocument);
	const notebooks = new NotebookDocuments(documents);

	const workspaceFactory: WorkspaceFactory = ({ connection, config, workspaceFolders }) => {
		const workspace = new VsCodeClientWorkspace(connection, config, documents, notebooks, logger);
		workspace.workspaceFolders = (workspaceFolders ?? []).map(x => URI.parse(x.uri));
		return workspace;
	};

	return startServer(connection, { documents, notebooks, configurationManager, logger, parser, workspaceFactory });
}

type WorkspaceFactory = (config: {
	connection: Connection;
	config: LsConfiguration;
	workspaceFolders?: lsp.WorkspaceFolder[] | null;
}) => md.IWorkspace;

export async function startServer(connection: Connection, serverConfig: {
	documents: TextDocuments<md.ITextDocument>;
	notebooks?: NotebookDocuments<md.ITextDocument>;
	configurationManager: ConfigurationManager;
	logger: md.ILogger;
	parser: md.IMdParser;
	workspaceFactory: WorkspaceFactory;
}) {
	const { documents, notebooks } = serverConfig;

	let mdLs: md.IMdLanguageService | undefined;

	connection.onInitialize((params: InitializeParams): InitializeResult => {
		const initOptions = params.initializationOptions as MdServerInitializationOptions | undefined;

		const mdConfig = getLsConfiguration(initOptions ?? {});

		const workspace = serverConfig.workspaceFactory({ connection, config: mdConfig, workspaceFolders: params.workspaceFolders });
		mdLs = md.createLanguageService({
			workspace,
			parser: serverConfig.parser,
			logger: serverConfig.logger,
			...mdConfig,
			get preferredMdPathExtensionStyle() {
				switch (serverConfig.configurationManager.getSettings()?.markdown.preferredMdPathExtensionStyle) {
					case 'includeExtension': return md.PreferredMdPathExtensionStyle.includeExtension;
					case 'removeExtension': return md.PreferredMdPathExtensionStyle.removeExtension;
					case 'auto':
					default:
						return md.PreferredMdPathExtensionStyle.auto;
				}
			}
		});

		registerCompletionsSupport(connection, documents, mdLs, serverConfig.configurationManager);
		registerDocumentHighlightSupport(connection, documents, mdLs, serverConfig.configurationManager);
		registerValidateSupport(connection, workspace, documents, mdLs, serverConfig.configurationManager, serverConfig.logger);

		return {
			capabilities: {
				diagnosticProvider: {
					documentSelector: null,
					identifier: 'markdown',
					interFileDependencies: true,
					workspaceDiagnostics: false,
				},
				codeActionProvider: {
					resolveProvider: true,
					codeActionKinds: [
						organizeLinkDefKind,
						'quickfix',
						'refactor',
					]
				},
				definitionProvider: true,
				documentLinkProvider: { resolveProvider: true },
				documentSymbolProvider: true,
				foldingRangeProvider: true,
				hoverProvider: true,
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

		try {
			return await mdLs!.prepareRename(document, params.position, token);
		} catch (e) {
			if (e instanceof md.RenameNotSupportedAtLocationError) {
				throw new ResponseError(0, e.message);
			} else {
				throw e;
			}
		}
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
				title: l10n.t("Organize link definitions"),
				kind: organizeLinkDefKind,
				data: { uri: document.uri } satisfies OrganizeLinkActionData,
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

	connection.onHover(async (params, token) => {
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return null;
		}

		return mdLs!.getHover(document, params.position, token);
	});

	connection.onRequest(protocol.getReferencesToFileInWorkspace, (async (params: { uri: string }, token: CancellationToken) => {
		return mdLs!.getFileReferences(URI.parse(params.uri), token);
	}));

	connection.onRequest(protocol.getEditForFileRenames, (async (params, token: CancellationToken) => {
		const result = await mdLs!.getRenameFilesInWorkspaceEdit(params.map(x => ({ oldUri: URI.parse(x.oldUri), newUri: URI.parse(x.newUri) })), token);
		if (!result) {
			return result;
		}

		return {
			edit: result.edit,
			participatingRenames: result.participatingRenames.map(rename => ({ oldUri: rename.oldUri.toString(), newUri: rename.newUri.toString() }))
		};
	}));

	connection.onRequest(protocol.prepareUpdatePastedLinks, (async (params, token: CancellationToken) => {
		const document = documents.get(params.uri);
		if (!document) {
			return undefined;
		}

		return mdLs!.prepareUpdatePastedLinks(document, params.ranges, token);
	}));

	connection.onRequest(protocol.getUpdatePastedLinksEdit, (async (params, token: CancellationToken) => {
		const document = documents.get(params.pasteIntoDoc);
		if (!document) {
			return undefined;
		}

		// TODO: Figure out why range types are lying
		const edits = params.edits.map((edit: any) => lsp.TextEdit.replace(lsp.Range.create(edit.range[0].line, edit.range[0].character, edit.range[1].line, edit.range[1].character), edit.newText));
		return mdLs!.getUpdatePastedLinksEdit(document, edits, params.metadata, token);
	}));

	connection.onRequest(protocol.resolveLinkTarget, (async (params, token: CancellationToken) => {
		return mdLs!.resolveLinkTarget(params.linkText, URI.parse(params.uri), token);
	}));

	documents.listen(connection);
	notebooks?.listen(connection);
	connection.listen();
}

function registerDynamicClientFeature(
	config: ConfigurationManager,
	isEnabled: (settings: Settings | undefined) => boolean,
	register: () => Promise<Disposable>,
) {
	let registration: Promise<IDisposable> | undefined;
	function update() {
		const settings = config.getSettings();
		if (isEnabled(settings)) {
			if (!registration) {
				registration = register();
			}
		} else {
			registration?.then(x => x.dispose());
			registration = undefined;
		}
	}

	update();
	return config.onDidChangeConfiguration(() => update());
}

function registerCompletionsSupport(
	connection: Connection,
	documents: TextDocuments<md.ITextDocument>,
	ls: md.IMdLanguageService,
	config: ConfigurationManager,
): IDisposable {
	function getIncludeWorkspaceHeaderCompletions(): md.IncludeWorkspaceHeaderCompletions {
		switch (config.getSettings()?.markdown.suggest.paths.includeWorkspaceHeaderCompletions) {
			case 'onSingleOrDoubleHash': return md.IncludeWorkspaceHeaderCompletions.onSingleOrDoubleHash;
			case 'onDoubleHash': return md.IncludeWorkspaceHeaderCompletions.onDoubleHash;
			case 'never':
			default: return md.IncludeWorkspaceHeaderCompletions.never;
		}
	}

	connection.onCompletion(async (params, token): Promise<lsp.CompletionItem[]> => {
		const settings = config.getSettings();
		if (!settings?.markdown.suggest.paths.enabled) {
			return [];
		}

		const document = documents.get(params.textDocument.uri);
		if (document) {
			// TODO: remove any type after picking up new release with correct types
			return ls.getCompletionItems(document, params.position, {
				...(params.context || {}),
				includeWorkspaceHeaderCompletions: getIncludeWorkspaceHeaderCompletions(),
			} as any, token);
		}
		return [];
	});

	return registerDynamicClientFeature(config, (settings) => !!settings?.markdown.suggest.paths.enabled, () => {
		const registrationOptions: CompletionRegistrationOptions = {
			documentSelector: null,
			triggerCharacters: ['.', '/', '#'],
		};
		return connection.client.register(CompletionRequest.type, registrationOptions);
	});
}

function registerDocumentHighlightSupport(
	connection: Connection,
	documents: TextDocuments<md.ITextDocument>,
	mdLs: md.IMdLanguageService,
	configurationManager: ConfigurationManager
) {
	connection.onDocumentHighlight(async (params, token) => {
		const settings = configurationManager.getSettings();
		if (!settings?.markdown.occurrencesHighlight.enabled) {
			return undefined;
		}

		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return undefined;
		}

		return mdLs!.getDocumentHighlights(document, params.position, token);
	});

	return registerDynamicClientFeature(configurationManager, (settings) => !!settings?.markdown.occurrencesHighlight.enabled, () => {
		const registrationOptions: DocumentHighlightRegistrationOptions = {
			documentSelector: null,
		};
		return connection.client.register(DocumentHighlightRequest.type, registrationOptions);
	});
}
