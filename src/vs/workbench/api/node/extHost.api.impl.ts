/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Emitter} from 'vs/base/common/event';
import {score} from 'vs/editor/common/modes/languageSelector';
import * as Platform from 'vs/base/common/platform';
import {regExpLeadsToEndlessLoop} from 'vs/base/common/strings';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import * as errors from 'vs/base/common/errors';
import {ExtHostFileSystemEventService} from 'vs/workbench/api/node/extHostFileSystemEventService';
import {ExtHostModelService, setWordDefinitionFor} from 'vs/workbench/api/node/extHostDocuments';
import {ExtHostConfiguration} from 'vs/workbench/api/node/extHostConfiguration';
import {ExtHostDiagnostics} from 'vs/workbench/api/node/extHostDiagnostics';
import {ExtHostWorkspace} from 'vs/workbench/api/node/extHostWorkspace';
import {ExtHostQuickOpen} from 'vs/workbench/api/node/extHostQuickOpen';
import {ExtHostStatusBar} from 'vs/workbench/api/node/extHostStatusBar';
import {ExtHostCommands} from 'vs/workbench/api/node/extHostCommands';
import {ExtHostOutputService} from 'vs/workbench/api/node/extHostOutputService';
import {ExtHostMessageService} from 'vs/workbench/api/node/extHostMessageService';
import {ExtHostEditors} from 'vs/workbench/api/node/extHostEditors';
import {ExtHostLanguages} from 'vs/workbench/api/node/extHostLanguages';
import {ExtHostLanguageFeatures} from 'vs/workbench/api/node/extHostLanguageFeatures';
import {registerApiCommands} from 'vs/workbench/api/node/extHostApiCommands';
import * as extHostTypes from 'vs/workbench/api/node/extHostTypes';
import Modes = require('vs/editor/common/modes');
import {IModeService} from 'vs/editor/common/services/modeService';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import {IDisposable} from 'vs/base/common/lifecycle';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IExtensionService, IExtensionDescription} from 'vs/platform/extensions/common/extensions';
import {ExtHostExtensionService} from 'vs/platform/extensions/common/nativeExtensionService';
import {ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {TPromise} from 'vs/base/common/winjs.base';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {CancellationTokenSource} from 'vs/base/common/cancellation';
import vscode = require('vscode');
import {TextEditorRevealType} from 'vs/workbench/api/node/mainThreadEditors';
import * as paths from 'vs/base/common/paths';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';

/**
 * This class implements the API described in vscode.d.ts,
 * for the case of the extensionHost host process
 */
export class ExtHostAPIImplementation {

	private static _LAST_REGISTER_TOKEN = 0;
	private static generateDisposeToken(): string {
		return String(++ExtHostAPIImplementation._LAST_REGISTER_TOKEN);
	}

	private _threadService: IThreadService;
	private _proxy: MainProcessVSCodeAPIHelper;

	version: typeof vscode.version;
	env: typeof vscode.env;
	Uri: typeof vscode.Uri;
	Location: typeof vscode.Location;
	Diagnostic: typeof vscode.Diagnostic;
	DiagnosticSeverity: typeof vscode.DiagnosticSeverity;
	Disposable: typeof vscode.Disposable;
	TextEdit: typeof vscode.TextEdit;
	WorkspaceEdit: typeof vscode.WorkspaceEdit;
	ViewColumn: typeof vscode.ViewColumn;
	StatusBarAlignment: typeof vscode.StatusBarAlignment;
	Position: typeof vscode.Position;
	Range: typeof vscode.Range;
	Selection: typeof vscode.Selection;
	CancellationTokenSource: typeof vscode.CancellationTokenSource;
	EventEmitter: typeof vscode.EventEmitter;
	Hover: typeof vscode.Hover;
	DocumentHighlightKind: typeof vscode.DocumentHighlightKind;
	DocumentHighlight: typeof vscode.DocumentHighlight;
	SymbolKind: typeof vscode.SymbolKind;
	SymbolInformation: typeof vscode.SymbolInformation;
	CodeLens: typeof vscode.CodeLens;
	ParameterInformation: typeof vscode.ParameterInformation;
	SignatureInformation: typeof vscode.SignatureInformation;
	SignatureHelp: typeof vscode.SignatureHelp;
	CompletionItem: typeof vscode.CompletionItem;
	CompletionItemKind: typeof vscode.CompletionItemKind;
	CompletionList: typeof vscode.CompletionList;
	IndentAction: typeof vscode.IndentAction;
	OverviewRulerLane: typeof vscode.OverviewRulerLane;
	TextEditorRevealType: typeof vscode.TextEditorRevealType;
	EndOfLine: typeof vscode.EndOfLine;
	TextEditorCursorStyle: typeof vscode.TextEditorCursorStyle;
	commands: typeof vscode.commands;
	window: typeof vscode.window;
	workspace: typeof vscode.workspace;
	languages: typeof vscode.languages;
	extensions: typeof vscode.extensions;

	constructor(
		@IThreadService threadService: IThreadService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		this._threadService = threadService;
		this._proxy = threadService.getRemotable(MainProcessVSCodeAPIHelper);

		this.version = contextService.getConfiguration().env.version;
		this.Uri = URI;
		this.Location = extHostTypes.Location;
		this.Diagnostic = extHostTypes.Diagnostic;
		this.DiagnosticSeverity = extHostTypes.DiagnosticSeverity;
		this.EventEmitter = Emitter;
		this.Disposable = extHostTypes.Disposable;
		this.TextEdit = extHostTypes.TextEdit;
		this.WorkspaceEdit = extHostTypes.WorkspaceEdit;
		this.Position = extHostTypes.Position;
		this.Range = extHostTypes.Range;
		this.Selection = extHostTypes.Selection;
		this.CancellationTokenSource = CancellationTokenSource;
		this.Hover = extHostTypes.Hover;
		this.SymbolKind = extHostTypes.SymbolKind;
		this.SymbolInformation = extHostTypes.SymbolInformation;
		this.DocumentHighlightKind = extHostTypes.DocumentHighlightKind;
		this.DocumentHighlight = extHostTypes.DocumentHighlight;
		this.CodeLens = extHostTypes.CodeLens;
		this.ParameterInformation = extHostTypes.ParameterInformation;
		this.SignatureInformation = extHostTypes.SignatureInformation;
		this.SignatureHelp = extHostTypes.SignatureHelp;
		this.CompletionItem = extHostTypes.CompletionItem;
		this.CompletionItemKind = extHostTypes.CompletionItemKind;
		this.CompletionList = extHostTypes.CompletionList;
		this.ViewColumn = extHostTypes.ViewColumn;
		this.StatusBarAlignment = extHostTypes.StatusBarAlignment;
		this.IndentAction = Modes.IndentAction;
		this.OverviewRulerLane = EditorCommon.OverviewRulerLane;
		this.TextEditorRevealType = TextEditorRevealType;
		this.EndOfLine = extHostTypes.EndOfLine;
		this.TextEditorCursorStyle = EditorCommon.TextEditorCursorStyle;

		errors.setUnexpectedErrorHandler((err) => {
			this._proxy.onUnexpectedExtHostError(errors.transformErrorForSerialization(err));
		});

		const extHostCommands = this._threadService.getRemotable(ExtHostCommands);
		const extHostEditors = this._threadService.getRemotable(ExtHostEditors);
		const extHostMessageService = new ExtHostMessageService(this._threadService, this.commands);
		const extHostQuickOpen = this._threadService.getRemotable(ExtHostQuickOpen);
		const extHostStatusBar = new ExtHostStatusBar(this._threadService);
		const extHostOutputService = new ExtHostOutputService(this._threadService);

		// env namespace
		let telemetryInfo: ITelemetryInfo;
		this.env = Object.freeze({
			get machineId() { return telemetryInfo.machineId; },
			get sessionId() { return telemetryInfo.sessionId; },
			get language() { return Platform.language; }
		});
		telemetryService.getTelemetryInfo().then(info => telemetryInfo = info, errors.onUnexpectedError);

		// commands namespace
		this.commands = {
			registerCommand<T>(id: string, command: <T>(...args: any[]) => T | Thenable<T>, thisArgs?: any): vscode.Disposable {
				return extHostCommands.registerCommand(id, command, thisArgs);
			},
			registerTextEditorCommand(id: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => void, thisArg?: any): vscode.Disposable {
				let actualCallback: typeof callback = thisArg ? callback.bind(thisArg) : callback;
				return extHostCommands.registerCommand(id, () => {
					let activeTextEditor = extHostEditors.getActiveTextEditor();
					if (!activeTextEditor) {
						console.warn('Cannot execute ' + id + ' because there is no active text editor.');
						return;
					}

					activeTextEditor.edit((edit: vscode.TextEditorEdit) => {
						actualCallback(activeTextEditor, edit);
					}).then((result) => {
						if (!result) {
							console.warn('Edits from command ' + id + ' were not applied.');
						}
					}, (err) => {
						console.warn('An error occured while running command ' + id, err);
					});
				});
			},
			executeCommand<T>(id: string, ...args: any[]): Thenable<T> {
				return extHostCommands.executeCommand(id, ...args);
			},
			getCommands(filterInternal: boolean = false): Thenable<string[]> {
				return extHostCommands.getCommands(filterInternal);
			}
		};

		this.window = {
			get activeTextEditor() {
				return extHostEditors.getActiveTextEditor();
			},
			get visibleTextEditors() {
				return extHostEditors.getVisibleTextEditors();
			},
			showTextDocument(document: vscode.TextDocument, column?: vscode.ViewColumn, preserveFocus?: boolean): TPromise<vscode.TextEditor> {
				return extHostEditors.showTextDocument(document, column, preserveFocus);
			},
			createTextEditorDecorationType(options:vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
				return extHostEditors.createTextEditorDecorationType(options);
			},
			onDidChangeActiveTextEditor: extHostEditors.onDidChangeActiveTextEditor.bind(extHostEditors),
			onDidChangeTextEditorSelection: (listener: (e: vscode.TextEditorSelectionChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return extHostEditors.onDidChangeTextEditorSelection(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorOptions: (listener: (e: vscode.TextEditorOptionsChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return extHostEditors.onDidChangeTextEditorOptions(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorViewColumn(listener, thisArg?, disposables?) {
				return extHostEditors.onDidChangeTextEditorViewColumn(listener, thisArg, disposables);
			},
			showInformationMessage: (message, ...items) => {
				return extHostMessageService.showMessage(Severity.Info, message, items);
			},
			showWarningMessage: (message, ...items) => {
				return extHostMessageService.showMessage(Severity.Warning, message, items);
			},
			showErrorMessage: (message, ...items) => {
				return extHostMessageService.showMessage(Severity.Error, message, items);
			},
			showQuickPick: (items: any, options: vscode.QuickPickOptions) => {
				return extHostQuickOpen.show(items, options);
			},
			showInputBox: extHostQuickOpen.input.bind(extHostQuickOpen),

			createStatusBarItem(position?: vscode.StatusBarAlignment, priority?: number): vscode.StatusBarItem {
				return extHostStatusBar.createStatusBarEntry(<number>position, priority);
			},
			setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): vscode.Disposable {
				return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
			},
			createOutputChannel(name: string): vscode.OutputChannel {
				return extHostOutputService.createOutputChannel(name);
			}
		};

		//
		const workspacePath = contextService.getWorkspace() ? contextService.getWorkspace().resource.fsPath : undefined;
		const extHostFileSystemEvent = threadService.getRemotable(ExtHostFileSystemEventService);
		const extHostWorkspace = new ExtHostWorkspace(this._threadService, workspacePath);
		const extHostDocuments = this._threadService.getRemotable(ExtHostModelService);
		this.workspace = Object.freeze({
			get rootPath() {
				return extHostWorkspace.getPath();
			},
			set rootPath(value) {
				throw errors.readonly();
			},
			asRelativePath: (pathOrUri) => {
				return extHostWorkspace.getRelativePath(pathOrUri);
			},
			findFiles: (include, exclude, maxResults?, token?) => {
				return extHostWorkspace.findFiles(include, exclude, maxResults, token);
			},
			saveAll: (includeUntitled?) => {
				return extHostWorkspace.saveAll(includeUntitled);
			},
			applyEdit(edit: vscode.WorkspaceEdit): TPromise<boolean> {
				return extHostWorkspace.appyEdit(edit);
			},
			createFileSystemWatcher: (pattern, ignoreCreate, ignoreChange, ignoreDelete): vscode.FileSystemWatcher => {
				return extHostFileSystemEvent.createFileSystemWatcher(pattern, ignoreCreate, ignoreChange, ignoreDelete);
			},
			get textDocuments() {
				return extHostDocuments.getAllDocumentData().map(data => data.document);
			},
			set textDocuments(value) {
				throw errors.readonly();
			},
			openTextDocument(uriOrFileName: vscode.Uri | string) {
				let uri: URI;
				if (typeof uriOrFileName === 'string') {
					uri = URI.file(uriOrFileName);
				} else if (uriOrFileName instanceof URI) {
					uri = <URI>uriOrFileName;
				} else {
					throw new Error('illegal argument - uriOrFileName');
				}
				return extHostDocuments.ensureDocumentData(uri).then(() => {
					const data = extHostDocuments.getDocumentData(uri);
					return data && data.document;
				});
			},
			registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider) {
				return extHostDocuments.registerTextDocumentContentProvider(scheme, provider);
			},
			onDidOpenTextDocument: (listener, thisArgs?, disposables?) => {
				return extHostDocuments.onDidAddDocument(listener, thisArgs, disposables);
			},
			onDidCloseTextDocument: (listener, thisArgs?, disposables?) => {
				return extHostDocuments.onDidRemoveDocument(listener, thisArgs, disposables);
			},
			onDidChangeTextDocument: (listener, thisArgs?, disposables?) => {
				return extHostDocuments.onDidChangeDocument(listener, thisArgs, disposables);
			},
			onDidSaveTextDocument: (listener, thisArgs?, disposables?) => {
				return extHostDocuments.onDidSaveDocument(listener, thisArgs, disposables);
			},
			onDidChangeConfiguration: (listener: () => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return extHostConfiguration.onDidChangeConfiguration(listener, thisArgs, disposables);
			},
			getConfiguration: (section?: string):vscode.WorkspaceConfiguration => {
				return extHostConfiguration.getConfiguration(section);
			}
		});

		//
		registerApiCommands(threadService);

		//
		const languages = new ExtHostLanguages(this._threadService);
		const extHostDiagnostics = new ExtHostDiagnostics(this._threadService);
		const languageFeatures = threadService.getRemotable(ExtHostLanguageFeatures);

		this.languages = {
			createDiagnosticCollection(name?: string): vscode.DiagnosticCollection {
				return extHostDiagnostics.createDiagnosticCollection(name);
			},
			getLanguages(): TPromise<string[]> {
				return languages.getLanguages();
			},
			match(selector: vscode.DocumentSelector, document: vscode.TextDocument): number {
				return score(selector, <any> document.uri, document.languageId);
			},
			registerCodeActionsProvider(selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider): vscode.Disposable {
				return languageFeatures.registerCodeActionProvider(selector, provider);
			},
			registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
				return languageFeatures.registerCodeLensProvider(selector, provider);
			},
			registerDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
				return languageFeatures.registerDefinitionProvider(selector, provider);
			},
			registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider): vscode.Disposable {
				return languageFeatures.registerHoverProvider(selector, provider);
			},
			registerDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
				return languageFeatures.registerDocumentHighlightProvider(selector, provider);
			},
			registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
				return languageFeatures.registerReferenceProvider(selector, provider);
			},
			registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
				return languageFeatures.registerRenameProvider(selector, provider);
			},
			registerDocumentSymbolProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider): vscode.Disposable {
				return languageFeatures.registerDocumentSymbolProvider(selector, provider);
			},
			registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
				return languageFeatures.registerWorkspaceSymbolProvider(provider);
			},
			registerDocumentFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
				return languageFeatures.registerDocumentFormattingEditProvider(selector, provider);
			},
			registerDocumentRangeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
				return languageFeatures.registerDocumentRangeFormattingEditProvider(selector, provider);
			},
			registerOnTypeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, firstTriggerCharacter: string, ...moreTriggerCharacters: string[]): vscode.Disposable {
				return languageFeatures.registerOnTypeFormattingEditProvider(selector, provider, [firstTriggerCharacter].concat(moreTriggerCharacters));
			},
			registerSignatureHelpProvider(selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, ...triggerCharacters: string[]): vscode.Disposable {
				return languageFeatures.registerSignatureHelpProvider(selector, provider, triggerCharacters);
			},
			registerCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, ...triggerCharacters: string[]): vscode.Disposable {
				return languageFeatures.registerCompletionItemProvider(selector, provider, triggerCharacters);
			},
			setLanguageConfiguration: (language: string, configuration: vscode.LanguageConfiguration):vscode.Disposable => {
				return this._setLanguageConfiguration(language, configuration);
			}
		};

		var extHostConfiguration = threadService.getRemotable(ExtHostConfiguration);

		//
		this.extensions = {
			getExtension(extensionId: string):Extension<any> {
				let desc = ExtensionsRegistry.getExtensionDescription(extensionId);
				if (desc) {
					return new Extension(<ExtHostExtensionService> extensionService, desc);
				}
			},
			get all():Extension<any>[] {
				return ExtensionsRegistry.getAllExtensionDescriptions().map((desc) => new Extension(<ExtHostExtensionService> extensionService, desc));
			}
		};

		// Intentionally calling a function for typechecking purposes
		defineAPI(this);
	}

	private _disposableFromToken(disposeToken:string): IDisposable {
		return new extHostTypes.Disposable(() => this._proxy.disposeByToken(disposeToken));
	}

	private _setLanguageConfiguration(modeId: string, configuration: vscode.LanguageConfiguration): vscode.Disposable {

		let {wordPattern} = configuration;

		// check for a valid word pattern
		if (wordPattern && regExpLeadsToEndlessLoop(wordPattern)) {
			throw new Error(`Invalid language configuration: wordPattern '${wordPattern}' is not allowed to match the empty string.`);
		}

		// word definition
		if (wordPattern) {
			setWordDefinitionFor(modeId, wordPattern);
		} else {
			setWordDefinitionFor(modeId, null);
		}

		return this.Modes_RichEditSupport_register(modeId, configuration);
	}

	private Modes_RichEditSupport_register(modeId: string, configuration:vscode.LanguageConfiguration): IDisposable {
		let disposeToken = ExtHostAPIImplementation.generateDisposeToken();
		this._proxy.Modes_RichEditSupport_register(disposeToken, modeId, configuration);
		return this._disposableFromToken(disposeToken);
	}
}

class Extension<T> implements vscode.Extension<T> {

	private _extensionService: ExtHostExtensionService;

	public id: string;
	public extensionPath: string;
	public packageJSON: any;

	constructor(extensionService:ExtHostExtensionService, description:IExtensionDescription) {
		this._extensionService = extensionService;
		this.id = description.id;
		this.extensionPath = paths.normalize(description.extensionFolderPath, true);
		this.packageJSON = description;
	}

	get isActive(): boolean {
		return this._extensionService.isActivated(this.id);
	}

	get exports(): T {
		return <T>this._extensionService.get(this.id);
	}

	activate(): Thenable<T> {
		return this._extensionService.activateById(this.id).then(() => this.exports);
	}
}

function defineAPI(impl: typeof vscode) {
	let node_module = <any>require.__$__nodeRequire('module');
	let original = node_module._load;
	node_module._load = function load(request, parent, isMain) {
		if (request === 'vscode') {
			return impl;
		}
		return original.apply(this, arguments);
	};
	define('vscode', [], impl);
}

@Remotable.MainContext('MainProcessVSCodeAPIHelper')
export class MainProcessVSCodeAPIHelper {
	protected _modeService: IModeService;
	private _token2Dispose: {
		[token:string]: IDisposable;
	};

	constructor(
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;
		this._token2Dispose = {};
	}

	public onUnexpectedExtHostError(err: any): void {
		errors.onUnexpectedError(err);
	}

	public disposeByToken(disposeToken:string): void {
		if (this._token2Dispose[disposeToken]) {
			this._token2Dispose[disposeToken].dispose();
			delete this._token2Dispose[disposeToken];
		}
	}

	public Modes_RichEditSupport_register(disposeToken:string, modeId: string, configuration:vscode.LanguageConfiguration): void {
		this._token2Dispose[disposeToken] = this._modeService.registerRichEditSupport(modeId, <any>configuration);
	}
}