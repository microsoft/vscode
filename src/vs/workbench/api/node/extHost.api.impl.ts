/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Emitter, mapEvent } from 'vs/base/common/event';
import { TrieMap } from 'vs/base/common/map';
import { score } from 'vs/editor/common/modes/languageSelector';
import * as Platform from 'vs/base/common/platform';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import * as errors from 'vs/base/common/errors';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { ExtHostFileSystemEventService } from 'vs/workbench/api/node/extHostFileSystemEventService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { ExtHostDocumentSaveParticipant } from 'vs/workbench/api/node/extHostDocumentSaveParticipant';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ExtHostDiagnostics } from 'vs/workbench/api/node/extHostDiagnostics';
import { ExtHostTreeExplorers } from 'vs/workbench/api/node/extHostTreeExplorers';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostQuickOpen } from 'vs/workbench/api/node/extHostQuickOpen';
import { ExtHostProgress } from 'vs/workbench/api/node/extHostProgress';
import { ExtHostSCM } from 'vs/workbench/api/node/extHostSCM';
import { ExtHostHeapService } from 'vs/workbench/api/node/extHostHeapService';
import { ExtHostStatusBar } from 'vs/workbench/api/node/extHostStatusBar';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { ExtHostOutputService } from 'vs/workbench/api/node/extHostOutputService';
import { ExtHostTerminalService } from 'vs/workbench/api/node/extHostTerminalService';
import { ExtHostMessageService } from 'vs/workbench/api/node/extHostMessageService';
import { ExtHostEditors } from 'vs/workbench/api/node/extHostTextEditors';
import { ExtHostLanguages } from 'vs/workbench/api/node/extHostLanguages';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { ExtHostApiCommands } from 'vs/workbench/api/node/extHostApiCommands';
import { ExtHostTask } from 'vs/workbench/api/node/extHostTask';
import * as extHostTypes from 'vs/workbench/api/node/extHostTypes';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import EditorCommon = require('vs/editor/common/editorCommon');
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import * as vscode from 'vscode';
import * as paths from 'vs/base/common/paths';
import { realpath } from 'fs';
import { MainContext, ExtHostContext, InstanceCollection, IInitData } from './extHost.protocol';
import * as languageConfiguration from 'vs/editor/common/modes/languageConfiguration';

export interface IExtensionApiFactory {
	(extension: IExtensionDescription): typeof vscode;
}

function proposedApiFunction<T>(extension: IExtensionDescription, fn: T): T {
	if (extension.enableProposedApi) {
		return fn;
	} else {
		return <any>(() => {
			throw new Error(`${extension.id} cannot access proposed api`);
		});
	}
}

function proposed(extension: IExtensionDescription): Function {
	return (target: any, key: string, descriptor: any) => {
		let fnKey: string = null;
		let fn: Function = null;

		if (typeof descriptor.value === 'function') {
			fnKey = 'value';
			fn = descriptor.value;
		} else if (typeof descriptor.get === 'function') {
			fnKey = 'get';
			fn = descriptor.get;
		}

		if (!fn) {
			throw new Error('not supported');
		}

		if (extension.enableProposedApi) {
			return;
		}

		descriptor[fnKey] = () => {
			throw new Error(`${extension.id} cannot access proposed api`);
		};
	};
}

/**
 * This method instantiates and returns the extension API surface
 */
export function createApiFactory(
	initData: IInitData,
	threadService: IThreadService,
	extensionService: ExtHostExtensionService,
	contextService: IWorkspaceContextService,
	telemetryService: ITelemetryService
): IExtensionApiFactory {

	// Addressable instances
	const col = new InstanceCollection();
	const extHostHeapService = col.define(ExtHostContext.ExtHostHeapService).set<ExtHostHeapService>(new ExtHostHeapService());
	const extHostDocumentsAndEditors = col.define(ExtHostContext.ExtHostDocumentsAndEditors).set<ExtHostDocumentsAndEditors>(new ExtHostDocumentsAndEditors(threadService));
	const extHostDocuments = col.define(ExtHostContext.ExtHostDocuments).set<ExtHostDocuments>(new ExtHostDocuments(threadService, extHostDocumentsAndEditors));
	const extHostDocumentSaveParticipant = col.define(ExtHostContext.ExtHostDocumentSaveParticipant).set<ExtHostDocumentSaveParticipant>(new ExtHostDocumentSaveParticipant(extHostDocuments, threadService.get(MainContext.MainThreadWorkspace)));
	const extHostEditors = col.define(ExtHostContext.ExtHostEditors).set<ExtHostEditors>(new ExtHostEditors(threadService, extHostDocumentsAndEditors));
	const extHostCommands = col.define(ExtHostContext.ExtHostCommands).set<ExtHostCommands>(new ExtHostCommands(threadService, extHostHeapService));
	const extHostExplorers = col.define(ExtHostContext.ExtHostExplorers).set<ExtHostTreeExplorers>(new ExtHostTreeExplorers(threadService, extHostCommands));
	const extHostConfiguration = col.define(ExtHostContext.ExtHostConfiguration).set<ExtHostConfiguration>(new ExtHostConfiguration(threadService.get(MainContext.MainThreadConfiguration), initData.configuration));
	const extHostDiagnostics = col.define(ExtHostContext.ExtHostDiagnostics).set<ExtHostDiagnostics>(new ExtHostDiagnostics(threadService));
	const languageFeatures = col.define(ExtHostContext.ExtHostLanguageFeatures).set<ExtHostLanguageFeatures>(new ExtHostLanguageFeatures(threadService, extHostDocuments, extHostCommands, extHostHeapService, extHostDiagnostics));
	const extHostFileSystemEvent = col.define(ExtHostContext.ExtHostFileSystemEventService).set<ExtHostFileSystemEventService>(new ExtHostFileSystemEventService());
	const extHostQuickOpen = col.define(ExtHostContext.ExtHostQuickOpen).set<ExtHostQuickOpen>(new ExtHostQuickOpen(threadService));
	const extHostTerminalService = col.define(ExtHostContext.ExtHostTerminalService).set<ExtHostTerminalService>(new ExtHostTerminalService(threadService));
	const extHostSCM = col.define(ExtHostContext.ExtHostSCM).set<ExtHostSCM>(new ExtHostSCM(threadService, extHostCommands));
	const extHostTask = col.define(ExtHostContext.ExtHostTask).set<ExtHostTask>(new ExtHostTask(threadService));
	col.define(ExtHostContext.ExtHostExtensionService).set(extensionService);
	col.finish(false, threadService);

	// Other instances
	const extHostMessageService = new ExtHostMessageService(threadService);
	const extHostStatusBar = new ExtHostStatusBar(threadService);
	const extHostProgress = new ExtHostProgress(threadService.get(MainContext.MainThreadProgress));
	const extHostOutputService = new ExtHostOutputService(threadService);
	const workspacePath = contextService.hasWorkspace() ? contextService.getWorkspace().resource.fsPath : undefined;
	const extHostWorkspace = new ExtHostWorkspace(threadService, workspacePath);
	const extHostLanguages = new ExtHostLanguages(threadService);

	// Register API-ish commands
	ExtHostApiCommands.register(extHostCommands);

	return function (extension: IExtensionDescription): typeof vscode {

		if (extension.enableProposedApi && !extension.isBuiltin) {

			if (!initData.environment.enableProposedApi) {
				extension.enableProposedApi = false;
				console.warn('PROPOSED API is only available when developing an extension');

			} else {
				console.warn(`${extension.name} (${extension.id}) uses PROPOSED API which is subject to change and removal without notice`);
			}
		}

		class Commands {

			registerCommand<T>(id: string, command: <T>(...args: any[]) => T | Thenable<T>, thisArgs?: any): vscode.Disposable {
				return extHostCommands.registerCommand(id, command, thisArgs);
			}

			registerTextEditorCommand(id: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void, thisArg?: any): vscode.Disposable {
				return extHostCommands.registerCommand(id, (...args: any[]) => {
					let activeTextEditor = extHostEditors.getActiveTextEditor();
					if (!activeTextEditor) {
						console.warn('Cannot execute ' + id + ' because there is no active text editor.');
						return undefined;
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
			}

			@proposed(extension)
			registerDiffInformationCommand(id: string, callback: (diff: vscode.LineChange[], ...args: any[]) => any, thisArg?: any): vscode.Disposable {
				return extHostCommands.registerCommand(id, async (...args: any[]) => {
					let activeTextEditor = extHostEditors.getActiveTextEditor();
					if (!activeTextEditor) {
						console.warn('Cannot execute ' + id + ' because there is no active text editor.');
						return undefined;
					}

					const diff = await extHostEditors.getDiffInformation(activeTextEditor.id);
					callback.apply(thisArg, [diff, ...args]);
				});
			}

			executeCommand<T>(id: string, ...args: any[]): Thenable<T> {
				return extHostCommands.executeCommand(id, ...args);
			}

			getCommands(filterInternal: boolean = false): Thenable<string[]> {
				return extHostCommands.getCommands(filterInternal);
			}
		}

		// namespace: commands
		const commands: typeof vscode.commands = new Commands();

		// namespace: env
		const env: typeof vscode.env = Object.freeze({
			get machineId() { return initData.telemetryInfo.machineId; },
			get sessionId() { return initData.telemetryInfo.sessionId; },
			get language() { return Platform.language; },
			get appName() { return product.nameLong; }
		});

		// namespace: extensions
		const extensions: typeof vscode.extensions = {
			getExtension(extensionId: string): Extension<any> {
				let desc = extensionService.getExtensionDescription(extensionId);
				if (desc) {
					return new Extension(extensionService, desc);
				}
				return undefined;
			},
			get all(): Extension<any>[] {
				return extensionService.getAllExtensionDescriptions().map((desc) => new Extension(extensionService, desc));
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
			registerImplementationProvider(selector: vscode.DocumentSelector, provider: vscode.ImplementationProvider): vscode.Disposable {
				return languageFeatures.registerImplementationProvider(selector, provider);
			},
			registerTypeDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.TypeDefinitionProvider): vscode.Disposable {
				return languageFeatures.registerTypeDefinitionProvider(selector, provider);
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
			onDidChangeActiveTextEditor(listener, thisArg?, disposables?) {
				return extHostEditors.onDidChangeActiveTextEditor(listener, thisArg, disposables);
			},
			onDidChangeVisibleTextEditors(listener, thisArg, disposables) {
				return extHostEditors.onDidChangeVisibleTextEditors(listener, thisArg, disposables);
			},
			onDidChangeTextEditorSelection(listener: (e: vscode.TextEditorSelectionChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) {
				return extHostEditors.onDidChangeTextEditorSelection(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorOptions(listener: (e: vscode.TextEditorOptionsChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) {
				return extHostEditors.onDidChangeTextEditorOptions(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorViewColumn(listener, thisArg?, disposables?) {
				return extHostEditors.onDidChangeTextEditorViewColumn(listener, thisArg, disposables);
			},
			onDidCloseTerminal(listener, thisArg?, disposables?) {
				return extHostTerminalService.onDidCloseTerminal(listener, thisArg, disposables);
			},
			showInformationMessage(message, first, ...rest) {
				return extHostMessageService.showMessage(Severity.Info, message, first, rest);
			},
			showWarningMessage(message, first, ...rest) {
				return extHostMessageService.showMessage(Severity.Warning, message, first, rest);
			},
			showErrorMessage(message, first, ...rest) {
				return extHostMessageService.showMessage(Severity.Error, message, first, rest);
			},
			showQuickPick(items: any, options: vscode.QuickPickOptions, token?: vscode.CancellationToken) {
				return extHostQuickOpen.showQuickPick(items, options, token);
			},
			showInputBox(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken) {
				return extHostQuickOpen.showInput(options, token);
			},
			createStatusBarItem(position?: vscode.StatusBarAlignment, priority?: number): vscode.StatusBarItem {
				return extHostStatusBar.createStatusBarEntry(extension.id, <number>position, priority);
			},
			setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): vscode.Disposable {
				return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
			},
			withWindowProgress: proposedApiFunction(extension, <R>(title: string, task: (progress: vscode.Progress<string>, token: vscode.CancellationToken) => Thenable<R>): Thenable<R> => {
				return extHostProgress.withWindowProgress(extension, title, task);
			}),
			withScmProgress<R>(task: (progress: vscode.Progress<number>) => Thenable<R>) {
				return extHostProgress.withScmProgress(extension, task);
			},
			createOutputChannel(name: string): vscode.OutputChannel {
				return extHostOutputService.createOutputChannel(name);
			},
			createTerminal(nameOrOptions: vscode.TerminalOptions | string, shellPath?: string, shellArgs?: string[]): vscode.Terminal {
				if (typeof nameOrOptions === 'object') {
					return extHostTerminalService.createTerminalFromOptions(<vscode.TerminalOptions>nameOrOptions);
				}
				return extHostTerminalService.createTerminal(<string>nameOrOptions, shellPath, shellArgs);
			},
			// proposed API
			sampleFunction: proposedApiFunction(extension, () => {
				return extHostMessageService.showMessage(Severity.Info, 'Hello Proposed Api!', {}, []);
			}),
			registerTreeExplorerNodeProvider: proposedApiFunction(extension, (providerId: string, provider: vscode.TreeExplorerNodeProvider<any>) => {
				return extHostExplorers.registerTreeExplorerNodeProvider(providerId, provider);
			}),
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
			openTextDocument(uriOrFileNameOrOptions?: vscode.Uri | string | { language?: string; content?: string; }) {
				let uriPromise: TPromise<URI>;

				let options = uriOrFileNameOrOptions as { language?: string; content?: string; };
				if (!options || typeof options.language === 'string') {
					uriPromise = extHostDocuments.createDocumentData(options);
				} else if (typeof uriOrFileNameOrOptions === 'string') {
					uriPromise = TPromise.as(URI.file(uriOrFileNameOrOptions));
				} else if (uriOrFileNameOrOptions instanceof URI) {
					uriPromise = TPromise.as(<URI>uriOrFileNameOrOptions);
				} else {
					throw new Error('illegal argument - uriOrFileNameOrOptions');
				}

				return uriPromise.then(uri => {
					return extHostDocuments.ensureDocumentData(uri).then(() => {
						const data = extHostDocuments.getDocumentData(uri);
						return data && data.document;
					});
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
			},
			registerTaskProvider: proposedApiFunction(extension, (provider: vscode.TaskProvider) => {
				return extHostTask.registerTaskProvider(extension, provider);
			})
		};

		class SCM {

			get activeSourceControl() {
				return extHostSCM.activeProvider;
			}

			get onDidChangeActiveSourceControl() {
				return extHostSCM.onDidChangeActiveProvider;
			}

			get inputBox() {
				return extHostSCM.inputBox;
			}

			get onDidAcceptInputValue() {
				return mapEvent(extHostSCM.inputBox.onDidAccept, () => extHostSCM.inputBox);
			}

			createSourceControl(id: string, label: string) {
				telemetryService.publicLog('registerSCMProvider', {
					extensionId: extension.id,
					providerId: id,
					providerLabel: label
				});

				return extHostSCM.createSourceControl(id, label);
			}
		}

		// namespace: scm
		const scm: typeof vscode.scm = new SCM();

		return {
			version: pkg.version,
			// namespaces
			commands,
			env,
			extensions,
			languages,
			window,
			workspace,
			scm,
			// types
			CancellationTokenSource: CancellationTokenSource,
			CodeLens: extHostTypes.CodeLens,
			CompletionItem: extHostTypes.CompletionItem,
			CompletionItemKind: extHostTypes.CompletionItemKind,
			CompletionList: extHostTypes.CompletionList,
			Diagnostic: extHostTypes.Diagnostic,
			DiagnosticSeverity: extHostTypes.DiagnosticSeverity,
			Disposable: extHostTypes.Disposable,
			DocumentHighlight: extHostTypes.DocumentHighlight,
			DocumentHighlightKind: extHostTypes.DocumentHighlightKind,
			DocumentLink: extHostTypes.DocumentLink,
			EndOfLine: extHostTypes.EndOfLine,
			EventEmitter: Emitter,
			Hover: extHostTypes.Hover,
			IndentAction: languageConfiguration.IndentAction,
			Location: extHostTypes.Location,
			OverviewRulerLane: EditorCommon.OverviewRulerLane,
			ParameterInformation: extHostTypes.ParameterInformation,
			Position: extHostTypes.Position,
			Range: extHostTypes.Range,
			Selection: extHostTypes.Selection,
			SignatureHelp: extHostTypes.SignatureHelp,
			SignatureInformation: extHostTypes.SignatureInformation,
			SnippetString: extHostTypes.SnippetString,
			StatusBarAlignment: extHostTypes.StatusBarAlignment,
			SymbolInformation: extHostTypes.SymbolInformation,
			SymbolKind: extHostTypes.SymbolKind,
			TextDocumentSaveReason: extHostTypes.TextDocumentSaveReason,
			TextEdit: extHostTypes.TextEdit,
			TextEditorCursorStyle: EditorCommon.TextEditorCursorStyle,
			TextEditorLineNumbersStyle: extHostTypes.TextEditorLineNumbersStyle,
			TextEditorRevealType: extHostTypes.TextEditorRevealType,
			TextEditorSelectionChangeKind: extHostTypes.TextEditorSelectionChangeKind,
			Uri: URI,
			ViewColumn: extHostTypes.ViewColumn,
			WorkspaceEdit: extHostTypes.WorkspaceEdit,
			// functions
			FileLocationKind: extHostTypes.FileLocationKind,
			ApplyToKind: extHostTypes.ApplyToKind,
			RevealKind: extHostTypes.RevealKind,
			TaskGroup: extHostTypes.TaskGroup,
			ShellTask: extHostTypes.ShellTask,
			ProcessTask: extHostTypes.ProcessTask
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

export function initializeExtensionApi(extensionService: ExtHostExtensionService, apiFactory: IExtensionApiFactory): TPromise<void> {
	return createExtensionPathIndex(extensionService).then(trie => defineAPI(apiFactory, trie));
}

function createExtensionPathIndex(extensionService: ExtHostExtensionService): TPromise<TrieMap<IExtensionDescription>> {

	// create trie to enable fast 'filename -> extension id' look up
	const trie = new TrieMap<IExtensionDescription>(TrieMap.PathSplitter);
	const extensions = extensionService.getAllExtensionDescriptions().map(ext => {
		if (!ext.main) {
			return undefined;
		}
		return new TPromise((resolve, reject) => {
			realpath(ext.extensionFolderPath, (err, path) => {
				if (err) {
					reject(err);
				} else {
					trie.insert(path, ext);
					resolve(void 0);
				}
			});
		});
	});

	return TPromise.join(extensions).then(() => trie);
}

function defineAPI(factory: IExtensionApiFactory, extensionPaths: TrieMap<IExtensionDescription>): void {

	// each extension is meant to get its own api implementation
	const extApiImpl = new Map<string, typeof vscode>();
	let defaultApiImpl: typeof vscode;

	const node_module = <any>require.__$__nodeRequire('module');
	const original = node_module._load;
	node_module._load = function load(request, parent, isMain) {
		if (request !== 'vscode') {
			return original.apply(this, arguments);
		}

		// get extension id from filename and api for extension
		const ext = extensionPaths.findSubstr(parent.filename);
		if (ext) {
			let apiImpl = extApiImpl.get(ext.id);
			if (!apiImpl) {
				apiImpl = factory(ext);
				extApiImpl.set(ext.id, apiImpl);
			}
			return apiImpl;
		}

		// fall back to a default implementation
		if (!defaultApiImpl) {
			defaultApiImpl = factory(nullExtensionDescription);
		}
		return defaultApiImpl;
	};
}

const nullExtensionDescription: IExtensionDescription = {
	id: 'nullExtensionDescription',
	name: 'Null Extension Description',
	publisher: 'vscode',
	activationEvents: undefined,
	contributes: undefined,
	enableProposedApi: false,
	engines: undefined,
	extensionDependencies: undefined,
	extensionFolderPath: undefined,
	isBuiltin: false,
	main: undefined,
	version: undefined
};
