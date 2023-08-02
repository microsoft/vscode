/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type JSONLanguageStatus = { schemas: string[] };

import {
	workspace, window, languages, commands, ExtensionContext, extensions, Uri, ColorInformation,
	Diagnostic, StatusBarAlignment, TextEditor, TextDocument, FormattingOptions, CancellationToken, FoldingRange,
	ProviderResult, TextEdit, Range, Position, Disposable, CompletionItem, CompletionList, CompletionContext, Hover, MarkdownString, FoldingContext, DocumentSymbol, SymbolInformation, l10n, TextEditorOptions
} from 'vscode';
import {
	LanguageClientOptions, RequestType, NotificationType, FormattingOptions as LSPFormattingOptions,
	DidChangeConfigurationNotification, HandleDiagnosticsSignature, ResponseError, DocumentRangeFormattingParams,
	DocumentRangeFormattingRequest, ProvideCompletionItemsSignature, ProvideHoverSignature, BaseLanguageClient, ProvideFoldingRangeSignature, ProvideDocumentSymbolsSignature, ProvideDocumentColorsSignature
} from 'vscode-languageclient';


import { hash } from './utils/hash';
import { createDocumentSymbolsLimitItem, createLanguageStatusItem, createLimitStatusItem } from './languageStatus';

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any> = new RequestType('vscode/content');
}

namespace SchemaContentChangeNotification {
	export const type: NotificationType<string | string[]> = new NotificationType('json/schemaContent');
}

namespace ForceValidateRequest {
	export const type: RequestType<string, Diagnostic[], any> = new RequestType('json/validate');
}

namespace LanguageStatusRequest {
	export const type: RequestType<string, JSONLanguageStatus, any> = new RequestType('json/languageStatus');
}

interface SortOptions extends LSPFormattingOptions {
}

interface DocumentSortingParams {
	/**
	 * The uri of the document to sort.
	 */
	readonly uri: string;
	/**
	 * The sort options
	 */
	readonly options: SortOptions;
}

namespace DocumentSortingRequest {
	export interface ITextEdit {
		range: {
			start: { line: number; character: number };
			end: { line: number; character: number };
		};
		newText: string;
	}
	export const type: RequestType<DocumentSortingParams, ITextEdit[], any> = new RequestType('json/sort');
}

export interface ISchemaAssociations {
	[pattern: string]: string[];
}

export interface ISchemaAssociation {
	fileMatch: string[];
	uri: string;
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations | ISchemaAssociation[]> = new NotificationType('json/schemaAssociations');
}

type Settings = {
	json?: {
		schemas?: JSONSchemaSettings[];
		format?: { enable?: boolean };
		keepLines?: { enable?: boolean };
		validate?: { enable?: boolean };
		resultLimit?: number;
		jsonFoldingLimit?: number;
		jsoncFoldingLimit?: number;
		jsonColorDecoratorLimit?: number;
		jsoncColorDecoratorLimit?: number;
	};
	http?: {
		proxy?: string;
		proxyStrictSSL?: boolean;
	};
};

export type JSONSchemaSettings = {
	fileMatch?: string[];
	url?: string;
	schema?: any;
	folderUri?: string;
};

export namespace SettingIds {
	export const enableFormatter = 'json.format.enable';
	export const enableKeepLines = 'json.format.keepLines';
	export const enableSortOnSave = 'json.sortOnSave.enable';
	export const enableValidation = 'json.validate.enable';
	export const enableSchemaDownload = 'json.schemaDownload.enable';
	export const maxItemsComputed = 'json.maxItemsComputed';
	export const editorFoldingMaximumRegions = 'editor.foldingMaximumRegions';
	export const editorColorDecoratorsLimit = 'editor.colorDecoratorsLimit';

	export const editorSection = 'editor';
	export const foldingMaximumRegions = 'foldingMaximumRegions';
	export const colorDecoratorsLimit = 'colorDecoratorsLimit';
}

export interface TelemetryReporter {
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}, measurements?: {
		[key: string]: number;
	}): void;
}

export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;

export interface Runtime {
	schemaRequests: SchemaRequestService;
	telemetry?: TelemetryReporter;
}

export interface SchemaRequestService {
	getContent(uri: string): Promise<string>;
	clearCache?(): Promise<string[]>;
}

export const languageServerDescription = l10n.t('JSON Language Server');

let resultLimit = 5000;
let jsonFoldingLimit = 5000;
let jsoncFoldingLimit = 5000;
let jsonColorDecoratorLimit = 5000;
let jsoncColorDecoratorLimit = 5000;

export async function startClient(context: ExtensionContext, newLanguageClient: LanguageClientConstructor, runtime: Runtime): Promise<BaseLanguageClient> {

	const toDispose = context.subscriptions;

	let rangeFormatting: Disposable | undefined = undefined;

	const documentSelector = ['json', 'jsonc'];

	const schemaResolutionErrorStatusBarItem = window.createStatusBarItem('status.json.resolveError', StatusBarAlignment.Right, 0);
	schemaResolutionErrorStatusBarItem.name = l10n.t('JSON: Schema Resolution Error');
	schemaResolutionErrorStatusBarItem.text = '$(alert)';
	toDispose.push(schemaResolutionErrorStatusBarItem);

	const fileSchemaErrors = new Map<string, string>();
	let schemaDownloadEnabled = true;

	let isClientReady = false;

	const documentSymbolsLimitStatusbarItem = createLimitStatusItem((limit: number) => createDocumentSymbolsLimitItem(documentSelector, SettingIds.maxItemsComputed, limit));
	toDispose.push(documentSymbolsLimitStatusbarItem);

	toDispose.push(commands.registerCommand('json.clearCache', async () => {
		if (isClientReady && runtime.schemaRequests.clearCache) {
			const cachedSchemas = await runtime.schemaRequests.clearCache();
			await client.sendNotification(SchemaContentChangeNotification.type, cachedSchemas);
		}
		window.showInformationMessage(l10n.t('JSON schema cache cleared.'));
	}));

	toDispose.push(workspace.onWillSaveTextDocument(event => {
		const sortOnSave = workspace.getConfiguration().get<boolean>(SettingIds.enableSortOnSave);
		const document = event.document;
		if (sortOnSave && (document.languageId === 'json' || document.languageId === 'jsonc')) {
			const documentOptions = getOptionsForDocument(document);
			const textEditsPromise = getSortTextEdits(document, documentOptions?.tabSize, documentOptions?.insertSpaces);
			event.waitUntil(textEditsPromise);
		}
	}));

	toDispose.push(commands.registerCommand('json.sort', async () => {

		if (isClientReady) {
			const textEditor = window.activeTextEditor;
			if (textEditor) {
				const documentOptions = textEditor.options;
				const textEdits = await getSortTextEdits(textEditor.document, documentOptions.tabSize, documentOptions.insertSpaces);
				const success = await textEditor.edit(mutator => {
					for (const edit of textEdits) {
						mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
					}
				});
				if (!success) {
					window.showErrorMessage(l10n.t('Failed to sort the JSONC document, please consider opening an issue.'));
				}
			}
		}
	}));

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for json documents
		documentSelector,
		initializationOptions: {
			handledSchemaProtocols: ['file'], // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
			provideFormatter: false, // tell the server to not provide formatting capability and ignore the `json.format.enable` setting.
			customCapabilities: { rangeFormatting: { editLimit: 10000 } }
		},
		synchronize: {
			// Synchronize the setting section 'json' to the server
			configurationSection: ['json', 'http'],
			fileEvents: workspace.createFileSystemWatcher('**/*.json')
		},
		middleware: {
			workspace: {
				didChangeConfiguration: () => client.sendNotification(DidChangeConfigurationNotification.type, { settings: getSettings() })
			},
			handleDiagnostics: (uri: Uri, diagnostics: Diagnostic[], next: HandleDiagnosticsSignature) => {
				const schemaErrorIndex = diagnostics.findIndex(isSchemaResolveError);

				if (schemaErrorIndex === -1) {
					fileSchemaErrors.delete(uri.toString());
					return next(uri, diagnostics);
				}

				const schemaResolveDiagnostic = diagnostics[schemaErrorIndex];
				fileSchemaErrors.set(uri.toString(), schemaResolveDiagnostic.message);

				if (!schemaDownloadEnabled) {
					diagnostics = diagnostics.filter(d => !isSchemaResolveError(d));
				}

				if (window.activeTextEditor && window.activeTextEditor.document.uri.toString() === uri.toString()) {
					schemaResolutionErrorStatusBarItem.show();
				}

				next(uri, diagnostics);
			},
			// testing the replace / insert mode
			provideCompletionItem(document: TextDocument, position: Position, context: CompletionContext, token: CancellationToken, next: ProvideCompletionItemsSignature): ProviderResult<CompletionItem[] | CompletionList> {
				function update(item: CompletionItem) {
					const range = item.range;
					if (range instanceof Range && range.end.isAfter(position) && range.start.isBeforeOrEqual(position)) {
						item.range = { inserting: new Range(range.start, position), replacing: range };
					}
					if (item.documentation instanceof MarkdownString) {
						item.documentation = updateMarkdownString(item.documentation);
					}

				}
				function updateProposals(r: CompletionItem[] | CompletionList | null | undefined): CompletionItem[] | CompletionList | null | undefined {
					if (r) {
						(Array.isArray(r) ? r : r.items).forEach(update);
					}
					return r;
				}

				const r = next(document, position, context, token);
				if (isThenable<CompletionItem[] | CompletionList | null | undefined>(r)) {
					return r.then(updateProposals);
				}
				return updateProposals(r);
			},
			provideHover(document: TextDocument, position: Position, token: CancellationToken, next: ProvideHoverSignature) {
				function updateHover(r: Hover | null | undefined): Hover | null | undefined {
					if (r && Array.isArray(r.contents)) {
						r.contents = r.contents.map(h => h instanceof MarkdownString ? updateMarkdownString(h) : h);
					}
					return r;
				}
				const r = next(document, position, token);
				if (isThenable<Hover | null | undefined>(r)) {
					return r.then(updateHover);
				}
				return updateHover(r);
			},
			provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken, next: ProvideFoldingRangeSignature) {
				const r = next(document, context, token);
				if (isThenable<FoldingRange[] | null | undefined>(r)) {
					return r;
				}
				return r;
			},
			provideDocumentColors(document: TextDocument, token: CancellationToken, next: ProvideDocumentColorsSignature) {
				const r = next(document, token);
				if (isThenable<ColorInformation[] | null | undefined>(r)) {
					return r;
				}
				return r;
			},
			provideDocumentSymbols(document: TextDocument, token: CancellationToken, next: ProvideDocumentSymbolsSignature) {
				type T = SymbolInformation[] | DocumentSymbol[];
				function countDocumentSymbols(symbols: DocumentSymbol[]): number {
					return symbols.reduce((previousValue, s) => previousValue + 1 + countDocumentSymbols(s.children), 0);
				}
				function isDocumentSymbol(r: T): r is DocumentSymbol[] {
					return r[0] instanceof DocumentSymbol;
				}
				function checkLimit(r: T | null | undefined): T | null | undefined {
					if (Array.isArray(r) && (isDocumentSymbol(r) ? countDocumentSymbols(r) : r.length) > resultLimit) {
						documentSymbolsLimitStatusbarItem.update(document, resultLimit);
					} else {
						documentSymbolsLimitStatusbarItem.update(document, false);
					}
					return r;
				}
				const r = next(document, token);
				if (isThenable<T | undefined | null>(r)) {
					return r.then(checkLimit);
				}
				return checkLimit(r);
			}
		}
	};

	// Create the language client and start the client.
	const client = newLanguageClient('json', languageServerDescription, clientOptions);
	client.registerProposedFeatures();

	const schemaDocuments: { [uri: string]: boolean } = {};

	// handle content request
	client.onRequest(VSCodeContentRequest.type, (uriPath: string) => {
		const uri = Uri.parse(uriPath);
		if (uri.scheme === 'untitled') {
			return Promise.reject(new ResponseError(3, l10n.t('Unable to load {0}', uri.toString())));
		}
		if (uri.scheme !== 'http' && uri.scheme !== 'https') {
			return workspace.openTextDocument(uri).then(doc => {
				schemaDocuments[uri.toString()] = true;
				return doc.getText();
			}, error => {
				return Promise.reject(new ResponseError(2, error.toString()));
			});
		} else if (schemaDownloadEnabled) {
			if (runtime.telemetry && uri.authority === 'schema.management.azure.com') {
				/* __GDPR__
					"json.schema" : {
						"owner": "aeschli",
						"comment": "Measure the use of the Azure resource manager schemas",
						"schemaURL" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The azure schema URL that was requested." }
					}
				*/
				runtime.telemetry.sendTelemetryEvent('json.schema', { schemaURL: uriPath });
			}
			return runtime.schemaRequests.getContent(uriPath).catch(e => {
				return Promise.reject(new ResponseError(4, e.toString()));
			});
		} else {
			return Promise.reject(new ResponseError(1, l10n.t('Downloading schemas is disabled through setting \'{0}\'', SettingIds.enableSchemaDownload)));
		}
	});

	await client.start();

	isClientReady = true;

	const handleContentChange = (uriString: string) => {
		if (schemaDocuments[uriString]) {
			client.sendNotification(SchemaContentChangeNotification.type, uriString);
			return true;
		}
		return false;
	};
	const handleActiveEditorChange = (activeEditor?: TextEditor) => {
		if (!activeEditor) {
			return;
		}

		const activeDocUri = activeEditor.document.uri.toString();

		if (activeDocUri && fileSchemaErrors.has(activeDocUri)) {
			schemaResolutionErrorStatusBarItem.show();
		} else {
			schemaResolutionErrorStatusBarItem.hide();
		}
	};

	toDispose.push(workspace.onDidChangeTextDocument(e => handleContentChange(e.document.uri.toString())));
	toDispose.push(workspace.onDidCloseTextDocument(d => {
		const uriString = d.uri.toString();
		if (handleContentChange(uriString)) {
			delete schemaDocuments[uriString];
		}
		fileSchemaErrors.delete(uriString);
	}));
	toDispose.push(window.onDidChangeActiveTextEditor(handleActiveEditorChange));

	const handleRetryResolveSchemaCommand = () => {
		if (window.activeTextEditor) {
			schemaResolutionErrorStatusBarItem.text = '$(watch)';
			const activeDocUri = window.activeTextEditor.document.uri.toString();
			client.sendRequest(ForceValidateRequest.type, activeDocUri).then((diagnostics) => {
				const schemaErrorIndex = diagnostics.findIndex(isSchemaResolveError);
				if (schemaErrorIndex !== -1) {
					// Show schema resolution errors in status bar only; ref: #51032
					const schemaResolveDiagnostic = diagnostics[schemaErrorIndex];
					fileSchemaErrors.set(activeDocUri, schemaResolveDiagnostic.message);
				} else {
					schemaResolutionErrorStatusBarItem.hide();
				}
				schemaResolutionErrorStatusBarItem.text = '$(alert)';
			});
		}
	};

	toDispose.push(commands.registerCommand('_json.retryResolveSchema', handleRetryResolveSchemaCommand));

	client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociations(context));

	toDispose.push(extensions.onDidChange(_ => {
		client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociations(context));
	}));

	// manually register / deregister format provider based on the `json.format.enable` setting avoiding issues with late registration. See #71652.
	updateFormatterRegistration();
	toDispose.push({ dispose: () => rangeFormatting && rangeFormatting.dispose() });

	updateSchemaDownloadSetting();

	toDispose.push(workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(SettingIds.enableFormatter)) {
			updateFormatterRegistration();
		} else if (e.affectsConfiguration(SettingIds.enableSchemaDownload)) {
			updateSchemaDownloadSetting();
		} else if (e.affectsConfiguration(SettingIds.editorFoldingMaximumRegions) || e.affectsConfiguration(SettingIds.editorColorDecoratorsLimit)) {
			client.sendNotification(DidChangeConfigurationNotification.type, { settings: getSettings() });
		}
	}));

	toDispose.push(createLanguageStatusItem(documentSelector, (uri: string) => client.sendRequest(LanguageStatusRequest.type, uri)));

	function updateFormatterRegistration() {
		const formatEnabled = workspace.getConfiguration().get(SettingIds.enableFormatter);
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

	function updateSchemaDownloadSetting() {
		schemaDownloadEnabled = workspace.getConfiguration().get(SettingIds.enableSchemaDownload) !== false;
		if (schemaDownloadEnabled) {
			schemaResolutionErrorStatusBarItem.tooltip = l10n.t('Unable to resolve schema. Click to retry.');
			schemaResolutionErrorStatusBarItem.command = '_json.retryResolveSchema';
			handleRetryResolveSchemaCommand();
		} else {
			schemaResolutionErrorStatusBarItem.tooltip = l10n.t('Downloading schemas is disabled. Click to configure.');
			schemaResolutionErrorStatusBarItem.command = { command: 'workbench.action.openSettings', arguments: [SettingIds.enableSchemaDownload], title: '' };
		}
	}

	async function getSortTextEdits(document: TextDocument, tabSize: string | number = 4, insertSpaces: string | boolean = true): Promise<TextEdit[]> {
		const filesConfig = workspace.getConfiguration('files', document);
		const options: SortOptions = {
			tabSize: Number(tabSize),
			insertSpaces: Boolean(insertSpaces),
			trimTrailingWhitespace: filesConfig.get<boolean>('trimTrailingWhitespace'),
			trimFinalNewlines: filesConfig.get<boolean>('trimFinalNewlines'),
			insertFinalNewline: filesConfig.get<boolean>('insertFinalNewline'),
		};
		const params: DocumentSortingParams = {
			uri: document.uri.toString(),
			options
		};
		const edits = await client.sendRequest(DocumentSortingRequest.type, params);
		// Here we convert the JSON objects to real TextEdit objects
		return edits.map((edit) => {
			return new TextEdit(
				new Range(edit.range.start.line, edit.range.start.character, edit.range.end.line, edit.range.end.character),
				edit.newText
			);
		});
	}

	return client;
}

function getSchemaAssociations(_context: ExtensionContext): ISchemaAssociation[] {
	const associations: ISchemaAssociation[] = [];
	extensions.all.forEach(extension => {
		const packageJSON = extension.packageJSON;
		if (packageJSON && packageJSON.contributes && packageJSON.contributes.jsonValidation) {
			const jsonValidation = packageJSON.contributes.jsonValidation;
			if (Array.isArray(jsonValidation)) {
				jsonValidation.forEach(jv => {
					let { fileMatch, url } = jv;
					if (typeof fileMatch === 'string') {
						fileMatch = [fileMatch];
					}
					if (Array.isArray(fileMatch) && typeof url === 'string') {
						let uri: string = url;
						if (uri[0] === '.' && uri[1] === '/') {
							uri = Uri.joinPath(extension.extensionUri, uri).toString();
						}
						fileMatch = fileMatch.map(fm => {
							if (fm[0] === '%') {
								fm = fm.replace(/%APP_SETTINGS_HOME%/, '/User');
								fm = fm.replace(/%MACHINE_SETTINGS_HOME%/, '/Machine');
								fm = fm.replace(/%APP_WORKSPACES_HOME%/, '/Workspaces');
							} else if (!fm.match(/^(\w+:\/\/|\/|!)/)) {
								fm = '/' + fm;
							}
							return fm;
						});
						associations.push({ fileMatch, uri });
					}
				});
			}
		}
	});
	return associations;
}

function getSettings(): Settings {
	const configuration = workspace.getConfiguration();
	const httpSettings = workspace.getConfiguration('http');

	const normalizeLimit = (settingValue: any) => Math.trunc(Math.max(0, Number(settingValue))) || 5000;

	resultLimit = normalizeLimit(workspace.getConfiguration().get(SettingIds.maxItemsComputed));
	const editorJSONSettings = workspace.getConfiguration(SettingIds.editorSection, { languageId: 'json' });
	const editorJSONCSettings = workspace.getConfiguration(SettingIds.editorSection, { languageId: 'jsonc' });

	jsonFoldingLimit = normalizeLimit(editorJSONSettings.get(SettingIds.foldingMaximumRegions));
	jsoncFoldingLimit = normalizeLimit(editorJSONCSettings.get(SettingIds.foldingMaximumRegions));
	jsonColorDecoratorLimit = normalizeLimit(editorJSONSettings.get(SettingIds.colorDecoratorsLimit));
	jsoncColorDecoratorLimit = normalizeLimit(editorJSONCSettings.get(SettingIds.colorDecoratorsLimit));

	const schemas: JSONSchemaSettings[] = [];

	const settings: Settings = {
		http: {
			proxy: httpSettings.get('proxy'),
			proxyStrictSSL: httpSettings.get('proxyStrictSSL')
		},
		json: {
			validate: { enable: configuration.get(SettingIds.enableValidation) },
			format: { enable: configuration.get(SettingIds.enableFormatter) },
			keepLines: { enable: configuration.get(SettingIds.enableKeepLines) },
			schemas,
			resultLimit: resultLimit + 1, // ask for one more so we can detect if the limit has been exceeded
			jsonFoldingLimit: jsonFoldingLimit + 1,
			jsoncFoldingLimit: jsoncFoldingLimit + 1,
			jsonColorDecoratorLimit: jsonColorDecoratorLimit + 1,
			jsoncColorDecoratorLimit: jsoncColorDecoratorLimit + 1
		}
	};

	/*
	 * Add schemas from the settings
	 * folderUri to which folder the setting is scoped to. `undefined` means global (also external files)
	 * settingsLocation against which path relative schema URLs are resolved
	 */
	const collectSchemaSettings = (schemaSettings: JSONSchemaSettings[] | undefined, folderUri: string | undefined, settingsLocation: Uri | undefined) => {
		if (schemaSettings) {
			for (const setting of schemaSettings) {
				const url = getSchemaId(setting, settingsLocation);
				if (url) {
					const schemaSetting: JSONSchemaSettings = { url, fileMatch: setting.fileMatch, folderUri, schema: setting.schema };
					schemas.push(schemaSetting);
				}
			}
		}
	};

	const folders = workspace.workspaceFolders ?? [];

	const schemaConfigInfo = workspace.getConfiguration('json', null).inspect<JSONSchemaSettings[]>('schemas');
	if (schemaConfigInfo) {
		// settings in user config
		collectSchemaSettings(schemaConfigInfo.globalValue, undefined, undefined);
		if (workspace.workspaceFile) {
			if (schemaConfigInfo.workspaceValue) {
				const settingsLocation = Uri.joinPath(workspace.workspaceFile, '..');
				// settings in the workspace configuration file apply to all files (also external files)
				collectSchemaSettings(schemaConfigInfo.workspaceValue, undefined, settingsLocation);
			}
			for (const folder of folders) {
				const folderUri = folder.uri;
				const folderSchemaConfigInfo = workspace.getConfiguration('json', folderUri).inspect<JSONSchemaSettings[]>('schemas');
				collectSchemaSettings(folderSchemaConfigInfo?.workspaceFolderValue, folderUri.toString(false), folderUri);
			}
		} else {
			if (schemaConfigInfo.workspaceValue && folders.length === 1) {
				// single folder workspace: settings apply to all files (also external files)
				collectSchemaSettings(schemaConfigInfo.workspaceValue, undefined, folders[0].uri);
			}
		}
	}
	return settings;
}

function getSchemaId(schema: JSONSchemaSettings, settingsLocation?: Uri): string | undefined {
	let url = schema.url;
	if (!url) {
		if (schema.schema) {
			url = schema.schema.id || `vscode://schemas/custom/${encodeURIComponent(hash(schema.schema).toString(16))}`;
		}
	} else if (settingsLocation && (url[0] === '.' || url[0] === '/')) {
		url = Uri.joinPath(settingsLocation, url).toString(false);
	}
	return url;
}

function isThenable<T>(obj: ProviderResult<T>): obj is Thenable<T> {
	return obj && (<any>obj)['then'];
}

function updateMarkdownString(h: MarkdownString): MarkdownString {
	const n = new MarkdownString(h.value, true);
	n.isTrusted = h.isTrusted;
	return n;
}

function isSchemaResolveError(d: Diagnostic) {
	return d.code === /* SchemaResolveError */ 0x300;
}

function getOptionsForDocument(document: TextDocument): TextEditorOptions | undefined {
	for (const editor of window.visibleTextEditors) {
		if (editor.document.uri.toString() === document.uri.toString()) {
			return editor.options;
		}
	}
	return;
}
