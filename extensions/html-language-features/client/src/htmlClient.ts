/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import {
	languages, ExtensionContext, Position, TextDocument, Range, CompletionItem, CompletionItemKind, SnippetString, workspace, extensions,
	Disposable, FormattingOptions, CancellationToken, ProviderResult, TextEdit, CompletionContext, CompletionList, SemanticTokensLegend,
	DocumentSemanticTokensProvider, DocumentRangeSemanticTokensProvider, SemanticTokens, window, commands, l10n,
	LogOutputChannel
} from 'vscode';
import {
	LanguageClientOptions, RequestType, DocumentRangeFormattingParams,
	DocumentRangeFormattingRequest, ProvideCompletionItemsSignature, TextDocumentIdentifier, RequestType0, Range as LspRange, Position as LspPosition, NotificationType, BaseLanguageClient
} from 'vscode-languageclient';
import { FileSystemProvider, serveFileSystemRequests } from './requests';
import { getCustomDataSource } from './customData';
import { activateAutoInsertion } from './autoInsertion';
import { getLanguageParticipants, LanguageParticipants } from './languageParticipants';

namespace CustomDataChangedNotification {
	export const type: NotificationType<string[]> = new NotificationType('html/customDataChanged');
}

namespace CustomDataContent {
	export const type: RequestType<string, string, any> = new RequestType('html/customDataContent');
}

interface AutoInsertParams {
	/**
	 * The auto insert kind
	 */
	kind: 'autoQuote' | 'autoClose';
	/**
	 * The text document.
	 */
	textDocument: TextDocumentIdentifier;
	/**
	 * The position inside the text document.
	 */
	position: LspPosition;
}

namespace AutoInsertRequest {
	export const type: RequestType<AutoInsertParams, string, any> = new RequestType('html/autoInsert');
}

// experimental: semantic tokens
interface SemanticTokenParams {
	textDocument: TextDocumentIdentifier;
	ranges?: LspRange[];
}
namespace SemanticTokenRequest {
	export const type: RequestType<SemanticTokenParams, number[] | null, any> = new RequestType('html/semanticTokens');
}
namespace SemanticTokenLegendRequest {
	export const type: RequestType0<{ types: string[]; modifiers: string[] } | null, any> = new RequestType0('html/semanticTokenLegend');
}

namespace SettingIds {
	export const linkedEditing = 'editor.linkedEditing';
	export const formatEnable = 'html.format.enable';

}

export interface TelemetryReporter {
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}, measurements?: {
		[key: string]: number;
	}): void;
}

export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;

export const languageServerDescription = l10n.t('HTML Language Server');

export interface Runtime {
	TextDecoder: typeof TextDecoder;
	fileFs?: FileSystemProvider;
	telemetry?: TelemetryReporter;
	readonly timer: {
		setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): Disposable;
	};
}

export interface AsyncDisposable {
	dispose(): Promise<void>;
}

export async function startClient(context: ExtensionContext, newLanguageClient: LanguageClientConstructor, runtime: Runtime): Promise<AsyncDisposable> {

	const logOutputChannel = window.createOutputChannel(languageServerDescription, { log: true });

	const languageParticipants = getLanguageParticipants();
	context.subscriptions.push(languageParticipants);

	let client: Disposable | undefined = await startClientWithParticipants(languageParticipants, newLanguageClient, logOutputChannel, runtime);

	const promptForLinkedEditingKey = 'html.promptForLinkedEditing';
	if (extensions.getExtension('formulahendry.auto-rename-tag') !== undefined && (context.globalState.get(promptForLinkedEditingKey) !== false)) {
		const config = workspace.getConfiguration('editor', { languageId: 'html' });
		if (!config.get('linkedEditing') && !config.get('renameOnType')) {
			const activeEditorListener = window.onDidChangeActiveTextEditor(async e => {
				if (e && languageParticipants.hasLanguage(e.document.languageId)) {
					context.globalState.update(promptForLinkedEditingKey, false);
					activeEditorListener.dispose();
					const configure = l10n.t('Configure');
					const res = await window.showInformationMessage(l10n.t('VS Code now has built-in support for auto-renaming tags. Do you want to enable it?'), configure);
					if (res === configure) {
						commands.executeCommand('workbench.action.openSettings', SettingIds.linkedEditing);
					}
				}
			});
			context.subscriptions.push(activeEditorListener);
		}
	}

	let restartTrigger: Disposable | undefined;
	languageParticipants.onDidChange(() => {
		if (restartTrigger) {
			restartTrigger.dispose();
		}
		restartTrigger = runtime.timer.setTimeout(async () => {
			if (client) {
				logOutputChannel.info('Extensions have changed, restarting HTML server...');
				logOutputChannel.info('');
				const oldClient = client;
				client = undefined;
				await oldClient.dispose();
				client = await startClientWithParticipants(languageParticipants, newLanguageClient, logOutputChannel, runtime);
			}
		}, 2000);
	});

	return {
		dispose: async () => {
			restartTrigger?.dispose();
			await client?.dispose();
			logOutputChannel.dispose();
		}
	};
}

async function startClientWithParticipants(languageParticipants: LanguageParticipants, newLanguageClient: LanguageClientConstructor, logOutputChannel: LogOutputChannel, runtime: Runtime): Promise<AsyncDisposable> {

	const toDispose: Disposable[] = [];

	const documentSelector = languageParticipants.documentSelector;
	const embeddedLanguages = { css: true, javascript: true };

	let rangeFormatting: Disposable | undefined = undefined;

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {
			configurationSection: ['html', 'css', 'javascript', 'js/ts'], // the settings to synchronize
		},
		initializationOptions: {
			embeddedLanguages,
			handledSchemas: ['file'],
			provideFormatter: false, // tell the server to not provide formatting capability and ignore the `html.format.enable` setting.
			customCapabilities: { rangeFormatting: { editLimit: 10000 } }
		},
		middleware: {
			// testing the replace / insert mode
			provideCompletionItem(document: TextDocument, position: Position, context: CompletionContext, token: CancellationToken, next: ProvideCompletionItemsSignature): ProviderResult<CompletionItem[] | CompletionList> {
				function updateRanges(item: CompletionItem) {
					const range = item.range;
					if (range instanceof Range && range.end.isAfter(position) && range.start.isBeforeOrEqual(position)) {
						item.range = { inserting: new Range(range.start, position), replacing: range };
					}
				}
				function updateProposals(r: CompletionItem[] | CompletionList | null | undefined): CompletionItem[] | CompletionList | null | undefined {
					if (r) {
						(Array.isArray(r) ? r : r.items).forEach(updateRanges);
					}
					return r;
				}
				function isThenable<T>(obj: unknown): obj is Thenable<T> {
					return !!obj && typeof (obj as unknown as Thenable<T>).then === 'function';
				}
				const r = next(document, position, context, token);
				if (isThenable<CompletionItem[] | CompletionList | null | undefined>(r)) {
					return r.then(updateProposals);
				}
				return updateProposals(r);
			}
		}
	};
	clientOptions.outputChannel = logOutputChannel;

	// Create the language client and start the client.
	const client = newLanguageClient('html', languageServerDescription, clientOptions);
	client.registerProposedFeatures();

	await client.start();

	toDispose.push(serveFileSystemRequests(client, runtime));

	const customDataSource = getCustomDataSource(runtime, toDispose);

	client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
	customDataSource.onDidChange(() => {
		client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
	}, undefined, toDispose);
	toDispose.push(client.onRequest(CustomDataContent.type, customDataSource.getContent));


	const insertRequestor = (kind: 'autoQuote' | 'autoClose', document: TextDocument, position: Position): Promise<string> => {
		const param: AutoInsertParams = {
			kind,
			textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
			position: client.code2ProtocolConverter.asPosition(position)
		};
		return client.sendRequest(AutoInsertRequest.type, param);
	};

	const disposable = activateAutoInsertion(insertRequestor, languageParticipants, runtime);
	toDispose.push(disposable);

	const disposable2 = client.onTelemetry(e => {
		runtime.telemetry?.sendTelemetryEvent(e.key, e.data);
	});
	toDispose.push(disposable2);

	// manually register / deregister format provider based on the `html.format.enable` setting avoiding issues with late registration. See #71652.
	updateFormatterRegistration();
	toDispose.push({ dispose: () => rangeFormatting && rangeFormatting.dispose() });
	toDispose.push(workspace.onDidChangeConfiguration(e => e.affectsConfiguration(SettingIds.formatEnable) && updateFormatterRegistration()));

	client.sendRequest(SemanticTokenLegendRequest.type).then(legend => {
		if (legend) {
			const provider: DocumentSemanticTokensProvider & DocumentRangeSemanticTokensProvider = {
				provideDocumentSemanticTokens(doc) {
					const params: SemanticTokenParams = {
						textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(doc),
					};
					return client.sendRequest(SemanticTokenRequest.type, params).then(data => {
						return data && new SemanticTokens(new Uint32Array(data));
					});
				},
				provideDocumentRangeSemanticTokens(doc, range) {
					const params: SemanticTokenParams = {
						textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(doc),
						ranges: [client.code2ProtocolConverter.asRange(range)]
					};
					return client.sendRequest(SemanticTokenRequest.type, params).then(data => {
						return data && new SemanticTokens(new Uint32Array(data));
					});
				}
			};
			toDispose.push(languages.registerDocumentSemanticTokensProvider(documentSelector, provider, new SemanticTokensLegend(legend.types, legend.modifiers)));
		}
	});

	function updateFormatterRegistration() {
		const formatEnabled = workspace.getConfiguration().get(SettingIds.formatEnable);
		if (!formatEnabled && rangeFormatting) {
			rangeFormatting.dispose();
			rangeFormatting = undefined;
		} else if (formatEnabled && !rangeFormatting) {
			rangeFormatting = languages.registerDocumentRangeFormattingEditProvider(documentSelector, {
				provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]> {
					const filesConfig = workspace.getConfiguration('files', document);
					const fileFormattingOptions = {
						trimTrailingWhitespace: filesConfig.get<boolean>('trimTrailingWhitespace'),
						trimFinalNewlines: filesConfig.get<boolean>('trimFinalNewlines'),
						insertFinalNewline: filesConfig.get<boolean>('insertFinalNewline'),
					};
					const params: DocumentRangeFormattingParams = {
						textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
						range: client.code2ProtocolConverter.asRange(range),
						options: client.code2ProtocolConverter.asFormattingOptions(options, fileFormattingOptions)
					};
					return client.sendRequest(DocumentRangeFormattingRequest.type, params, token).then(
						client.protocol2CodeConverter.asTextEdits,
						(error) => {
							client.handleFailedRequest(DocumentRangeFormattingRequest.type, undefined, error, []);
							return Promise.resolve([]);
						}
					);
				}
			});
		}
	}

	const regionCompletionRegExpr = /^(\s*)(<(!(-(-\s*(#\w*)?)?)?)?)?$/;
	const htmlSnippetCompletionRegExpr = /^(\s*)(<(h(t(m(l)?)?)?)?)?$/;
	toDispose.push(languages.registerCompletionItemProvider(documentSelector, {
		provideCompletionItems(doc, pos) {
			const results: CompletionItem[] = [];
			const lineUntilPos = doc.getText(new Range(new Position(pos.line, 0), pos));
			const match = lineUntilPos.match(regionCompletionRegExpr);
			if (match) {
				const range = new Range(new Position(pos.line, match[1].length), pos);
				const beginProposal = new CompletionItem('#region', CompletionItemKind.Snippet);
				beginProposal.range = range;
				beginProposal.insertText = new SnippetString('<!-- #region $1-->');
				beginProposal.documentation = l10n.t('Folding Region Start');
				beginProposal.filterText = match[2];
				beginProposal.sortText = 'za';
				results.push(beginProposal);
				const endProposal = new CompletionItem('#endregion', CompletionItemKind.Snippet);
				endProposal.range = range;
				endProposal.insertText = new SnippetString('<!-- #endregion -->');
				endProposal.documentation = l10n.t('Folding Region End');
				endProposal.filterText = match[2];
				endProposal.sortText = 'zb';
				results.push(endProposal);
			}
			const match2 = lineUntilPos.match(htmlSnippetCompletionRegExpr);
			if (match2 && doc.getText(new Range(new Position(0, 0), pos)).match(htmlSnippetCompletionRegExpr)) {
				const range = new Range(new Position(pos.line, match2[1].length), pos);
				const snippetProposal = new CompletionItem('HTML sample', CompletionItemKind.Snippet);
				snippetProposal.range = range;
				const content = ['<!DOCTYPE html>',
					'<html>',
					'<head>',
					'\t<meta charset=\'utf-8\'>',
					'\t<meta http-equiv=\'X-UA-Compatible\' content=\'IE=edge\'>',
					'\t<title>${1:Page Title}</title>',
					'\t<meta name=\'viewport\' content=\'width=device-width, initial-scale=1\'>',
					'\t<link rel=\'stylesheet\' type=\'text/css\' media=\'screen\' href=\'${2:main.css}\'>',
					'\t<script src=\'${3:main.js}\'></script>',
					'</head>',
					'<body>',
					'\t$0',
					'</body>',
					'</html>'].join('\n');
				snippetProposal.insertText = new SnippetString(content);
				snippetProposal.documentation = l10n.t('Simple HTML5 starting point');
				snippetProposal.filterText = match2[2];
				snippetProposal.sortText = 'za';
				results.push(snippetProposal);
			}
			return results;
		}
	}));

	return {
		dispose: async () => {
			await client.stop();
			toDispose.forEach(d => d.dispose());
			rangeFormatting?.dispose();
		}
	};

}
