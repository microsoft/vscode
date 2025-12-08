/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, CompletionItem, CompletionItemKind, ExtensionContext, languages, Position, Range, SnippetString, TextEdit, window, TextDocument, CompletionContext, CancellationToken, ProviderResult, CompletionList, FormattingOptions, workspace, l10n } from 'vscode';
import { Disposable, LanguageClientOptions, ProvideCompletionItemsSignature, NotificationType, BaseLanguageClient, DocumentRangeFormattingParams, DocumentRangeFormattingRequest } from 'vscode-languageclient';
import { getCustomDataSource } from './customData';
import { RequestService, serveFileSystemRequests } from './requests';

namespace CustomDataChangedNotification {
	export const type: NotificationType<string[]> = new NotificationType('css/customDataChanged');
}

export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;

export interface Runtime {
	TextDecoder: { new(encoding?: string): { decode(buffer: ArrayBuffer): string } };
	fs?: RequestService;
}

interface FormatterRegistration {
	readonly languageId: string;
	readonly settingId: string;
	provider: Disposable | undefined;
}

interface CSSFormatSettings {
	newlineBetweenSelectors?: boolean;
	newlineBetweenRules?: boolean;
	spaceAroundSelectorSeparator?: boolean;
	braceStyle?: 'collapse' | 'expand';
	preserveNewLines?: boolean;
	maxPreserveNewLines?: number | null;
}

const cssFormatSettingKeys: (keyof CSSFormatSettings)[] = ['newlineBetweenSelectors', 'newlineBetweenRules', 'spaceAroundSelectorSeparator', 'braceStyle', 'preserveNewLines', 'maxPreserveNewLines'];

export async function startClient(context: ExtensionContext, newLanguageClient: LanguageClientConstructor, runtime: Runtime): Promise<BaseLanguageClient> {

	const customDataSource = getCustomDataSource(context.subscriptions);

	const documentSelector = ['css', 'scss', 'less'];

	const formatterRegistrations: FormatterRegistration[] = documentSelector.map(languageId => ({
		languageId, settingId: `${languageId}.format.enable`, provider: undefined
	}));

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {
			configurationSection: ['css', 'scss', 'less']
		},
		initializationOptions: {
			handledSchemas: ['file'],
			provideFormatter: false, // tell the server to not provide formatting capability
			customCapabilities: { rangeFormatting: { editLimit: 10000 } }
		},
		middleware: {
			provideCompletionItem(document: TextDocument, position: Position, context: CompletionContext, token: CancellationToken, next: ProvideCompletionItemsSignature): ProviderResult<CompletionItem[] | CompletionList> {
				// testing the replace / insert mode
				function updateRanges(item: CompletionItem) {
					const range = item.range;
					if (range instanceof Range && range.end.isAfter(position) && range.start.isBeforeOrEqual(position)) {
						item.range = { inserting: new Range(range.start, position), replacing: range };

					}
				}
				function updateLabel(item: CompletionItem) {
					if (item.kind === CompletionItemKind.Color) {
						item.label = {
							label: item.label as string,
							description: (item.documentation as string)
						};
					}
				}
				// testing the new completion
				function updateProposals(r: CompletionItem[] | CompletionList | null | undefined): CompletionItem[] | CompletionList | null | undefined {
					if (r) {
						(Array.isArray(r) ? r : r.items).forEach(updateRanges);
						(Array.isArray(r) ? r : r.items).forEach(updateLabel);
					}
					return r;
				}
				const isThenable = <T>(obj: ProviderResult<T>): obj is Thenable<T> => obj && (<any>obj)['then'];

				const r = next(document, position, context, token);
				if (isThenable<CompletionItem[] | CompletionList | null | undefined>(r)) {
					return r.then(updateProposals);
				}
				return updateProposals(r);
			}
		}
	};

	// Create the language client and start the client.
	const client = newLanguageClient('css', l10n.t('CSS Language Server'), clientOptions);
	client.registerProposedFeatures();

	await client.start();

	client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
	customDataSource.onDidChange(() => {
		client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
	});

	// manually register / deregister format provider based on the `css/less/scss.format.enable` setting avoiding issues with late registration. See #71652.
	for (const registration of formatterRegistrations) {
		updateFormatterRegistration(registration);
		context.subscriptions.push({ dispose: () => registration.provider?.dispose() });
		context.subscriptions.push(workspace.onDidChangeConfiguration(e => e.affectsConfiguration(registration.settingId) && updateFormatterRegistration(registration)));
	}

	serveFileSystemRequests(client, runtime);


	context.subscriptions.push(initCompletionProvider());

	function initCompletionProvider(): Disposable {
		const regionCompletionRegExpr = /^(\s*)(\/(\*\s*(#\w*)?)?)?$/;

		return languages.registerCompletionItemProvider(documentSelector, {
			provideCompletionItems(doc: TextDocument, pos: Position) {
				const lineUntilPos = doc.getText(new Range(new Position(pos.line, 0), pos));
				const match = lineUntilPos.match(regionCompletionRegExpr);
				if (match) {
					const range = new Range(new Position(pos.line, match[1].length), pos);
					const beginProposal = new CompletionItem('#region', CompletionItemKind.Snippet);
					beginProposal.range = range; TextEdit.replace(range, '/* #region */');
					beginProposal.insertText = new SnippetString('/* #region $1*/');
					beginProposal.documentation = l10n.t('Folding Region Start');
					beginProposal.filterText = match[2];
					beginProposal.sortText = 'za';
					const endProposal = new CompletionItem('#endregion', CompletionItemKind.Snippet);
					endProposal.range = range;
					endProposal.insertText = '/* #endregion */';
					endProposal.documentation = l10n.t('Folding Region End');
					endProposal.sortText = 'zb';
					endProposal.filterText = match[2];
					return [beginProposal, endProposal];
				}
				return null;
			}
		});
	}

	commands.registerCommand('_css.applyCodeAction', applyCodeAction);

	function applyCodeAction(uri: string, documentVersion: number, edits: TextEdit[]) {
		const textEditor = window.activeTextEditor;
		if (textEditor && textEditor.document.uri.toString() === uri) {
			if (textEditor.document.version !== documentVersion) {
				window.showInformationMessage(l10n.t('CSS fix is outdated and can\'t be applied to the document.'));
			}
			textEditor.edit(mutator => {
				for (const edit of edits) {
					mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
				}
			}).then(success => {
				if (!success) {
					window.showErrorMessage(l10n.t('Failed to apply CSS fix to the document. Please consider opening an issue with steps to reproduce.'));
				}
			});
		}
	}

	function updateFormatterRegistration(registration: FormatterRegistration) {
		const formatEnabled = workspace.getConfiguration().get(registration.settingId);
		if (!formatEnabled && registration.provider) {
			registration.provider.dispose();
			registration.provider = undefined;
		} else if (formatEnabled && !registration.provider) {
			registration.provider = languages.registerDocumentRangeFormattingEditProvider(registration.languageId, {
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
					// add the css formatter options from the settings
					const formatterSettings = workspace.getConfiguration(registration.languageId, document).get<CSSFormatSettings>('format');
					if (formatterSettings) {
						for (const key of cssFormatSettingKeys) {
							const val = formatterSettings[key];
							if (val !== undefined && val !== null) {
								params.options[key] = val;
							}
						}
					}
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

	return client;
}
