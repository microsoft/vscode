/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Emitter } from 'vs/base/common/event';
import { TernarySearchTree } from 'vs/base/common/map';
import { score } from 'vs/editor/common/modes/languageSelector';
import * as platform from 'vs/base/common/platform';
import * as errors from 'vs/base/common/errors';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { ExtHostFileSystemEventService } from 'vs/workbench/api/node/extHostFileSystemEventService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { ExtHostDocumentContentProvider } from 'vs/workbench/api/node/extHostDocumentContentProviders';
import { ExtHostDocumentSaveParticipant } from 'vs/workbench/api/node/extHostDocumentSaveParticipant';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ExtHostDiagnostics } from 'vs/workbench/api/node/extHostDiagnostics';
import { ExtHostTreeViews } from 'vs/workbench/api/node/extHostTreeViews';
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
import { ExtHostLanguageFeatures, ISchemeTransformer } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { ExtHostApiCommands } from 'vs/workbench/api/node/extHostApiCommands';
import { ExtHostTask } from 'vs/workbench/api/node/extHostTask';
import { ExtHostDebugService } from 'vs/workbench/api/node/extHostDebugService';
import { ExtHostWindow } from 'vs/workbench/api/node/extHostWindow';
import * as extHostTypes from 'vs/workbench/api/node/extHostTypes';
import { URI } from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import * as vscode from 'vscode';
import * as paths from 'vs/base/common/paths';
import * as files from 'vs/platform/files/common/files';
import { MainContext, ExtHostContext, IInitData, IMainContext } from './extHost.protocol';
import * as languageConfiguration from 'vs/editor/common/modes/languageConfiguration';
import { TextEditorCursorStyle } from 'vs/editor/common/config/editorOptions';
import { ProxyIdentifier } from 'vs/workbench/services/extensions/node/proxyIdentifier';
import { ExtHostDialogs } from 'vs/workbench/api/node/extHostDialogs';
import { ExtHostFileSystem } from 'vs/workbench/api/node/extHostFileSystem';
import { ExtHostDecorations } from 'vs/workbench/api/node/extHostDecorations';
import * as typeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import { ExtensionActivatedByAPI } from 'vs/workbench/api/node/extHostExtensionActivator';
import { OverviewRulerLane } from 'vs/editor/common/model';
import { ExtHostLogService } from 'vs/workbench/api/node/extHostLogService';
import { ExtHostWebviews } from 'vs/workbench/api/node/extHostWebview';
import { ExtHostComments } from './extHostComments';
import { ExtHostSearch } from './extHostSearch';
import { ExtHostUrls } from './extHostUrls';
import { localize } from 'vs/nls';

export interface IExtensionApiFactory {
	(extension: IExtensionDescription): typeof vscode;
}

export function checkProposedApiEnabled(extension: IExtensionDescription): void {
	if (!extension.enableProposedApi) {
		throwProposedApiError(extension);
	}
}

function throwProposedApiError(extension: IExtensionDescription): never {
	throw new Error(`[${extension.id}]: Proposed API is only available when running out of dev or with the following command line switch: --enable-proposed-api ${extension.id}`);
}

function proposedApiFunction<T>(extension: IExtensionDescription, fn: T): T {
	if (extension.enableProposedApi) {
		return fn;
	} else {
		return throwProposedApiError.bind(null, extension);
	}
}

/**
 * This method instantiates and returns the extension API surface
 */
export function createApiFactory(
	initData: IInitData,
	rpcProtocol: IMainContext,
	extHostWorkspace: ExtHostWorkspace,
	extHostConfiguration: ExtHostConfiguration,
	extensionService: ExtHostExtensionService,
	extHostLogService: ExtHostLogService
): IExtensionApiFactory {

	let schemeTransformer: ISchemeTransformer = null;

	// Addressable instances
	rpcProtocol.set(ExtHostContext.ExtHostLogService, extHostLogService);
	const extHostHeapService = rpcProtocol.set(ExtHostContext.ExtHostHeapService, new ExtHostHeapService());
	const extHostDecorations = rpcProtocol.set(ExtHostContext.ExtHostDecorations, new ExtHostDecorations(rpcProtocol));
	const extHostWebviews = rpcProtocol.set(ExtHostContext.ExtHostWebviews, new ExtHostWebviews(rpcProtocol));
	const extHostUrls = rpcProtocol.set(ExtHostContext.ExtHostUrls, new ExtHostUrls(rpcProtocol));
	const extHostDocumentsAndEditors = rpcProtocol.set(ExtHostContext.ExtHostDocumentsAndEditors, new ExtHostDocumentsAndEditors(rpcProtocol));
	const extHostDocuments = rpcProtocol.set(ExtHostContext.ExtHostDocuments, new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors));
	const extHostDocumentContentProviders = rpcProtocol.set(ExtHostContext.ExtHostDocumentContentProviders, new ExtHostDocumentContentProvider(rpcProtocol, extHostDocumentsAndEditors, extHostLogService));
	const extHostDocumentSaveParticipant = rpcProtocol.set(ExtHostContext.ExtHostDocumentSaveParticipant, new ExtHostDocumentSaveParticipant(extHostLogService, extHostDocuments, rpcProtocol.getProxy(MainContext.MainThreadTextEditors)));
	const extHostEditors = rpcProtocol.set(ExtHostContext.ExtHostEditors, new ExtHostEditors(rpcProtocol, extHostDocumentsAndEditors));
	const extHostCommands = rpcProtocol.set(ExtHostContext.ExtHostCommands, new ExtHostCommands(rpcProtocol, extHostHeapService, extHostLogService));
	const extHostTreeViews = rpcProtocol.set(ExtHostContext.ExtHostTreeViews, new ExtHostTreeViews(rpcProtocol.getProxy(MainContext.MainThreadTreeViews), extHostCommands, extHostLogService));
	rpcProtocol.set(ExtHostContext.ExtHostWorkspace, extHostWorkspace);
	rpcProtocol.set(ExtHostContext.ExtHostConfiguration, extHostConfiguration);
	const extHostDiagnostics = rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, new ExtHostDiagnostics(rpcProtocol));
	const extHostLanguageFeatures = rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, new ExtHostLanguageFeatures(rpcProtocol, schemeTransformer, extHostDocuments, extHostCommands, extHostHeapService, extHostDiagnostics, extHostLogService));
	const extHostFileSystem = rpcProtocol.set(ExtHostContext.ExtHostFileSystem, new ExtHostFileSystem(rpcProtocol, extHostLanguageFeatures));
	const extHostFileSystemEvent = rpcProtocol.set(ExtHostContext.ExtHostFileSystemEventService, new ExtHostFileSystemEventService(rpcProtocol, extHostDocumentsAndEditors));
	const extHostQuickOpen = rpcProtocol.set(ExtHostContext.ExtHostQuickOpen, new ExtHostQuickOpen(rpcProtocol, extHostWorkspace, extHostCommands));
	const extHostTerminalService = rpcProtocol.set(ExtHostContext.ExtHostTerminalService, new ExtHostTerminalService(rpcProtocol, extHostConfiguration, extHostLogService));
	const extHostDebugService = rpcProtocol.set(ExtHostContext.ExtHostDebugService, new ExtHostDebugService(rpcProtocol, extHostWorkspace, extensionService, extHostDocumentsAndEditors, extHostConfiguration, extHostTerminalService, extHostCommands));
	const extHostSCM = rpcProtocol.set(ExtHostContext.ExtHostSCM, new ExtHostSCM(rpcProtocol, extHostCommands, extHostLogService));
	const extHostSearch = rpcProtocol.set(ExtHostContext.ExtHostSearch, new ExtHostSearch(rpcProtocol, schemeTransformer));
	const extHostTask = rpcProtocol.set(ExtHostContext.ExtHostTask, new ExtHostTask(rpcProtocol, extHostWorkspace, extHostDocumentsAndEditors, extHostConfiguration));
	const extHostWindow = rpcProtocol.set(ExtHostContext.ExtHostWindow, new ExtHostWindow(rpcProtocol));
	rpcProtocol.set(ExtHostContext.ExtHostExtensionService, extensionService);
	const extHostProgress = rpcProtocol.set(ExtHostContext.ExtHostProgress, new ExtHostProgress(rpcProtocol.getProxy(MainContext.MainThreadProgress)));
	const exthostCommentProviders = rpcProtocol.set(ExtHostContext.ExtHostComments, new ExtHostComments(rpcProtocol, extHostCommands.converter, extHostDocuments));

	// Check that no named customers are missing
	const expected: ProxyIdentifier<any>[] = Object.keys(ExtHostContext).map((key) => (<any>ExtHostContext)[key]);
	rpcProtocol.assertRegistered(expected);

	// Other instances
	const extHostMessageService = new ExtHostMessageService(rpcProtocol);
	const extHostDialogs = new ExtHostDialogs(rpcProtocol);
	const extHostStatusBar = new ExtHostStatusBar(rpcProtocol);
	const extHostOutputService = new ExtHostOutputService(initData.logsLocation, rpcProtocol);
	const extHostLanguages = new ExtHostLanguages(rpcProtocol, extHostDocuments);

	// Register an output channel for exthost log
	extHostOutputService.createOutputChannelFromLogFile(localize('extensionsLog', "Extension Host"), extHostLogService.logFile);

	// Register API-ish commands
	ExtHostApiCommands.register(extHostCommands);

	return function (extension: IExtensionDescription): typeof vscode {

		// Check document selectors for being overly generic. Technically this isn't a problem but
		// in practice many extensions say they support `fooLang` but need fs-access to do so. Those
		// extension should specify then the `file`-scheme, e.g `{ scheme: 'fooLang', language: 'fooLang' }`
		// We only inform once, it is not a warning because we just want to raise awareness and because
		// we cannot say if the extension is doing it right or wrong...
		let checkSelector = (function () {
			let done = (!extension.isUnderDevelopment);
			function informOnce(selector: vscode.DocumentSelector) {
				if (!done) {
					console.info(`Extension '${extension.id}' uses a document selector without scheme. Learn more about this: https://go.microsoft.com/fwlink/?linkid=872305`);
					done = true;
				}
			}
			return function perform(selector: vscode.DocumentSelector): vscode.DocumentSelector {
				if (Array.isArray(selector)) {
					selector.forEach(perform);
				} else if (typeof selector === 'string') {
					informOnce(selector);
				} else {
					if (typeof selector.scheme === 'undefined') {
						informOnce(selector);
					}
					if (!extension.enableProposedApi && typeof selector.exclusive === 'boolean') {
						throwProposedApiError(extension);
					}
				}
				return selector;
			};
		})();

		// namespace: commands
		const commands: typeof vscode.commands = {
			registerCommand(id: string, command: <T>(...args: any[]) => T | Thenable<T>, thisArgs?: any): vscode.Disposable {
				return extHostCommands.registerCommand(true, id, command, thisArgs);
			},
			registerTextEditorCommand(id: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void, thisArg?: any): vscode.Disposable {
				return extHostCommands.registerCommand(true, id, (...args: any[]): any => {
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
						console.warn('An error occurred while running command ' + id, err);
					});
				});
			},
			registerDiffInformationCommand: proposedApiFunction(extension, (id: string, callback: (diff: vscode.LineChange[], ...args: any[]) => any, thisArg?: any): vscode.Disposable => {
				return extHostCommands.registerCommand(true, id, async (...args: any[]) => {
					let activeTextEditor = extHostEditors.getActiveTextEditor();
					if (!activeTextEditor) {
						console.warn('Cannot execute ' + id + ' because there is no active text editor.');
						return undefined;
					}

					const diff = await extHostEditors.getDiffInformation(activeTextEditor.id);
					callback.apply(thisArg, [diff, ...args]);
				});
			}),
			executeCommand<T>(id: string, ...args: any[]): Thenable<T> {
				return extHostCommands.executeCommand<T>(id, ...args);
			},
			getCommands(filterInternal: boolean = false): Thenable<string[]> {
				return extHostCommands.getCommands(filterInternal);
			}
		};

		// namespace: env
		const env: typeof vscode.env = Object.freeze({
			get machineId() { return initData.telemetryInfo.machineId; },
			get sessionId() { return initData.telemetryInfo.sessionId; },
			get language() { return platform.language; },
			get appName() { return product.nameLong; },
			get appRoot() { return initData.environment.appRoot.fsPath; },
			get logLevel() {
				checkProposedApiEnabled(extension);
				return extHostLogService.getLevel();
			},
			get onDidChangeLogLevel() {
				checkProposedApiEnabled(extension);
				return extHostLogService.onDidChangeLogLevel;
			}
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
			get onDidChangeDiagnostics() {
				return extHostDiagnostics.onDidChangeDiagnostics;
			},
			getDiagnostics: (resource?: vscode.Uri) => {
				return <any>extHostDiagnostics.getDiagnostics(resource);
			},
			getLanguages(): Thenable<string[]> {
				return extHostLanguages.getLanguages();
			},
			setTextDocumentLanguage(document: vscode.TextDocument, languageId: string): Thenable<vscode.TextDocument> {
				checkProposedApiEnabled(extension);
				return extHostLanguages.changeLanguage(document.uri, languageId);
			},
			match(selector: vscode.DocumentSelector, document: vscode.TextDocument): number {
				return score(typeConverters.LanguageSelector.from(selector), document.uri, document.languageId, true);
			},
			registerCodeActionsProvider(selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, metadata?: vscode.CodeActionProviderMetadata): vscode.Disposable {
				return extHostLanguageFeatures.registerCodeActionProvider(checkSelector(selector), provider, extension, metadata);
			},
			registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerCodeLensProvider(checkSelector(selector), provider);
			},
			registerDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDefinitionProvider(checkSelector(selector), provider);
			},
			registerImplementationProvider(selector: vscode.DocumentSelector, provider: vscode.ImplementationProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerImplementationProvider(checkSelector(selector), provider);
			},
			registerTypeDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.TypeDefinitionProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerTypeDefinitionProvider(checkSelector(selector), provider);
			},
			registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerHoverProvider(checkSelector(selector), provider, extension.id);
			},
			registerDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentHighlightProvider(checkSelector(selector), provider);
			},
			registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerReferenceProvider(checkSelector(selector), provider);
			},
			registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerRenameProvider(checkSelector(selector), provider);
			},
			registerDocumentSymbolProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentSymbolProvider(checkSelector(selector), provider, extension);
			},
			registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerWorkspaceSymbolProvider(provider);
			},
			registerDocumentFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentFormattingEditProvider(checkSelector(selector), provider);
			},
			registerDocumentRangeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentRangeFormattingEditProvider(checkSelector(selector), provider);
			},
			registerOnTypeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, firstTriggerCharacter: string, ...moreTriggerCharacters: string[]): vscode.Disposable {
				return extHostLanguageFeatures.registerOnTypeFormattingEditProvider(checkSelector(selector), provider, [firstTriggerCharacter].concat(moreTriggerCharacters));
			},
			registerSignatureHelpProvider(selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, ...triggerCharacters: string[]): vscode.Disposable {
				return extHostLanguageFeatures.registerSignatureHelpProvider(checkSelector(selector), provider, triggerCharacters);
			},
			registerCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, ...triggerCharacters: string[]): vscode.Disposable {
				return extHostLanguageFeatures.registerCompletionItemProvider(checkSelector(selector), provider, triggerCharacters);
			},
			registerDocumentLinkProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentLinkProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentLinkProvider(checkSelector(selector), provider);
			},
			registerColorProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentColorProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerColorProvider(checkSelector(selector), provider);
			},
			registerFoldingRangeProvider(selector: vscode.DocumentSelector, provider: vscode.FoldingRangeProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerFoldingRangeProvider(checkSelector(selector), provider);
			},
			setLanguageConfiguration: (language: string, configuration: vscode.LanguageConfiguration): vscode.Disposable => {
				return extHostLanguageFeatures.setLanguageConfiguration(language, configuration);
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
			get activeTerminal() {
				return proposedApiFunction(extension, extHostTerminalService.activeTerminal);
			},
			get terminals() {
				return extHostTerminalService.terminals;
			},
			showTextDocument(documentOrUri: vscode.TextDocument | vscode.Uri, columnOrOptions?: vscode.ViewColumn | vscode.TextDocumentShowOptions, preserveFocus?: boolean): Thenable<vscode.TextEditor> {
				let documentPromise: TPromise<vscode.TextDocument>;
				if (URI.isUri(documentOrUri)) {
					documentPromise = TPromise.wrap(workspace.openTextDocument(documentOrUri));
				} else {
					documentPromise = TPromise.wrap(<vscode.TextDocument>documentOrUri);
				}
				return documentPromise.then(document => {
					return extHostEditors.showTextDocument(document, columnOrOptions, preserveFocus);
				});
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
			onDidChangeTextEditorVisibleRanges(listener: (e: vscode.TextEditorVisibleRangesChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) {
				return extHostEditors.onDidChangeTextEditorVisibleRanges(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorViewColumn(listener, thisArg?, disposables?) {
				return extHostEditors.onDidChangeTextEditorViewColumn(listener, thisArg, disposables);
			},
			onDidCloseTerminal(listener, thisArg?, disposables?) {
				return extHostTerminalService.onDidCloseTerminal(listener, thisArg, disposables);
			},
			onDidOpenTerminal(listener, thisArg?, disposables?) {
				return extHostTerminalService.onDidOpenTerminal(listener, thisArg, disposables);
			},
			onDidChangeActiveTerminal: proposedApiFunction(extension, (listener, thisArg?, disposables?) => {
				return extHostTerminalService.onDidChangeActiveTerminal(listener, thisArg, disposables);
			}),
			get state() {
				return extHostWindow.state;
			},
			onDidChangeWindowState(listener, thisArg?, disposables?) {
				return extHostWindow.onDidChangeWindowState(listener, thisArg, disposables);
			},
			showInformationMessage(message, first, ...rest) {
				return extHostMessageService.showMessage(extension, Severity.Info, message, first, rest);
			},
			showWarningMessage(message, first, ...rest) {
				return extHostMessageService.showMessage(extension, Severity.Warning, message, first, rest);
			},
			showErrorMessage(message, first, ...rest) {
				return extHostMessageService.showMessage(extension, Severity.Error, message, first, rest);
			},
			showQuickPick(items: any, options: vscode.QuickPickOptions, token?: vscode.CancellationToken): any {
				return extHostQuickOpen.showQuickPick(items, options, token);
			},
			showWorkspaceFolderPick(options: vscode.WorkspaceFolderPickOptions) {
				return extHostQuickOpen.showWorkspaceFolderPick(options);
			},
			showInputBox(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken) {
				return extHostQuickOpen.showInput(options, token);
			},
			showOpenDialog(options) {
				return extHostDialogs.showOpenDialog(options);
			},
			showSaveDialog(options) {
				return extHostDialogs.showSaveDialog(options);
			},
			createStatusBarItem(position?: vscode.StatusBarAlignment, priority?: number): vscode.StatusBarItem {
				return extHostStatusBar.createStatusBarEntry(extension.id, <number>position, priority);
			},
			setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): vscode.Disposable {
				return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
			},
			withScmProgress<R>(task: (progress: vscode.Progress<number>) => Thenable<R>) {
				console.warn(`[Deprecation Warning] function 'withScmProgress' is deprecated and should no longer be used. Use 'withProgress' instead.`);
				return extHostProgress.withProgress(extension, { location: extHostTypes.ProgressLocation.SourceControl }, (progress, token) => task({ report(n: number) { /*noop*/ } }));
			},
			withProgress<R>(options: vscode.ProgressOptions, task: (progress: vscode.Progress<{ message?: string; worked?: number }>, token: vscode.CancellationToken) => Thenable<R>) {
				return extHostProgress.withProgress(extension, options, task);
			},
			createOutputChannel(name: string, push?: boolean): vscode.OutputChannel {
				return extHostOutputService.createOutputChannel(name, push);
			},
			createWebviewPanel(viewType: string, title: string, showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn, preserveFocus?: boolean }, options: vscode.WebviewPanelOptions & vscode.WebviewOptions): vscode.WebviewPanel {
				return extHostWebviews.createWebview(extension.extensionLocation, viewType, title, showOptions, options);
			},
			createTerminal(nameOrOptions: vscode.TerminalOptions | string, shellPath?: string, shellArgs?: string[]): vscode.Terminal {
				if (typeof nameOrOptions === 'object') {
					return extHostTerminalService.createTerminalFromOptions(<vscode.TerminalOptions>nameOrOptions);
				}
				return extHostTerminalService.createTerminal(<string>nameOrOptions, shellPath, shellArgs);
			},
			createTerminalRenderer: proposedApiFunction(extension, (name: string) => {
				return extHostTerminalService.createTerminalRenderer(name);
			}),
			registerTreeDataProvider(viewId: string, treeDataProvider: vscode.TreeDataProvider<any>): vscode.Disposable {
				return extHostTreeViews.registerTreeDataProvider(viewId, treeDataProvider);
			},
			createTreeView(viewId: string, options: { treeDataProvider: vscode.TreeDataProvider<any> }): vscode.TreeView<any> {
				return extHostTreeViews.createTreeView(viewId, options);
			},
			registerWebviewPanelSerializer: (viewType: string, serializer: vscode.WebviewPanelSerializer) => {
				return extHostWebviews.registerWebviewPanelSerializer(viewType, serializer);
			},
			// proposed API
			sampleFunction: proposedApiFunction(extension, () => {
				return extHostMessageService.showMessage(extension, Severity.Info, 'Hello Proposed Api!', {}, []);
			}),
			registerDecorationProvider: proposedApiFunction(extension, (provider: vscode.DecorationProvider) => {
				return extHostDecorations.registerDecorationProvider(provider, extension.id);
			}),
			registerUriHandler(handler: vscode.UriHandler) {
				return extHostUrls.registerUriHandler(extension.id, handler);
			},
			createQuickPick<T extends vscode.QuickPickItem>(): vscode.QuickPick<T> {
				return extHostQuickOpen.createQuickPick(extension.id);
			},
			createInputBox(): vscode.InputBox {
				return extHostQuickOpen.createInputBox(extension.id);
			},
		};

		// namespace: workspace
		const workspace: typeof vscode.workspace = {
			get rootPath() {
				return extHostWorkspace.getPath();
			},
			set rootPath(value) {
				throw errors.readonly();
			},
			getWorkspaceFolder(resource) {
				return extHostWorkspace.getWorkspaceFolder(resource);
			},
			get workspaceFolders() {
				return extHostWorkspace.getWorkspaceFolders();
			},
			get name() {
				return extHostWorkspace.name;
			},
			set name(value) {
				throw errors.readonly();
			},
			updateWorkspaceFolders: (index, deleteCount, ...workspaceFoldersToAdd) => {
				return extHostWorkspace.updateWorkspaceFolders(extension, index, deleteCount || 0, ...workspaceFoldersToAdd);
			},
			onDidChangeWorkspaceFolders: function (listener, thisArgs?, disposables?) {
				return extHostWorkspace.onDidChangeWorkspace(listener, thisArgs, disposables);
			},
			asRelativePath: (pathOrUri, includeWorkspace) => {
				return extHostWorkspace.getRelativePath(pathOrUri, includeWorkspace);
			},
			findFiles: (include, exclude, maxResults?, token?) => {
				return extHostWorkspace.findFiles(typeConverters.GlobPattern.from(include), typeConverters.GlobPattern.from(exclude), maxResults, extension.id, token);
			},
			findTextInFiles: (query: vscode.TextSearchQuery, optionsOrCallback, callbackOrToken?, token?: vscode.CancellationToken) => {
				let options: vscode.FindTextInFilesOptions;
				let callback: (result: vscode.TextSearchResult) => void;

				if (typeof optionsOrCallback === 'object') {
					options = optionsOrCallback;
					callback = callbackOrToken;
				} else {
					options = {};
					callback = optionsOrCallback;
					token = callbackOrToken;
				}

				return extHostWorkspace.findTextInFiles(query, options || {}, callback, extension.id, token);
			},
			saveAll: (includeUntitled?) => {
				return extHostWorkspace.saveAll(includeUntitled);
			},
			applyEdit(edit: vscode.WorkspaceEdit): Thenable<boolean> {
				return extHostEditors.applyWorkspaceEdit(edit);
			},
			createFileSystemWatcher: (pattern, ignoreCreate, ignoreChange, ignoreDelete): vscode.FileSystemWatcher => {
				return extHostFileSystemEvent.createFileSystemWatcher(typeConverters.GlobPattern.from(pattern), ignoreCreate, ignoreChange, ignoreDelete);
			},
			get textDocuments() {
				return extHostDocuments.getAllDocumentData().map(data => data.document);
			},
			set textDocuments(value) {
				throw errors.readonly();
			},
			openTextDocument(uriOrFileNameOrOptions?: vscode.Uri | string | { language?: string; content?: string; }) {
				let uriPromise: Thenable<URI>;

				let options = uriOrFileNameOrOptions as { language?: string; content?: string; };
				if (typeof uriOrFileNameOrOptions === 'string') {
					uriPromise = TPromise.as(URI.file(uriOrFileNameOrOptions));
				} else if (uriOrFileNameOrOptions instanceof URI) {
					uriPromise = TPromise.as(uriOrFileNameOrOptions);
				} else if (!options || typeof options === 'object') {
					uriPromise = extHostDocuments.createDocumentData(options);
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
				return extHostDocumentSaveParticipant.getOnWillSaveTextDocumentEvent(extension)(listener, thisArgs, disposables);
			},
			onDidChangeConfiguration: (listener: (_: any) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return extHostConfiguration.onDidChangeConfiguration(listener, thisArgs, disposables);
			},
			getConfiguration(section?: string, resource?: vscode.Uri): vscode.WorkspaceConfiguration {
				resource = arguments.length === 1 ? void 0 : resource;
				return extHostConfiguration.getConfiguration(section, resource, extension.id);
			},
			registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider) {
				return extHostDocumentContentProviders.registerTextDocumentContentProvider(scheme, provider);
			},
			registerTaskProvider: (type: string, provider: vscode.TaskProvider) => {
				return extHostTask.registerTaskProvider(extension, provider);
			},
			registerFileSystemProvider(scheme, provider, options) {
				return extHostFileSystem.registerFileSystemProvider(scheme, provider, options);
			},
			registerFileSearchProvider: proposedApiFunction(extension, (scheme, provider) => {
				return extHostSearch.registerFileSearchProvider(scheme, provider);
			}),
			registerSearchProvider: proposedApiFunction(extension, () => {
				// Temp for live share in Insiders
				return { dispose: () => { } };
			}),
			registerTextSearchProvider: proposedApiFunction(extension, (scheme, provider) => {
				return extHostSearch.registerTextSearchProvider(scheme, provider);
			}),
			registerFileIndexProvider: proposedApiFunction(extension, (scheme, provider) => {
				return extHostSearch.registerFileIndexProvider(scheme, provider);
			}),
			registerDocumentCommentProvider: proposedApiFunction(extension, (provider: vscode.DocumentCommentProvider) => {
				return exthostCommentProviders.registerDocumentCommentProvider(provider);
			}),
			registerWorkspaceCommentProvider: proposedApiFunction(extension, (provider: vscode.WorkspaceCommentProvider) => {
				return exthostCommentProviders.registerWorkspaceCommentProvider(provider);
			}),
			onDidRenameFile: proposedApiFunction(extension, (listener, thisArg?, disposables?) => {
				return extHostFileSystemEvent.onDidRenameFile(listener, thisArg, disposables);
			}),
			onWillRenameFile: proposedApiFunction(extension, (listener, thisArg?, disposables?) => {
				return extHostFileSystemEvent.getOnWillRenameFileEvent(extension)(listener, thisArg, disposables);
			})
		};

		// namespace: scm
		const scm: typeof vscode.scm = {
			get inputBox() {
				return extHostSCM.getLastInputBox(extension);
			},
			createSourceControl(id: string, label: string, rootUri?: vscode.Uri) {
				return extHostSCM.createSourceControl(extension, id, label, rootUri);
			}
		};

		// namespace: debug
		const debug: typeof vscode.debug = {
			get activeDebugSession() {
				return extHostDebugService.activeDebugSession;
			},
			get activeDebugConsole() {
				return extHostDebugService.activeDebugConsole;
			},
			get breakpoints() {
				return extHostDebugService.breakpoints;
			},
			onDidStartDebugSession(listener, thisArg?, disposables?) {
				return extHostDebugService.onDidStartDebugSession(listener, thisArg, disposables);
			},
			onDidTerminateDebugSession(listener, thisArg?, disposables?) {
				return extHostDebugService.onDidTerminateDebugSession(listener, thisArg, disposables);
			},
			onDidChangeActiveDebugSession(listener, thisArg?, disposables?) {
				return extHostDebugService.onDidChangeActiveDebugSession(listener, thisArg, disposables);
			},
			onDidReceiveDebugSessionCustomEvent(listener, thisArg?, disposables?) {
				return extHostDebugService.onDidReceiveDebugSessionCustomEvent(listener, thisArg, disposables);
			},
			onDidChangeBreakpoints(listener, thisArgs?, disposables?) {
				return extHostDebugService.onDidChangeBreakpoints(listener, thisArgs, disposables);
			},
			registerDebugConfigurationProvider(debugType: string, provider: vscode.DebugConfigurationProvider) {
				return extHostDebugService.registerDebugConfigurationProvider(debugType, provider);
			},
			startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration) {
				return extHostDebugService.startDebugging(folder, nameOrConfig);
			},
			addBreakpoints(breakpoints: vscode.Breakpoint[]) {
				return extHostDebugService.addBreakpoints(breakpoints);
			},
			removeBreakpoints(breakpoints: vscode.Breakpoint[]) {
				return extHostDebugService.removeBreakpoints(breakpoints);
			}
		};

		const tasks: typeof vscode.tasks = {
			registerTaskProvider: (type: string, provider: vscode.TaskProvider) => {
				return extHostTask.registerTaskProvider(extension, provider);
			},
			fetchTasks: (filter?: vscode.TaskFilter): Thenable<vscode.Task[]> => {
				return extHostTask.fetchTasks(filter);
			},
			executeTask: (task: vscode.Task): Thenable<vscode.TaskExecution> => {
				return extHostTask.executeTask(extension, task);
			},
			get taskExecutions(): vscode.TaskExecution[] {
				return extHostTask.taskExecutions;
			},
			onDidStartTask: (listeners, thisArgs?, disposables?) => {
				return extHostTask.onDidStartTask(listeners, thisArgs, disposables);
			},
			onDidEndTask: (listeners, thisArgs?, disposables?) => {
				return extHostTask.onDidEndTask(listeners, thisArgs, disposables);
			},
			onDidStartTaskProcess: (listeners, thisArgs?, disposables?) => {
				return extHostTask.onDidStartTaskProcess(listeners, thisArgs, disposables);
			},
			onDidEndTaskProcess: (listeners, thisArgs?, disposables?) => {
				return extHostTask.onDidEndTaskProcess(listeners, thisArgs, disposables);
			}
		};

		return <typeof vscode>{
			version: pkg.version,
			// namespaces
			commands,
			debug,
			env,
			extensions,
			languages,
			scm,
			tasks,
			window,
			workspace,
			// types
			Breakpoint: extHostTypes.Breakpoint,
			CancellationTokenSource: CancellationTokenSource,
			CodeAction: extHostTypes.CodeAction,
			CodeActionKind: extHostTypes.CodeActionKind,
			CodeActionTrigger: extHostTypes.CodeActionTrigger,
			CodeLens: extHostTypes.CodeLens,
			Color: extHostTypes.Color,
			ColorInformation: extHostTypes.ColorInformation,
			ColorPresentation: extHostTypes.ColorPresentation,
			CommentThreadCollapsibleState: extHostTypes.CommentThreadCollapsibleState,
			CompletionItem: extHostTypes.CompletionItem,
			CompletionItemKind: extHostTypes.CompletionItemKind,
			CompletionList: extHostTypes.CompletionList,
			CompletionTriggerKind: extHostTypes.CompletionTriggerKind,
			ConfigurationTarget: extHostTypes.ConfigurationTarget,
			DebugAdapterExecutable: extHostTypes.DebugAdapterExecutable,
			DebugAdapterServer: extHostTypes.DebugAdapterServer,
			DecorationRangeBehavior: extHostTypes.DecorationRangeBehavior,
			Diagnostic: extHostTypes.Diagnostic,
			DiagnosticRelatedInformation: extHostTypes.DiagnosticRelatedInformation,
			DiagnosticSeverity: extHostTypes.DiagnosticSeverity,
			DiagnosticTag: extHostTypes.DiagnosticTag,
			Disposable: extHostTypes.Disposable,
			DocumentHighlight: extHostTypes.DocumentHighlight,
			DocumentHighlightKind: extHostTypes.DocumentHighlightKind,
			DocumentLink: extHostTypes.DocumentLink,
			DocumentSymbol: extHostTypes.DocumentSymbol,
			EndOfLine: extHostTypes.EndOfLine,
			EventEmitter: Emitter,
			FileChangeType: extHostTypes.FileChangeType,
			FileSystemError: extHostTypes.FileSystemError,
			FileType: files.FileType,
			FoldingRange: extHostTypes.FoldingRange,
			FoldingRangeKind: extHostTypes.FoldingRangeKind,
			FunctionBreakpoint: extHostTypes.FunctionBreakpoint,
			Hover: extHostTypes.Hover,
			IndentAction: languageConfiguration.IndentAction,
			Location: extHostTypes.Location,
			LogLevel: extHostTypes.LogLevel,
			MarkdownString: extHostTypes.MarkdownString,
			OverviewRulerLane: OverviewRulerLane,
			ParameterInformation: extHostTypes.ParameterInformation,
			Position: extHostTypes.Position,
			ProcessExecution: extHostTypes.ProcessExecution,
			ProgressLocation: extHostTypes.ProgressLocation,
			QuickInputButtons: extHostTypes.QuickInputButtons,
			Range: extHostTypes.Range,
			RelativePattern: extHostTypes.RelativePattern,
			Selection: extHostTypes.Selection,
			ShellExecution: extHostTypes.ShellExecution,
			ShellQuoting: extHostTypes.ShellQuoting,
			SignatureHelpTriggerReason: extHostTypes.SignatureHelpTriggerReason,
			SignatureHelp: extHostTypes.SignatureHelp,
			SignatureInformation: extHostTypes.SignatureInformation,
			SnippetString: extHostTypes.SnippetString,
			SourceBreakpoint: extHostTypes.SourceBreakpoint,
			SourceControlInputBoxValidationType: extHostTypes.SourceControlInputBoxValidationType,
			StatusBarAlignment: extHostTypes.StatusBarAlignment,
			SymbolInformation: extHostTypes.SymbolInformation,
			SymbolKind: extHostTypes.SymbolKind,
			Task: extHostTypes.Task,
			TaskGroup: extHostTypes.TaskGroup,
			TaskPanelKind: extHostTypes.TaskPanelKind,
			TaskRevealKind: extHostTypes.TaskRevealKind,
			TaskScope: extHostTypes.TaskScope,
			TextDocumentSaveReason: extHostTypes.TextDocumentSaveReason,
			TextEdit: extHostTypes.TextEdit,
			TextEditorCursorStyle: TextEditorCursorStyle,
			TextEditorLineNumbersStyle: extHostTypes.TextEditorLineNumbersStyle,
			TextEditorRevealType: extHostTypes.TextEditorRevealType,
			TextEditorSelectionChangeKind: extHostTypes.TextEditorSelectionChangeKind,
			ThemeColor: extHostTypes.ThemeColor,
			ThemeIcon: extHostTypes.ThemeIcon,
			TreeItem: extHostTypes.TreeItem,
			TreeItemCollapsibleState: extHostTypes.TreeItemCollapsibleState,
			Uri: URI,
			ViewColumn: extHostTypes.ViewColumn,
			WorkspaceEdit: extHostTypes.WorkspaceEdit,
			// functions
		};
	};
}

/**
 * Returns the original fs path (using the original casing for the drive letter)
 */
export function originalFSPath(uri: URI): string {
	const result = uri.fsPath;
	if (/^[a-zA-Z]:/.test(result) && uri.path.charAt(1).toLowerCase() === result.charAt(0)) {
		// Restore original drive letter casing
		return uri.path.charAt(1) + result.substr(1);
	}
	return result;
}

class Extension<T> implements vscode.Extension<T> {

	private _extensionService: ExtHostExtensionService;

	public id: string;
	public extensionPath: string;
	public packageJSON: any;

	constructor(extensionService: ExtHostExtensionService, description: IExtensionDescription) {
		this._extensionService = extensionService;
		this.id = description.id;
		this.extensionPath = paths.normalize(originalFSPath(description.extensionLocation), true);
		this.packageJSON = description;
	}

	get isActive(): boolean {
		return this._extensionService.isActivated(this.id);
	}

	get exports(): T {
		return <T>this._extensionService.getExtensionExports(this.id);
	}

	activate(): Thenable<T> {
		return this._extensionService.activateByIdWithErrors(this.id, new ExtensionActivatedByAPI(false)).then(() => this.exports);
	}
}

export function initializeExtensionApi(extensionService: ExtHostExtensionService, apiFactory: IExtensionApiFactory): TPromise<void> {
	return extensionService.getExtensionPathIndex().then(trie => defineAPI(apiFactory, trie));
}

function defineAPI(factory: IExtensionApiFactory, extensionPaths: TernarySearchTree<IExtensionDescription>): void {

	// each extension is meant to get its own api implementation
	const extApiImpl = new Map<string, typeof vscode>();
	let defaultApiImpl: typeof vscode;

	const node_module = <any>require.__$__nodeRequire('module');
	const original = node_module._load;
	node_module._load = function load(request: string, parent: any, isMain: any) {
		if (request !== 'vscode') {
			return original.apply(this, arguments);
		}

		// get extension id from filename and api for extension
		const ext = extensionPaths.findSubstr(URI.file(parent.filename).fsPath);
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
			let extensionPathsPretty = '';
			extensionPaths.forEach((value, index) => extensionPathsPretty += `\t${index} -> ${value.id}\n`);
			console.warn(`Could not identify extension for 'vscode' require call from ${parent.filename}. These are the extension path mappings: \n${extensionPathsPretty}`);
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
	extensionLocation: undefined,
	isBuiltin: false,
	isUnderDevelopment: false,
	main: undefined,
	version: undefined
};
