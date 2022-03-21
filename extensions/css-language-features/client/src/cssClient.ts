/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, CompletionItem, CompletionItemKind, ExtensionContext, languages, Position, Range, SnippetString, TextEdit, window, TextDocument, CompletionContext, CancellationToken, ProviderResult, CompletionList, FormattingOptions, workspace } from 'vscode';
import { Disposable, LanguageClientOptions, ProvideCompletionItemsSignature, NotificationType, CommonLanguageClient, DocumentRangeFormattingParams, DocumentRangeFormattingRequest } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { getCustomDataSource } from './customData';
import { RequestService, serveFileSystemRequests } from './requests';

namespace CustomDataChangedNotification {
	export const type: NotificationType<string[]> = new NotificationType('css/customDataChanged');
}

const localize = nls.loadMessageBundle();

export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => CommonLanguageClient;

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
	selectorSeparatorNewline?: boolean;
	newlineBetweenRules?: boolean;
	spaceAroundSelectorSeparator?: boolean;
}

const cssFormatSettingKeys: (keyof CSSFormatSettings)[] = ['selectorSeparatorNewline', 'newlineBetweenRules', 'spaceAroundSelectorSeparator'];

export function startClient(context: ExtensionContext, newLanguageClient: LanguageClientConstructor, runtime: Runtime) {

	const customDataSource = getCustomDataSource(context.subscriptions);

	let documentSelector = ['css', 'scss', 'less'];

	const formatterRegistrations: FormatterRegistration[] = documentSelector.map(languageId => ({
		languageId, settingId: `${languageId}.format.enable`, provider: undefined
	}));

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
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
	let client = newLanguageClient('css', localize('cssserver.name', 'CSS Language Server'), clientOptions);
	client.registerProposedFeatures();
	client.onReady().then(() => {

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
	});

	let disposable = client.start();
	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	client.onReady().then(() => {
		context.subscriptions.push(initCompletionProvider());
	});

	function initCompletionProvider(): Disposable {
		const regionCompletionRegExpr = /^(\s*)(\/(\*\s*(#\w*)?)?)?$/;

		return languages.registerCompletionItemProvider(documentSelector, {
			provideCompletionItems(doc: TextDocument, pos: Position) {
				let lineUntilPos = doc.getText(new Range(new Position(pos.line, 0), pos));
				let match = lineUntilPos.match(regionCompletionRegExpr);
				if (match) {
					let range = new Range(new Position(pos.line, match[1].length), pos);
					let beginProposal = new CompletionItem('#region', CompletionItemKind.Snippet);
					beginProposal.range = range; TextEdit.replace(range, '/* #region */');
					beginProposal.insertText = new SnippetString('/* #region $1*/');
					beginProposal.documentation = localize('folding.start', 'Folding Region Start');
					beginProposal.filterText = match[2];
					beginProposal.sortText = 'za';
					let endProposal = new CompletionItem('#endregion', CompletionItemKind.Snippet);
					endProposal.range = range;
					endProposal.insertText = '/* #endregion */';
					endProposal.documentation = localize('folding.end', 'Folding Region End');
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
		let textEditor = window.activeTextEditor;
		if (textEditor && textEditor.document.uri.toString() === uri) {
			if (textEditor.document.version !== documentVersion) {
				window.showInformationMessage(`CSS fix is outdated and can't be applied to the document.`);
			}
			textEditor.edit(mutator => {
				for (let edit of edits) {
					mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
				}
			}).then(success => {
				if (!success) {
					window.showErrorMessage('Failed to apply CSS fix to the document. Please consider opening an issue with steps to reproduce.');
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
							if (val !== undefined) {
								params.options[key] = val;
							}
						}
					}
					console.log(JSON.stringify(params.options));
					return client.sendRequest(DocumentRangeFormattingRequest.type, params, token).then(
						client.protocol2CodeConverter.asTextEdits,
						(error) => {
							client.handleFailedRequest(DocumentRangeFormattingRequest.type, error, []);
							return Promise.resolve([]);
						}
					);
				}
			});
		}
	}
}
