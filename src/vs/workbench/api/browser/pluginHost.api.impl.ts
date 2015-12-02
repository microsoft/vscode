/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MainInplaceReplaceSupport, ReplaceSupport, IBracketElectricCharacterContribution} from 'vs/editor/common/modes/supports';
import {score} from 'vs/editor/common/modes/languageSelector';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import * as errors from 'vs/base/common/errors';
import {PluginHostFileSystemEventService} from 'vs/workbench/api/common/pluginHostFileSystemEventService';
import {PluginHostModelService, setWordDefinitionFor} from 'vs/workbench/api/common/pluginHostDocuments';
import {PluginHostConfiguration} from 'vs/workbench/api/common/pluginHostConfiguration';
import {PluginHostDiagnostics} from 'vs/workbench/api/common/pluginHostDiagnostics';
import {PluginHostWorkspace} from 'vs/workbench/api/browser/pluginHostWorkspace';
import {PluginHostQuickOpen} from 'vs/workbench/api/browser/pluginHostQuickOpen';
import {PluginHostStatusBar} from 'vs/workbench/api/browser/pluginHostStatusBar';
import {PluginHostCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {ExtHostOutputService} from 'vs/workbench/api/browser/extHostOutputService';
import {PluginHostMessageService} from 'vs/workbench/api/common/pluginHostMessageService';
import {PluginHostTelemetryService} from 'vs/workbench/api/common/pluginHostTelemetry';
import {PluginHostEditors} from 'vs/workbench/api/common/pluginHostEditors';
import {ExtHostLanguages} from 'vs/workbench/api/common/extHostLanguages';
import {ExtHostLanguageFeatures} from 'vs/workbench/api/common/extHostLanguageFeatures';
import {ExtHostLanguageFeatureCommands} from 'vs/workbench/api/common/extHostLanguageFeatureCommands';
import * as extHostTypes from 'vs/workbench/api/common/pluginHostTypes';
import 'vs/workbench/api/common/pluginHostTypes.marshalling';
import {wrapAsWinJSPromise} from 'vs/base/common/async';
import Modes = require('vs/editor/common/modes');
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IDeclarationContribution, ISuggestContribution, IReferenceContribution, ICommentsSupportContribution, ITokenTypeClassificationSupportContribution} from 'vs/editor/common/modes/supports';
import {IOnEnterSupportOptions} from 'vs/editor/common/modes/supports/onEnter';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import {IDisposable} from 'vs/base/common/lifecycle';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IPluginService, IPluginDescription} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import {relative} from 'path';
import {TPromise} from 'vs/base/common/winjs.base';
import * as TypeConverters from 'vs/workbench/api/common/pluginHostTypeConverters';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {CancellationTokenSource} from 'vs/base/common/cancellation';
import vscode = require('vscode');
import {TextEditorRevealType} from 'vs/workbench/api/common/mainThreadEditors';
import * as paths from 'vs/base/common/paths';

/**
 * This class implements the API described in vscode.d.ts,
 * for the case of the extensionHost host process
 */
export class PluginHostAPIImplementation {

	private static _LAST_REGISTER_TOKEN = 0;
	private static generateDisposeToken(): string {
		return String(++PluginHostAPIImplementation._LAST_REGISTER_TOKEN);
	}

	private _threadService: IThreadService;
	private _proxy: MainProcessVSCodeAPIHelper;
	private _pluginService: IPluginService;

	version: typeof vscode.version;
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
	IndentAction: typeof vscode.IndentAction;
	OverviewRulerLane: typeof vscode.OverviewRulerLane;
	TextEditorRevealType: typeof vscode.TextEditorRevealType;
	commands: typeof vscode.commands;
	window: typeof vscode.window;
	workspace: typeof vscode.workspace;
	languages: typeof vscode.languages;
	extensions: typeof vscode.extensions;

	constructor(
		@IThreadService threadService: IThreadService,
		@IPluginService pluginService: IPluginService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this._pluginService = pluginService;
		this._threadService = threadService;
		this._proxy = threadService.getRemotable(MainProcessVSCodeAPIHelper);

		this.version = contextService.getConfiguration().env.version;
		this.commands = this._threadService.getRemotable(PluginHostCommands);
		this.Uri = URI;
		this.Location = extHostTypes.Location;
		this.Diagnostic = <any> extHostTypes.Diagnostic;
		this.DiagnosticSeverity = <any> extHostTypes.DiagnosticSeverity;
		this.Disposable = extHostTypes.Disposable;
		this.TextEdit = extHostTypes.TextEdit;
		this.WorkspaceEdit = extHostTypes.WorkspaceEdit;
		this.Position = extHostTypes.Position;
		this.Range = extHostTypes.Range;
		this.Selection = extHostTypes.Selection;
		this.CancellationTokenSource = CancellationTokenSource;
		this.Hover = extHostTypes.Hover;
		this.SymbolKind = <any>extHostTypes.SymbolKind;
		this.SymbolInformation = <any>extHostTypes.SymbolInformation;
		this.DocumentHighlightKind = <any>extHostTypes.DocumentHighlightKind;
		this.DocumentHighlight = <any>extHostTypes.DocumentHighlight;
		this.CodeLens = extHostTypes.CodeLens;
		this.ParameterInformation = extHostTypes.ParameterInformation;
		this.SignatureInformation = extHostTypes.SignatureInformation;
		this.SignatureHelp = extHostTypes.SignatureHelp;
		this.CompletionItem = <any>extHostTypes.CompletionItem;
		this.CompletionItemKind = <any>extHostTypes.CompletionItemKind;
		this.ViewColumn = <any>extHostTypes.ViewColumn;
		this.StatusBarAlignment = <any>extHostTypes.StatusBarAlignment;
		this.IndentAction = <any>Modes.IndentAction;
		this.OverviewRulerLane = <any>EditorCommon.OverviewRulerLane;
		this.TextEditorRevealType = <any>TextEditorRevealType;

		errors.setUnexpectedErrorHandler((err) => {
			this._proxy.onUnexpectedPluginHostError(errors.transformErrorForSerialization(err));
		});

		const pluginHostEditors = this._threadService.getRemotable(PluginHostEditors);
		const pluginHostMessageService = new PluginHostMessageService(this._threadService, this.commands);
		const pluginHostQuickOpen = new PluginHostQuickOpen(this._threadService);
		const pluginHostStatusBar = new PluginHostStatusBar(this._threadService);
		const pluginHostTelemetryService = new PluginHostTelemetryService(threadService);
		const extHostOutputService = new ExtHostOutputService(this._threadService);
		this.window = {
			get activeTextEditor() {
				return pluginHostEditors.getActiveTextEditor();
			},
			get visibleTextEditors() {
				return pluginHostEditors.getVisibleTextEditors();
			},
			showTextDocument(document: vscode.TextDocument, column: vscode.ViewColumn): TPromise<vscode.TextEditor> {
				return pluginHostEditors.showTextDocument(document, column);
			},
			createTextEditorDecorationType(options:vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
				return pluginHostEditors.createTextEditorDecorationType(options);
			},
			onDidChangeActiveTextEditor: pluginHostEditors.onDidChangeActiveTextEditor.bind(pluginHostEditors),
			onDidChangeTextEditorSelection: (listener: (e: vscode.TextEditorSelectionChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return pluginHostEditors.onDidChangeTextEditorSelection(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorOptions: (listener: (e: vscode.TextEditorOptionsChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return pluginHostEditors.onDidChangeTextEditorOptions(listener, thisArgs, disposables);
			},
			showInformationMessage: (message, ...items) => {
				return pluginHostMessageService.showMessage(Severity.Info, message, items);
			},
			showWarningMessage: (message, ...items) => {
				return pluginHostMessageService.showMessage(Severity.Warning, message, items);
			},
			showErrorMessage: (message, ...items) => {
				return pluginHostMessageService.showMessage(Severity.Error, message, items);
			},
			showQuickPick: (items: any, options: vscode.QuickPickOptions) => {
				return pluginHostQuickOpen.show(items, options);
			},
			showInputBox: pluginHostQuickOpen.input.bind(pluginHostQuickOpen),

			createStatusBarItem(position?: vscode.StatusBarAlignment, priority?: number): vscode.StatusBarItem {
				return pluginHostStatusBar.createStatusBarEntry(<number>position, priority);
			},
			setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): vscode.Disposable {
				return pluginHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
			},
			createOutputChannel(name: string): vscode.OutputChannel {
				return extHostOutputService.createOutputChannel(name);
			}
		};

		//
		const workspacePath = contextService.getWorkspace() ? contextService.getWorkspace().resource.fsPath : undefined;
		const pluginHostFileSystemEvent = threadService.getRemotable(PluginHostFileSystemEventService);
		const pluginHostWorkspace = new PluginHostWorkspace(this._threadService, workspacePath);
		const pluginHostDocuments = this._threadService.getRemotable(PluginHostModelService);
		this.workspace = Object.freeze({
			get rootPath() {
				return pluginHostWorkspace.getPath();
			},
			set rootPath(value) {
				throw errors.readonly();
			},
			asRelativePath: (pathOrUri) => {
				return pluginHostWorkspace.getRelativePath(pathOrUri);
			},
			findFiles: (include, exclude, maxResults?) => {
				return pluginHostWorkspace.findFiles(include, exclude, maxResults);
			},
			saveAll: (includeUntitled?) => {
				return pluginHostWorkspace.saveAll(includeUntitled);
			},
			applyEdit(edit: vscode.WorkspaceEdit): TPromise<boolean> {
				return pluginHostWorkspace.appyEdit(edit);
			},
			createFileSystemWatcher: (pattern, ignoreCreate, ignoreChange, ignoreDelete): vscode.FileSystemWatcher => {
				return pluginHostFileSystemEvent.createFileSystemWatcher(pattern, ignoreCreate, ignoreChange, ignoreDelete);
			},
			get textDocuments() {
				return pluginHostDocuments.getDocuments();
			},
			set textDocuments(value) {
				throw errors.readonly();
			},
			// createTextDocument(text: string, fileName?: string, language?: string): Thenable<vscode.TextDocument> {
			// 	return pluginHostDocuments.createDocument(text, fileName, language);
			// },
			openTextDocument(uriOrFileName:vscode.Uri | string) {
				return pluginHostDocuments.openDocument(uriOrFileName);
			},
			onDidOpenTextDocument: (listener, thisArgs?, disposables?) => {
				return pluginHostDocuments.onDidAddDocument(listener, thisArgs, disposables);
			},
			onDidCloseTextDocument: (listener, thisArgs?, disposables?) => {
				return pluginHostDocuments.onDidRemoveDocument(listener, thisArgs, disposables);
			},
			onDidChangeTextDocument: (listener, thisArgs?, disposables?) => {
				return pluginHostDocuments.onDidChangeDocument(listener, thisArgs, disposables);
			},
			onDidSaveTextDocument: (listener, thisArgs?, disposables?) => {
				return pluginHostDocuments.onDidSaveDocument(listener, thisArgs, disposables);
			},
			onDidChangeConfiguration: (listener: () => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return pluginHostConfiguration.onDidChangeConfiguration(listener, thisArgs, disposables);
			},
			getConfiguration: (section?: string):vscode.WorkspaceConfiguration => {
				return pluginHostConfiguration.getConfiguration(section);
			}
		});

		//
		const languages = new ExtHostLanguages(this._threadService);
		const pluginHostDiagnostics = new PluginHostDiagnostics(this._threadService);
		const languageFeatures = threadService.getRemotable(ExtHostLanguageFeatures);
		const languageFeatureCommand = new ExtHostLanguageFeatureCommands(threadService.getRemotable(PluginHostCommands));

		this.languages = {
			createDiagnosticCollection(name?: string): vscode.DiagnosticCollection {
				return pluginHostDiagnostics.createDiagnosticCollection(name);
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

		var pluginHostConfiguration = threadService.getRemotable(PluginHostConfiguration);

		//
		this.extensions = {
			getExtension(extensionId: string):Extension<any> {
				let desc = PluginsRegistry.getPluginDescription(extensionId);
				if (desc) {
					return new Extension(pluginService, desc);
				}
			},
			get all():Extension<any>[] {
				return PluginsRegistry.getAllPluginDescriptions().map((desc) => new Extension(pluginService, desc));
			}
			// getTelemetryInfo: pluginHostTelemetryService.getTelemetryInfo.bind(pluginHostTelemetryService)
		}

		// Intentionally calling a function for typechecking purposes
		defineAPI(this);
	}

	private _disposableFromToken(disposeToken:string): IDisposable {
		return new extHostTypes.Disposable(() => this._proxy.disposeByToken(disposeToken));
	}

	private _setLanguageConfiguration(modeId: string, configuration: vscode.LanguageConfiguration): vscode.Disposable {

		let disposables: IDisposable[] = [];
		let {comments, wordPattern} = configuration;

		// comment configuration
		if (comments) {
			let lineCommentToken = comments.lineComment;

			let contrib: ICommentsSupportContribution = { commentsConfiguration: {} };
			if (comments.lineComment) {
				contrib.commentsConfiguration.lineCommentTokens = [comments.lineComment];
			}
			if (comments.blockComment) {
				let [blockStart, blockEnd] = comments.blockComment;
				contrib.commentsConfiguration.blockCommentStartToken = blockStart;
				contrib.commentsConfiguration.blockCommentEndToken = blockEnd;
			}
			let d = this.Modes_CommentsSupport_register(modeId, contrib);
			disposables.push(d);
		}

		// word definition
		if (wordPattern) {
			setWordDefinitionFor(modeId, wordPattern);
			let d = this.Modes_TokenTypeClassificationSupport_register(modeId, {
				wordDefinition: wordPattern
			});
			disposables.push(d);

		} else {
			setWordDefinitionFor(modeId, null);
		}

		// on enter
		let onEnter: IOnEnterSupportOptions = {};
		let empty = true;
		let {brackets, indentationRules, onEnterRules} = configuration;

		if (brackets) {
			empty = false;
			onEnter.brackets = brackets.map(pair => {
				let [open, close] = pair;
				return { open, close };
			});
		}
		if (indentationRules) {
			empty = false;
			onEnter.indentationRules = indentationRules;
		}
		if (onEnterRules) {
			empty = false;
			onEnter.regExpRules = <any>onEnterRules;
		}

		if (!empty) {
			let d = this.Modes_OnEnterSupport_register(modeId, onEnter);
			disposables.push(d);
		}

		if (configuration.__electricCharacterSupport) {
			disposables.push(
				this.Modes_ElectricCharacterSupport_register(modeId, configuration.__electricCharacterSupport)
			);
		}

		if (configuration.__characterPairSupport) {
			disposables.push(
				this.Modes_CharacterPairSupport_register(modeId, configuration.__characterPairSupport)
			);
		}

		return extHostTypes.Disposable.from(...disposables);
	}

	private Modes_CommentsSupport_register(modeId: string, commentsSupport: ICommentsSupportContribution): IDisposable {
		let disposeToken = PluginHostAPIImplementation.generateDisposeToken();
		this._proxy.Modes_CommentsSupport_register(disposeToken, modeId, commentsSupport);
		return this._disposableFromToken(disposeToken);
	}

	private Modes_TokenTypeClassificationSupport_register(modeId: string, tokenTypeClassificationSupport:ITokenTypeClassificationSupportContribution): IDisposable {
		let disposeToken = PluginHostAPIImplementation.generateDisposeToken();
		this._proxy.Modes_TokenTypeClassificationSupport_register(disposeToken, modeId, tokenTypeClassificationSupport);
		return this._disposableFromToken(disposeToken);
	}

	private Modes_ElectricCharacterSupport_register(modeId: string, electricCharacterSupport:IBracketElectricCharacterContribution): IDisposable {
		let disposeToken = PluginHostAPIImplementation.generateDisposeToken();
		this._proxy.Modes_ElectricCharacterSupport_register(disposeToken, modeId, electricCharacterSupport);
		return this._disposableFromToken(disposeToken);
	}

	private Modes_CharacterPairSupport_register(modeId: string, characterPairSupport:Modes.ICharacterPairContribution): IDisposable {
		let disposeToken = PluginHostAPIImplementation.generateDisposeToken();
		this._proxy.Modes_CharacterPairSupport_register(disposeToken, modeId, characterPairSupport);
		return this._disposableFromToken(disposeToken);
	}

	private Modes_OnEnterSupport_register(modeId: string, opts: IOnEnterSupportOptions): IDisposable {
		let disposeToken = PluginHostAPIImplementation.generateDisposeToken();
		this._proxy.Modes_OnEnterSupport_register(disposeToken, modeId, opts);
		return this._disposableFromToken(disposeToken);
	}
}

class Extension<T> implements vscode.Extension<T> {

	private _pluginService: IPluginService;

	public id: string;
	public extensionPath: string;
	public packageJSON: any;

	constructor(pluginService:IPluginService, description:IPluginDescription) {
		this._pluginService = pluginService;
		this.id = description.id;
		this.extensionPath = paths.normalize(description.extensionFolderPath, true);
		this.packageJSON = description;
	}

	get isActive(): boolean {
		return this._pluginService.isActivated(this.id);
	}

	get exports(): T {
		return this._pluginService.get(this.id);
	}

	activate(): Thenable<T> {
		return this._pluginService.activateAndGet<T>(this.id);
	}
}

function defineAPI(impl: typeof vscode) {
	var node_module = <any>require.__$__nodeRequire('module');
	var original = node_module._load;
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

	public onUnexpectedPluginHostError(err: any): void {
		errors.onUnexpectedError(err);
	}

	public disposeByToken(disposeToken:string): void {
		if (this._token2Dispose[disposeToken]) {
			this._token2Dispose[disposeToken].dispose();
			delete this._token2Dispose[disposeToken];
		}
	}

	public Modes_CommentsSupport_register(disposeToken:string, modeId: string, commentsSupport: ICommentsSupportContribution): void {
		this._token2Dispose[disposeToken] = this._modeService.registerDeclarativeCommentsSupport(modeId, commentsSupport);
	}

	public Modes_TokenTypeClassificationSupport_register(disposeToken:string, modeId: string, tokenTypeClassificationSupport:ITokenTypeClassificationSupportContribution): void {
		this._token2Dispose[disposeToken] = this._modeService.registerDeclarativeTokenTypeClassificationSupport(modeId, tokenTypeClassificationSupport);
	}

	public Modes_ElectricCharacterSupport_register(disposeToken:string, modeId: string, electricCharacterSupport:IBracketElectricCharacterContribution): void {
		this._token2Dispose[disposeToken] = this._modeService.registerDeclarativeElectricCharacterSupport(modeId, electricCharacterSupport);
	}

	public Modes_CharacterPairSupport_register(disposeToken:string, modeId: string, characterPairSupport:Modes.ICharacterPairContribution): void {
		this._token2Dispose[disposeToken] = this._modeService.registerDeclarativeCharacterPairSupport(modeId, characterPairSupport);
	}

	public Modes_OnEnterSupport_register(disposeToken:string, modeId: string, opts:IOnEnterSupportOptions): void {
		this._token2Dispose[disposeToken] = this._modeService.registerDeclarativeOnEnterSupport(modeId, <any>opts);
	}
}