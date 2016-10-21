/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Emitter } from 'vs/base/common/event';
import { TrieMap } from 'vs/base/common/map';
import { score } from 'vs/editor/common/modes/languageSelector';
import * as Platform from 'vs/base/common/platform';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import * as errors from 'vs/base/common/errors';
import product from 'vs/platform/product';
import pkg from 'vs/platform/package';
import { ExtHostFileSystemEventService } from 'vs/workbench/api/node/extHostFileSystemEventService';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { ExtHostDocumentSaveParticipant } from 'vs/workbench/api/node/extHostDocumentSaveParticipant';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ExtHostDiagnostics } from 'vs/workbench/api/node/extHostDiagnostics';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostQuickOpen } from 'vs/workbench/api/node/extHostQuickOpen';
import { ExtHostHeapService } from 'vs/workbench/api/node/extHostHeapService';
import { ExtHostStatusBar } from 'vs/workbench/api/node/extHostStatusBar';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { ExtHostOutputService } from 'vs/workbench/api/node/extHostOutputService';
import { ExtHostTerminalService } from 'vs/workbench/api/node/extHostTerminalService';
import { ExtHostMessageService } from 'vs/workbench/api/node/extHostMessageService';
import { ExtHostEditors } from 'vs/workbench/api/node/extHostEditors';
import { ExtHostLanguages } from 'vs/workbench/api/node/extHostLanguages';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { ExtHostApiCommands } from 'vs/workbench/api/node/extHostApiCommands';
import * as extHostTypes from 'vs/workbench/api/node/extHostTypes';
import Modes = require('vs/editor/common/modes');
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import EditorCommon = require('vs/editor/common/editorCommon');
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import * as vscode from 'vscode';
import * as paths from 'vs/base/common/paths';
import { realpathSync } from 'fs';
import { ITelemetryService, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { MainContext, ExtHostContext, InstanceCollection } from './extHost.protocol';


export interface IExtensionApiFactory {
	(extension: IExtensionDescription): typeof vscode;
}

/**
 * This method instantiates and returns the extension API surface
 */
export function createApiFactory(threadService: IThreadService, extensionService: ExtHostExtensionService, contextService: IWorkspaceContextService, telemetryService: ITelemetryService): IExtensionApiFactory {



	// Addressable instances
	const col = new InstanceCollection();
	const extHostHeapService = col.define(ExtHostContext.ExtHostHeapService).set<ExtHostHeapService>(new ExtHostHeapService());
	const extHostDocuments = col.define(ExtHostContext.ExtHostDocuments).set<ExtHostDocuments>(new ExtHostDocuments(threadService));
	const extHostDocumentSaveParticipant = col.define(ExtHostContext.ExtHostDocumentSaveParticipant).set<ExtHostDocumentSaveParticipant>(new ExtHostDocumentSaveParticipant(extHostDocuments, threadService.get(MainContext.MainThreadWorkspace)));
	const extHostEditors = col.define(ExtHostContext.ExtHostEditors).set<ExtHostEditors>(new ExtHostEditors(threadService, extHostDocuments));
	const extHostCommands = col.define(ExtHostContext.ExtHostCommands).set<ExtHostCommands>(new ExtHostCommands(threadService, extHostEditors, extHostHeapService));
	const extHostConfiguration = col.define(ExtHostContext.ExtHostConfiguration).set<ExtHostConfiguration>(new ExtHostConfiguration(threadService.get(MainContext.MainThreadConfiguration)));
	const extHostDiagnostics = col.define(ExtHostContext.ExtHostDiagnostics).set<ExtHostDiagnostics>(new ExtHostDiagnostics(threadService));
	const languageFeatures = col.define(ExtHostContext.ExtHostLanguageFeatures).set<ExtHostLanguageFeatures>(new ExtHostLanguageFeatures(threadService, extHostDocuments, extHostCommands, extHostHeapService, extHostDiagnostics));
	const extHostFileSystemEvent = col.define(ExtHostContext.ExtHostFileSystemEventService).set<ExtHostFileSystemEventService>(new ExtHostFileSystemEventService());
	const extHostQuickOpen = col.define(ExtHostContext.ExtHostQuickOpen).set<ExtHostQuickOpen>(new ExtHostQuickOpen(threadService));
	const extHostTerminalService = col.define(ExtHostContext.ExtHostTerminalService).set<ExtHostTerminalService>(new ExtHostTerminalService(threadService));
	col.define(ExtHostContext.ExtHostExtensionService).set(extensionService);
	col.finish(false, threadService);

	// Other instances
	const extHostMessageService = new ExtHostMessageService(threadService);
	const extHostStatusBar = new ExtHostStatusBar(threadService);
	const extHostOutputService = new ExtHostOutputService(threadService);
	const workspacePath = contextService.getWorkspace() ? contextService.getWorkspace().resource.fsPath : undefined;
	const extHostWorkspace = new ExtHostWorkspace(threadService, workspacePath);
	const extHostLanguages = new ExtHostLanguages(threadService);

	// Error forwarding
	const mainThreadErrors = threadService.get(MainContext.MainThreadErrors);
	errors.setUnexpectedErrorHandler((err) => {
		mainThreadErrors.onUnexpectedExtHostError(errors.transformErrorForSerialization(err));
	});

	// Register API-ish commands
	ExtHostApiCommands.register(extHostCommands);

	// TODO@joh,alex - this is lifecycle critical
	// fetch and store telemetry info
	let telemetryInfo: ITelemetryInfo;
	telemetryService.getTelemetryInfo().then(info => telemetryInfo = info, errors.onUnexpectedError);

	return function (extension: IExtensionDescription): typeof vscode {

		// namespace: commands
		const commands: typeof vscode.commands = {
			registerCommand<T>(id: string, command: <T>(...args: any[]) => T | Thenable<T>, thisArgs?: any): vscode.Disposable {
				return extHostCommands.registerCommand(id, command, thisArgs);
			},
			registerTextEditorCommand(id: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void, thisArg?: any): vscode.Disposable {
				return extHostCommands.registerCommand(id, (...args: any[]) => {
					let activeTextEditor = extHostEditors.getActiveTextEditor();
					if (!activeTextEditor) {
						console.warn('Cannot execute ' + id + ' because there is no active text editor.');
						return;
					}

					return activeTextEditor.edit((edit: vscode.TextEditorEdit) => {
						args.unshift(activeTextEditor, edit);
						callback.apply(thisArg, args);

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

		// namespace: env
		const env: typeof vscode.env = Object.freeze({
			get machineId() { return telemetryInfo.machineId; },
			get sessionId() { return telemetryInfo.sessionId; },
			get language() { return Platform.language; },
			get appName() { return product.nameLong; }
		});

		// namespace: extensions
		const extensions: typeof vscode.extensions = {
			getExtension(extensionId: string): Extension<any> {
				let desc = ExtensionsRegistry.getExtensionDescription(extensionId);
				if (desc) {
					return new Extension(extensionService, desc);
				}
			},
			get all(): Extension<any>[] {
				return ExtensionsRegistry.getAllExtensionDescriptions().map((desc) => new Extension(extensionService, desc));
			}
		};

		// namespace: languages
		const languages: typeof vscode.languages = {
			createDiagnosticCollection(name?: string): vscode.DiagnosticCollection {
				return extHostDiagnostics.createDiagnosticCollection(name);
			},
			getLanguages(): TPromise<string[]> {
				return extHostLanguages.getLanguages();
			},
			match(selector: vscode.DocumentSelector, document: vscode.TextDocument): number {
				return score(selector, <any>document.uri, document.languageId);
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
			registerDocumentLinkProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentLinkProvider): vscode.Disposable {
				return languageFeatures.registerDocumentLinkProvider(selector, provider);
			},
			setLanguageConfiguration: (language: string, configuration: vscode.LanguageConfiguration): vscode.Disposable => {
				return languageFeatures.setLanguageConfiguration(language, configuration);
			}
		};

		// namespace: window
		const window: typeof vscode.window = {
			get activeTextEditor() {
				return extHostEditors.getActiveTextEditor();
			},
			get visibleTextEditors() {
				return extHostEditors.getVisibleTextEditors();
			},
			showTextDocument(document: vscode.TextDocument, column?: vscode.ViewColumn, preserveFocus?: boolean): TPromise<vscode.TextEditor> {
				return extHostEditors.showTextDocument(document, column, preserveFocus);
			},
			createTextEditorDecorationType(options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
				return extHostEditors.createTextEditorDecorationType(options);
			},
			onDidChangeActiveTextEditor: extHostEditors.onDidChangeActiveTextEditor.bind(extHostEditors),
			onDidChangeVisibleTextEditors(listener, thisArg, disposables) {
				return extHostEditors.onDidChangeVisibleTextEditors(listener, thisArg, disposables);
			},
			onDidChangeTextEditorSelection: (listener: (e: vscode.TextEditorSelectionChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return extHostEditors.onDidChangeTextEditorSelection(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorOptions: (listener: (e: vscode.TextEditorOptionsChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return extHostEditors.onDidChangeTextEditorOptions(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorViewColumn(listener, thisArg?, disposables?) {
				return extHostEditors.onDidChangeTextEditorViewColumn(listener, thisArg, disposables);
			},
			onDidCloseTerminal: extHostTerminalService.onDidCloseTerminal.bind(extHostTerminalService),
			showInformationMessage: (message, ...items) => {
				return extHostMessageService.showMessage(Severity.Info, message, items);
			},
			showWarningMessage: (message, ...items) => {
				return extHostMessageService.showMessage(Severity.Warning, message, items);
			},
			showErrorMessage: (message, ...items) => {
				return extHostMessageService.showMessage(Severity.Error, message, items);
			},
			showQuickPick: (items: any, options: vscode.QuickPickOptions, token?: vscode.CancellationToken) => {
				return extHostQuickOpen.showQuickPick(items, options, token);
			},
			showInputBox(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken) {
				return extHostQuickOpen.showInput(options, token);
			},
			createStatusBarItem(position?: vscode.StatusBarAlignment, priority?: number): vscode.StatusBarItem {
				return extHostStatusBar.createStatusBarEntry(<number>position, priority);
			},
			setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): vscode.Disposable {
				return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
			},
			createOutputChannel(name: string): vscode.OutputChannel {
				return extHostOutputService.createOutputChannel(name);
			},
			createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): vscode.Terminal {
				return extHostTerminalService.createTerminal(name, shellPath, shellArgs);
			}
		};

		// namespace: workspace
		const workspace: typeof vscode.workspace = {
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
			onWillSaveTextDocument: (listener, thisArgs?, disposables?) => {
				return extHostDocumentSaveParticipant.onWillSaveTextDocumentEvent(listener, thisArgs, disposables);
			},
			onDidChangeConfiguration: (listener: () => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return extHostConfiguration.onDidChangeConfiguration(listener, thisArgs, disposables);
			},
			getConfiguration: (section?: string): vscode.WorkspaceConfiguration => {
				return extHostConfiguration.getConfiguration(section);
			}
		};

		return {
			version: pkg.version,
			// namespaces
			commands,
			env,
			extensions,
			languages,
			window,
			workspace,
			// types
			Uri: URI,
			Location: extHostTypes.Location,
			Diagnostic: extHostTypes.Diagnostic,
			DiagnosticSeverity: extHostTypes.DiagnosticSeverity,
			EventEmitter: Emitter,
			Disposable: extHostTypes.Disposable,
			TextEdit: extHostTypes.TextEdit,
			WorkspaceEdit: extHostTypes.WorkspaceEdit,
			Position: extHostTypes.Position,
			Range: extHostTypes.Range,
			Selection: extHostTypes.Selection,
			CancellationTokenSource: CancellationTokenSource,
			Hover: extHostTypes.Hover,
			SymbolKind: extHostTypes.SymbolKind,
			SymbolInformation: extHostTypes.SymbolInformation,
			DocumentHighlightKind: extHostTypes.DocumentHighlightKind,
			DocumentHighlight: extHostTypes.DocumentHighlight,
			CodeLens: extHostTypes.CodeLens,
			ParameterInformation: extHostTypes.ParameterInformation,
			SignatureInformation: extHostTypes.SignatureInformation,
			SignatureHelp: extHostTypes.SignatureHelp,
			CompletionItem: extHostTypes.CompletionItem,
			CompletionItemKind: extHostTypes.CompletionItemKind,
			CompletionList: extHostTypes.CompletionList,
			DocumentLink: extHostTypes.DocumentLink,
			ViewColumn: extHostTypes.ViewColumn,
			StatusBarAlignment: extHostTypes.StatusBarAlignment,
			IndentAction: Modes.IndentAction,
			OverviewRulerLane: EditorCommon.OverviewRulerLane,
			TextEditorRevealType: extHostTypes.TextEditorRevealType,
			EndOfLine: extHostTypes.EndOfLine,
			TextEditorCursorStyle: EditorCommon.TextEditorCursorStyle,
			TextEditorLineNumbersStyle: extHostTypes.TextEditorLineNumbersStyle,
			TextEditorSelectionChangeKind: extHostTypes.TextEditorSelectionChangeKind,
			TextDocumentSaveReason: extHostTypes.TextDocumentSaveReason,
		};
	};
}

class Extension<T> implements vscode.Extension<T> {

	private _extensionService: ExtHostExtensionService;

	public id: string;
	public extensionPath: string;
	public packageJSON: any;

	constructor(extensionService: ExtHostExtensionService, description: IExtensionDescription) {
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

export function defineAPI(factory: IExtensionApiFactory, extensions: IExtensionDescription[]): void {

	// each extension is meant to get its own api implementation
	const extApiImpl: { [id: string]: typeof vscode } = Object.create(null);
	let defaultApiImpl: typeof vscode;

	// create trie to enable fast 'filename -> extension id' look up
	const trie = new TrieMap<IExtensionDescription>(TrieMap.PathSplitter);
	for (const ext of extensions) {
		if (ext.name) {
			const path = realpathSync(ext.extensionFolderPath);
			trie.insert(path, ext);
		}
	}

	const node_module = <any>require.__$__nodeRequire('module');
	const original = node_module._load;
	node_module._load = function load(request, parent, isMain) {
		if (request !== 'vscode') {
			return original.apply(this, arguments);
		}

		// get extension id from filename and api for extension
		const ext = trie.findSubstr(parent.filename);
		if (ext) {
			let apiImpl = extApiImpl[ext.id];
			if (!apiImpl) {
				apiImpl = extApiImpl[ext.id] = factory(ext);
			}
			return apiImpl;
		}

		// fall back to a default implementation
		if (!defaultApiImpl) {
			defaultApiImpl = factory(undefined);
		}
		return defaultApiImpl;
	};
}
