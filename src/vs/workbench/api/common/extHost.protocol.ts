/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { SerializedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TextEditorCursorStyle, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ISingleEditOperation, EndOfLineSequence } from 'vs/editor/common/model';
import { IModelChangedEvent } from 'vs/editor/common/model/mirrorTextModel';
import * as modes from 'vs/editor/common/modes';
import { CharacterPair, CommentRule, EnterAction } from 'vs/editor/common/modes/languageConfiguration';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationData, IConfigurationModel } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import * as files from 'vs/platform/files/common/files';
import { ResourceLabelFormatter } from 'vs/platform/label/common/label';
import { LogLevel } from 'vs/platform/log/common/log';
import { IMarkerData } from 'vs/platform/markers/common/markers';
import * as quickInput from 'vs/platform/quickinput/common/quickInput';
import * as search from 'vs/workbench/services/search/common/search';
import * as statusbar from 'vs/platform/statusbar/common/statusbar';
import { ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { EditorViewColumn } from 'vs/workbench/api/common/shared/editor';
import * as tasks from 'vs/workbench/api/common/shared/tasks';
import { ITreeItem, IRevealOptions } from 'vs/workbench/common/views';
import { IAdapterDescriptor, IConfig, ITerminalSettings } from 'vs/workbench/contrib/debug/common/debug';
import { ITextQueryBuilderOptions } from 'vs/workbench/contrib/search/common/queryBuilder';
import { ITerminalDimensions } from 'vs/workbench/contrib/terminal/common/terminal';
import { ExtensionActivationError } from 'vs/workbench/services/extensions/common/extensions';
import { IRPCProtocol, createExtHostContextProxyIdentifier as createExtId, createMainContextProxyIdentifier as createMainId } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { IProgressOptions, IProgressStep } from 'vs/platform/progress/common/progress';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ResolvedAuthority, RemoteAuthorityResolverErrorCode } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as codeInset from 'vs/workbench/contrib/codeinset/common/codeInset';
import * as callHierarchy from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { IRelativePattern } from 'vs/base/common/glob';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { VSBuffer } from 'vs/base/common/buffer';

export interface IEnvironment {
	isExtensionDevelopmentDebug: boolean;
	appName: string;
	appRoot?: URI;
	appLanguage: string;
	appUriScheme: string;
	appSettingsHome?: URI;
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsLocationURI?: URI;
	globalStorageHome: URI;
	userHome: URI;
}

export interface IStaticWorkspaceData {
	id: string;
	name: string;
	configuration?: UriComponents | null;
	isUntitled?: boolean | null;
}

export interface IWorkspaceData extends IStaticWorkspaceData {
	folders: { uri: UriComponents, name: string, index: number }[];
}

export interface IInitData {
	version: string;
	commit?: string;
	parentPid: number;
	environment: IEnvironment;
	workspace?: IStaticWorkspaceData | null;
	resolvedExtensions: ExtensionIdentifier[];
	hostExtensions: ExtensionIdentifier[];
	extensions: IExtensionDescription[];
	telemetryInfo: ITelemetryInfo;
	logLevel: LogLevel;
	logsLocation: URI;
	autoStart: boolean;
	remoteAuthority?: string | null;
}

export interface IConfigurationInitData extends IConfigurationData {
	configurationScopes: { [key: string]: ConfigurationScope };
}

export interface IWorkspaceConfigurationChangeEventData {
	changedConfiguration: IConfigurationModel;
	changedConfigurationByResource: { [folder: string]: IConfigurationModel };
}

export interface IExtHostContext extends IRPCProtocol {
	remoteAuthority: string;
}

export interface IMainContext extends IRPCProtocol {
}

// --- main thread

export interface MainThreadClipboardShape extends IDisposable {
	$readText(): Promise<string>;
	$writeText(value: string): Promise<void>;
}

export interface MainThreadCommandsShape extends IDisposable {
	$registerCommand(id: string): void;
	$unregisterCommand(id: string): void;
	$executeCommand<T>(id: string, args: any[]): Promise<T | undefined>;
	$getCommands(): Promise<string[]>;
}

export interface CommentThreadTemplate {
	label: string;
	acceptInputCommand?: modes.Command;
	additionalCommands?: modes.Command[];
	deleteCommand?: modes.Command;
}

export interface CommentProviderFeatures {
	startDraftLabel?: string;
	deleteDraftLabel?: string;
	finishDraftLabel?: string;
	reactionGroup?: modes.CommentReaction[];
	commentThreadTemplate?: CommentThreadTemplate;
}

export interface MainThreadCommentsShape extends IDisposable {
	$registerCommentController(handle: number, id: string, label: string): void;
	$unregisterCommentController(handle: number): void;
	$updateCommentControllerFeatures(handle: number, features: CommentProviderFeatures): void;
	$createCommentThread(handle: number, commentThreadHandle: number, threadId: string, resource: UriComponents, range: IRange): modes.CommentThread2 | undefined;
	$updateCommentThread(handle: number, commentThreadHandle: number, threadId: string, resource: UriComponents, range: IRange, label: string, contextValue: string | undefined, comments: modes.Comment[], acceptInputCommand: modes.Command | undefined, additionalCommands: modes.Command[], deleteCommand: modes.Command | undefined, collapseState: modes.CommentThreadCollapsibleState): void;
	$deleteCommentThread(handle: number, commentThreadHandle: number): void;
	$setInputValue(handle: number, input: string): void;
	$registerDocumentCommentProvider(handle: number, features: CommentProviderFeatures): void;
	$unregisterDocumentCommentProvider(handle: number): void;
	$registerWorkspaceCommentProvider(handle: number, extensionId: ExtensionIdentifier): void;
	$unregisterWorkspaceCommentProvider(handle: number): void;
	$onDidCommentThreadsChange(handle: number, event: modes.CommentThreadChangedEvent): void;
}

export interface MainThreadConfigurationShape extends IDisposable {
	$updateConfigurationOption(target: ConfigurationTarget | null, key: string, value: any, resource: UriComponents | undefined): Promise<void>;
	$removeConfigurationOption(target: ConfigurationTarget | null, key: string, resource: UriComponents | undefined): Promise<void>;
}

export interface MainThreadDiagnosticsShape extends IDisposable {
	$changeMany(owner: string, entries: [UriComponents, IMarkerData[] | undefined][]): void;
	$clear(owner: string): void;
}

export interface MainThreadDialogOpenOptions {
	defaultUri?: UriComponents;
	openLabel?: string;
	canSelectFiles?: boolean;
	canSelectFolders?: boolean;
	canSelectMany?: boolean;
	filters?: { [name: string]: string[] };
}

export interface MainThreadDialogSaveOptions {
	defaultUri?: UriComponents;
	saveLabel?: string;
	filters?: { [name: string]: string[] };
}

export interface MainThreadDiaglogsShape extends IDisposable {
	$showOpenDialog(options: MainThreadDialogOpenOptions): Promise<UriComponents[] | undefined>;
	$showSaveDialog(options: MainThreadDialogSaveOptions): Promise<UriComponents | undefined>;
}

export interface MainThreadDecorationsShape extends IDisposable {
	$registerDecorationProvider(handle: number, label: string): void;
	$unregisterDecorationProvider(handle: number): void;
	$onDidChange(handle: number, resources: UriComponents[] | null): void;
}

export interface MainThreadDocumentContentProvidersShape extends IDisposable {
	$registerTextContentProvider(handle: number, scheme: string): void;
	$unregisterTextContentProvider(handle: number): void;
	$onVirtualDocumentChange(uri: UriComponents, value: string): void;
}

export interface MainThreadDocumentsShape extends IDisposable {
	$tryCreateDocument(options?: { language?: string; content?: string; }): Promise<UriComponents>;
	$tryOpenDocument(uri: UriComponents): Promise<void>;
	$trySaveDocument(uri: UriComponents): Promise<boolean>;
}

export interface ITextEditorConfigurationUpdate {
	tabSize?: number | 'auto';
	indentSize?: number | 'tabSize';
	insertSpaces?: boolean | 'auto';
	cursorStyle?: TextEditorCursorStyle;
	lineNumbers?: RenderLineNumbersType;
}

export interface IResolvedTextEditorConfiguration {
	tabSize: number;
	indentSize: number;
	insertSpaces: boolean;
	cursorStyle: TextEditorCursorStyle;
	lineNumbers: RenderLineNumbersType;
}

export enum TextEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export interface IUndoStopOptions {
	undoStopBefore: boolean;
	undoStopAfter: boolean;
}

export interface IApplyEditsOptions extends IUndoStopOptions {
	setEndOfLine?: EndOfLineSequence;
}

export interface ITextDocumentShowOptions {
	position?: EditorViewColumn;
	preserveFocus?: boolean;
	pinned?: boolean;
	selection?: IRange;
}

export interface MainThreadTextEditorsShape extends IDisposable {
	$tryShowTextDocument(resource: UriComponents, options: ITextDocumentShowOptions): Promise<string | undefined>;
	$registerTextEditorDecorationType(key: string, options: editorCommon.IDecorationRenderOptions): void;
	$removeTextEditorDecorationType(key: string): void;
	$tryShowEditor(id: string, position: EditorViewColumn): Promise<void>;
	$tryHideEditor(id: string): Promise<void>;
	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): Promise<void>;
	$trySetDecorations(id: string, key: string, ranges: editorCommon.IDecorationOptions[]): Promise<void>;
	$trySetDecorationsFast(id: string, key: string, ranges: number[]): Promise<void>;
	$tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): Promise<void>;
	$trySetSelections(id: string, selections: ISelection[]): Promise<void>;
	$tryApplyEdits(id: string, modelVersionId: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): Promise<boolean>;
	$tryApplyWorkspaceEdit(workspaceEditDto: WorkspaceEditDto): Promise<boolean>;
	$tryInsertSnippet(id: string, template: string, selections: IRange[], opts: IUndoStopOptions): Promise<boolean>;
	$getDiffInformation(id: string): Promise<editorCommon.ILineChange[]>;
}

export interface MainThreadTreeViewsShape extends IDisposable {
	$registerTreeViewDataProvider(treeViewId: string, options: { showCollapseAll: boolean }): void;
	$refresh(treeViewId: string, itemsToRefresh?: { [treeItemHandle: string]: ITreeItem }): Promise<void>;
	$reveal(treeViewId: string, treeItem: ITreeItem, parentChain: ITreeItem[], options: IRevealOptions): Promise<void>;
	$setMessage(treeViewId: string, message: string | IMarkdownString): void;
}

export interface MainThreadErrorsShape extends IDisposable {
	$onUnexpectedError(err: any | SerializedError): void;
}

export interface MainThreadConsoleShape extends IDisposable {
	$logExtensionHostMessage(msg: IRemoteConsoleLog): void;
}

export interface MainThreadKeytarShape extends IDisposable {
	$getPassword(service: string, account: string): Promise<string | null>;
	$setPassword(service: string, account: string, password: string): Promise<void>;
	$deletePassword(service: string, account: string): Promise<boolean>;
	$findPassword(service: string): Promise<string | null>;
}

export interface ISerializedRegExp {
	pattern: string;
	flags?: string;
}
export interface ISerializedIndentationRule {
	decreaseIndentPattern: ISerializedRegExp;
	increaseIndentPattern: ISerializedRegExp;
	indentNextLinePattern?: ISerializedRegExp;
	unIndentedLinePattern?: ISerializedRegExp;
}
export interface ISerializedOnEnterRule {
	beforeText: ISerializedRegExp;
	afterText?: ISerializedRegExp;
	oneLineAboveText?: ISerializedRegExp;
	action: EnterAction;
}
export interface ISerializedLanguageConfiguration {
	comments?: CommentRule;
	brackets?: CharacterPair[];
	wordPattern?: ISerializedRegExp;
	indentationRules?: ISerializedIndentationRule;
	onEnterRules?: ISerializedOnEnterRule[];
	__electricCharacterSupport?: {
		brackets?: any;
		docComment?: {
			scope: string;
			open: string;
			lineStart: string;
			close?: string;
		};
	};
	__characterPairSupport?: {
		autoClosingPairs: {
			open: string;
			close: string;
			notIn?: string[];
		}[];
	};
}

export type GlobPattern = string | { base: string; pattern: string };

export interface ISerializedDocumentFilter {
	$serialized: true;
	language?: string;
	scheme?: string;
	pattern?: string | IRelativePattern;
	exclusive?: boolean;
}

export interface ISerializedSignatureHelpProviderMetadata {
	readonly triggerCharacters: readonly string[];
	readonly retriggerCharacters: readonly string[];
}

export interface MainThreadLanguageFeaturesShape extends IDisposable {
	$unregister(handle: number): void;
	$registerDocumentSymbolProvider(handle: number, selector: ISerializedDocumentFilter[], label: string): void;
	$registerCodeLensSupport(handle: number, selector: ISerializedDocumentFilter[], eventHandle: number | undefined): void;
	$registerCodeInsetSupport(handle: number, selector: ISerializedDocumentFilter[], eventHandle: number | undefined): void;
	$emitCodeLensEvent(eventHandle: number, event?: any): void;
	$registerDefinitionSupport(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerDeclarationSupport(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerImplementationSupport(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerTypeDefinitionSupport(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerHoverProvider(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerDocumentHighlightProvider(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerReferenceSupport(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerQuickFixSupport(handle: number, selector: ISerializedDocumentFilter[], supportedKinds?: string[]): void;
	$registerDocumentFormattingSupport(handle: number, selector: ISerializedDocumentFilter[], extensionId: ExtensionIdentifier, displayName: string): void;
	$registerRangeFormattingSupport(handle: number, selector: ISerializedDocumentFilter[], extensionId: ExtensionIdentifier, displayName: string): void;
	$registerOnTypeFormattingSupport(handle: number, selector: ISerializedDocumentFilter[], autoFormatTriggerCharacters: string[], extensionId: ExtensionIdentifier): void;
	$registerNavigateTypeSupport(handle: number): void;
	$registerRenameSupport(handle: number, selector: ISerializedDocumentFilter[], supportsResolveInitialValues: boolean): void;
	$registerSuggestSupport(handle: number, selector: ISerializedDocumentFilter[], triggerCharacters: string[], supportsResolveDetails: boolean): void;
	$registerSignatureHelpProvider(handle: number, selector: ISerializedDocumentFilter[], metadata: ISerializedSignatureHelpProviderMetadata): void;
	$registerDocumentLinkProvider(handle: number, selector: ISerializedDocumentFilter[], supportsResolve: boolean): void;
	$registerDocumentColorProvider(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerFoldingRangeProvider(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerSelectionRangeProvider(handle: number, selector: ISerializedDocumentFilter[]): void;
	$registerCallHierarchyProvider(handle: number, selector: ISerializedDocumentFilter[]): void;
	$setLanguageConfiguration(handle: number, languageId: string, configuration: ISerializedLanguageConfiguration): void;
}

export interface MainThreadLanguagesShape extends IDisposable {
	$getLanguages(): Promise<string[]>;
	$changeLanguage(resource: UriComponents, languageId: string): Promise<void>;
}

export interface MainThreadMessageOptions {
	extension?: IExtensionDescription;
	modal?: boolean;
}

export interface MainThreadMessageServiceShape extends IDisposable {
	$showMessage(severity: Severity, message: string, options: MainThreadMessageOptions, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Promise<number | undefined>;
}

export interface MainThreadOutputServiceShape extends IDisposable {
	$register(label: string, log: boolean, file?: UriComponents): Promise<string>;
	$append(channelId: string, value: string): Promise<void> | undefined;
	$update(channelId: string): Promise<void> | undefined;
	$clear(channelId: string, till: number): Promise<void> | undefined;
	$reveal(channelId: string, preserveFocus: boolean): Promise<void> | undefined;
	$close(channelId: string): Promise<void> | undefined;
	$dispose(channelId: string): Promise<void> | undefined;
}

export interface MainThreadProgressShape extends IDisposable {

	$startProgress(handle: number, options: IProgressOptions, extension?: IExtensionDescription): void;
	$progressReport(handle: number, message: IProgressStep): void;
	$progressEnd(handle: number): void;
}

export interface MainThreadTerminalServiceShape extends IDisposable {
	$createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string, cwd?: string | UriComponents, env?: { [key: string]: string | null }, waitOnExit?: boolean, strictEnv?: boolean, runInBackground?: boolean): Promise<{ id: number, name: string }>;
	$createTerminalRenderer(name: string): Promise<number>;
	$dispose(terminalId: number): void;
	$hide(terminalId: number): void;
	$sendText(terminalId: number, text: string, addNewLine: boolean): void;
	$show(terminalId: number, preserveFocus: boolean): void;
	$registerOnDataListener(terminalId: number): void;

	// Process
	$sendProcessTitle(terminalId: number, title: string): void;
	$sendProcessData(terminalId: number, data: string): void;
	$sendProcessPid(terminalId: number, pid: number): void;
	$sendProcessExit(terminalId: number, exitCode: number): void;
	$sendProcessInitialCwd(terminalId: number, cwd: string): void;
	$sendProcessCwd(terminalId: number, initialCwd: string): void;

	// Renderer
	$terminalRendererSetName(terminalId: number, name: string): void;
	$terminalRendererSetDimensions(terminalId: number, dimensions: ITerminalDimensions): void;
	$terminalRendererWrite(terminalId: number, text: string): void;
	$terminalRendererRegisterOnInputListener(terminalId: number): void;
}

export interface TransferQuickPickItems extends quickInput.IQuickPickItem {
	handle: number;
}

export interface TransferQuickInputButton extends quickInput.IQuickInputButton {
	handle: number;
}

export type TransferQuickInput = TransferQuickPick | TransferInputBox;

export interface BaseTransferQuickInput {

	id: number;

	type?: 'quickPick' | 'inputBox';

	enabled?: boolean;

	busy?: boolean;

	visible?: boolean;
}

export interface TransferQuickPick extends BaseTransferQuickInput {

	type?: 'quickPick';

	value?: string;

	placeholder?: string;

	buttons?: TransferQuickInputButton[];

	items?: TransferQuickPickItems[];

	activeItems?: number[];

	selectedItems?: number[];

	canSelectMany?: boolean;

	ignoreFocusOut?: boolean;

	matchOnDescription?: boolean;

	matchOnDetail?: boolean;
}

export interface TransferInputBox extends BaseTransferQuickInput {

	type?: 'inputBox';

	value?: string;

	placeholder?: string;

	password?: boolean;

	buttons?: TransferQuickInputButton[];

	prompt?: string;

	validationMessage?: string;
}

export interface IInputBoxOptions {
	value?: string;
	valueSelection?: [number, number];
	prompt?: string;
	placeHolder?: string;
	password?: boolean;
	ignoreFocusOut?: boolean;
}

export interface MainThreadQuickOpenShape extends IDisposable {
	$show(instance: number, options: quickInput.IPickOptions<TransferQuickPickItems>, token: CancellationToken): Promise<number | number[] | undefined>;
	$setItems(instance: number, items: TransferQuickPickItems[]): Promise<void>;
	$setError(instance: number, error: Error): Promise<void>;
	$input(options: IInputBoxOptions | undefined, validateInput: boolean, token: CancellationToken): Promise<string>;
	$createOrUpdate(params: TransferQuickInput): Promise<void>;
	$dispose(id: number): Promise<void>;
}

export interface MainThreadStatusBarShape extends IDisposable {
	$setEntry(id: number, extensionId: ExtensionIdentifier | undefined, text: string, tooltip: string, command: string, color: string | ThemeColor, alignment: statusbar.StatusbarAlignment, priority: number | undefined): void;
	$dispose(id: number): void;
}

export interface MainThreadStorageShape extends IDisposable {
	$getValue<T>(shared: boolean, key: string): Promise<T | undefined>;
	$setValue(shared: boolean, key: string, value: object): Promise<void>;
}

export interface MainThreadTelemetryShape extends IDisposable {
	$publicLog(eventName: string, data?: any): void;
}

export type WebviewPanelHandle = string;

export type WebviewInsetHandle = number;

export interface WebviewPanelShowOptions {
	readonly viewColumn?: EditorViewColumn;
	readonly preserveFocus?: boolean;
}

export interface MainThreadWebviewsShape extends IDisposable {
	$createWebviewPanel(handle: WebviewPanelHandle, viewType: string, title: string, showOptions: WebviewPanelShowOptions, options: modes.IWebviewPanelOptions & modes.IWebviewOptions, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): void;
	$createWebviewCodeInset(handle: WebviewInsetHandle, symbolId: string, options: modes.IWebviewOptions, extensionId: ExtensionIdentifier | undefined, extensionLocation: UriComponents | undefined): void;
	$disposeWebview(handle: WebviewPanelHandle): void;
	$reveal(handle: WebviewPanelHandle, showOptions: WebviewPanelShowOptions): void;
	$setTitle(handle: WebviewPanelHandle, value: string): void;
	$setIconPath(handle: WebviewPanelHandle, value: { light: UriComponents, dark: UriComponents } | undefined): void;

	$setHtml(handle: WebviewPanelHandle | WebviewInsetHandle, value: string): void;
	$setOptions(handle: WebviewPanelHandle | WebviewInsetHandle, options: modes.IWebviewOptions): void;
	$postMessage(handle: WebviewPanelHandle | WebviewInsetHandle, value: any): Promise<boolean>;

	$registerSerializer(viewType: string): void;
	$unregisterSerializer(viewType: string): void;
}

export interface WebviewPanelViewState {
	readonly active: boolean;
	readonly visible: boolean;
	readonly position: EditorViewColumn;
}

export interface ExtHostWebviewsShape {
	$onMessage(handle: WebviewPanelHandle, message: any): void;
	$onDidChangeWebviewPanelViewState(handle: WebviewPanelHandle, newState: WebviewPanelViewState): void;
	$onDidDisposeWebviewPanel(handle: WebviewPanelHandle): Promise<void>;
	$deserializeWebviewPanel(newWebviewHandle: WebviewPanelHandle, viewType: string, title: string, state: any, position: EditorViewColumn, options: modes.IWebviewOptions & modes.IWebviewPanelOptions): Promise<void>;
}

export interface MainThreadUrlsShape extends IDisposable {
	$registerUriHandler(handle: number, extensionId: ExtensionIdentifier): Promise<void>;
	$unregisterUriHandler(handle: number): Promise<void>;
}

export interface ExtHostUrlsShape {
	$handleExternalUri(handle: number, uri: UriComponents): Promise<void>;
}

export interface ITextSearchComplete {
	limitHit?: boolean;
}

export interface MainThreadWorkspaceShape extends IDisposable {
	$startFileSearch(includePattern: string | undefined, includeFolder: UriComponents | undefined, excludePatternOrDisregardExcludes: string | false | undefined, maxResults: number | undefined, token: CancellationToken): Promise<UriComponents[] | undefined>;
	$startTextSearch(query: search.IPatternInfo, options: ITextQueryBuilderOptions, requestId: number, token: CancellationToken): Promise<ITextSearchComplete>;
	$checkExists(includes: string[], token: CancellationToken): Promise<boolean>;
	$saveAll(includeUntitled?: boolean): Promise<boolean>;
	$updateWorkspaceFolders(extensionName: string, index: number, deleteCount: number, workspaceFoldersToAdd: { uri: UriComponents, name?: string }[]): Promise<void>;
	$resolveProxy(url: string): Promise<string | undefined>;
}

export interface IFileChangeDto {
	resource: UriComponents;
	type: files.FileChangeType;
}

export interface MainThreadFileSystemShape extends IDisposable {
	$registerFileSystemProvider(handle: number, scheme: string, capabilities: files.FileSystemProviderCapabilities): void;
	$unregisterProvider(handle: number): void;
	$registerResourceLabelFormatter(handle: number, formatter: ResourceLabelFormatter): void;
	$unregisterResourceLabelFormatter(handle: number): void;
	$onFileSystemChange(handle: number, resource: IFileChangeDto[]): void;
}

export interface MainThreadSearchShape extends IDisposable {
	$registerFileSearchProvider(handle: number, scheme: string): void;
	$registerTextSearchProvider(handle: number, scheme: string): void;
	$unregisterProvider(handle: number): void;
	$handleFileMatch(handle: number, session: number, data: UriComponents[]): void;
	$handleTextMatch(handle: number, session: number, data: search.IRawFileMatch2[]): void;
	$handleTelemetry(eventName: string, data: any): void;
}

export interface MainThreadTaskShape extends IDisposable {
	$createTaskId(task: tasks.TaskDTO): Promise<string>;
	$registerTaskProvider(handle: number): Promise<void>;
	$unregisterTaskProvider(handle: number): Promise<void>;
	$fetchTasks(filter?: tasks.TaskFilterDTO): Promise<tasks.TaskDTO[]>;
	$executeTask(task: tasks.TaskHandleDTO | tasks.TaskDTO): Promise<tasks.TaskExecutionDTO>;
	$terminateTask(id: string): Promise<void>;
	$registerTaskSystem(scheme: string, info: tasks.TaskSystemInfoDTO): void;
	$customExecutionComplete(id: string, result?: number): Promise<void>;
}

export interface MainThreadExtensionServiceShape extends IDisposable {
	$activateExtension(extensionId: ExtensionIdentifier, activationEvent: string | null): Promise<void>;
	$onWillActivateExtension(extensionId: ExtensionIdentifier): void;
	$onDidActivateExtension(extensionId: ExtensionIdentifier, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationEvent: string | null): void;
	$onExtensionActivationError(extensionId: ExtensionIdentifier, error: ExtensionActivationError): Promise<void>;
	$onExtensionRuntimeError(extensionId: ExtensionIdentifier, error: SerializedError): void;
	$onExtensionHostExit(code: number): void;
}

export interface SCMProviderFeatures {
	hasQuickDiffProvider?: boolean;
	count?: number;
	commitTemplate?: string;
	acceptInputCommand?: modes.Command;
	statusBarCommands?: CommandDto[];
}

export interface SCMGroupFeatures {
	hideWhenEmpty?: boolean;
}

export type SCMRawResource = [
	number /*handle*/,
	UriComponents /*resourceUri*/,
	string[] /*icons: light, dark*/,
	string /*tooltip*/,
	boolean /*strike through*/,
	boolean /*faded*/,

	string | undefined /*source*/,
	string | undefined /*letter*/,
	ThemeColor | null /*color*/
];

export type SCMRawResourceSplice = [
	number /* start */,
	number /* delete count */,
	SCMRawResource[]
];

export type SCMRawResourceSplices = [
	number, /*handle*/
	SCMRawResourceSplice[]
];

export interface MainThreadSCMShape extends IDisposable {
	$registerSourceControl(handle: number, id: string, label: string, rootUri: UriComponents | undefined): void;
	$updateSourceControl(handle: number, features: SCMProviderFeatures): void;
	$unregisterSourceControl(handle: number): void;

	$registerGroup(sourceControlHandle: number, handle: number, id: string, label: string): void;
	$updateGroup(sourceControlHandle: number, handle: number, features: SCMGroupFeatures): void;
	$updateGroupLabel(sourceControlHandle: number, handle: number, label: string): void;
	$unregisterGroup(sourceControlHandle: number, handle: number): void;

	$spliceResourceStates(sourceControlHandle: number, splices: SCMRawResourceSplices[]): void;

	$setInputBoxValue(sourceControlHandle: number, value: string): void;
	$setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): void;
	$setInputBoxVisibility(sourceControlHandle: number, visible: boolean): void;
	$setValidationProviderIsEnabled(sourceControlHandle: number, enabled: boolean): void;
}

export type DebugSessionUUID = string;

export interface IDebugConfiguration {
	type: string;
	name: string;
	request: string;
	[key: string]: any;
}

export interface MainThreadDebugServiceShape extends IDisposable {
	$registerDebugTypes(debugTypes: string[]): void;
	$sessionCached(sessionID: string): void;
	$acceptDAMessage(handle: number, message: DebugProtocol.ProtocolMessage): void;
	$acceptDAError(handle: number, name: string, message: string, stack: string | undefined): void;
	$acceptDAExit(handle: number, code: number | undefined, signal: string | undefined): void;
	$registerDebugConfigurationProvider(type: string, hasProvideMethod: boolean, hasResolveMethod: boolean, hasProvideDaMethod: boolean, handle: number): Promise<void>;
	$registerDebugAdapterDescriptorFactory(type: string, handle: number): Promise<void>;
	$unregisterDebugConfigurationProvider(handle: number): void;
	$unregisterDebugAdapterDescriptorFactory(handle: number): void;
	$startDebugging(folder: UriComponents | undefined, nameOrConfig: string | IDebugConfiguration, parentSessionID: string | undefined): Promise<boolean>;
	$customDebugAdapterRequest(id: DebugSessionUUID, command: string, args: any): Promise<any>;
	$appendDebugConsole(value: string): void;
	$startBreakpointEvents(): void;
	$registerBreakpoints(breakpoints: Array<ISourceMultiBreakpointDto | IFunctionBreakpointDto>): Promise<void>;
	$unregisterBreakpoints(breakpointIds: string[], functionBreakpointIds: string[]): Promise<void>;
}

export interface IOpenUriOptions {
	readonly allowTunneling?: boolean;
}

export interface MainThreadWindowShape extends IDisposable {
	$getWindowVisibility(): Promise<boolean>;
	$openUri(uri: UriComponents, options: IOpenUriOptions): Promise<boolean>;
}

// -- extension host

export interface ExtHostCommandsShape {
	$executeContributedCommand<T>(id: string, ...args: any[]): Promise<T>;
	$getContributedCommandHandlerDescriptions(): Promise<{ [id: string]: string | ICommandHandlerDescription }>;
}

export interface ExtHostConfigurationShape {
	$initializeConfiguration(data: IConfigurationInitData): void;
	$acceptConfigurationChanged(data: IConfigurationInitData, eventData: IWorkspaceConfigurationChangeEventData): void;
}

export interface ExtHostDiagnosticsShape {

}

export interface ExtHostDocumentContentProvidersShape {
	$provideTextDocumentContent(handle: number, uri: UriComponents): Promise<string | null | undefined>;
}

export interface IModelAddedData {
	uri: UriComponents;
	versionId: number;
	lines: string[];
	EOL: string;
	modeId: string;
	isDirty: boolean;
}
export interface ExtHostDocumentsShape {
	$acceptModelModeChanged(strURL: UriComponents, oldModeId: string, newModeId: string): void;
	$acceptModelSaved(strURL: UriComponents): void;
	$acceptDirtyStateChanged(strURL: UriComponents, isDirty: boolean): void;
	$acceptModelChanged(strURL: UriComponents, e: IModelChangedEvent, isDirty: boolean): void;
}

export interface ExtHostDocumentSaveParticipantShape {
	$participateInSave(resource: UriComponents, reason: SaveReason): Promise<boolean[]>;
}

export interface ITextEditorAddData {
	id: string;
	documentUri: UriComponents;
	options: IResolvedTextEditorConfiguration;
	selections: ISelection[];
	visibleRanges: IRange[];
	editorPosition: EditorViewColumn | undefined;
}
export interface ITextEditorPositionData {
	[id: string]: EditorViewColumn;
}
export interface IEditorPropertiesChangeData {
	options: IResolvedTextEditorConfiguration | null;
	selections: ISelectionChangeEvent | null;
	visibleRanges: IRange[] | null;
}
export interface ISelectionChangeEvent {
	selections: Selection[];
	source?: string;
}

export interface ExtHostEditorsShape {
	$acceptEditorPropertiesChanged(id: string, props: IEditorPropertiesChangeData): void;
	$acceptEditorPositionData(data: ITextEditorPositionData): void;
}

export interface IDocumentsAndEditorsDelta {
	removedDocuments?: UriComponents[];
	addedDocuments?: IModelAddedData[];
	removedEditors?: string[];
	addedEditors?: ITextEditorAddData[];
	newActiveEditor?: string | null;
}

export interface ExtHostDocumentsAndEditorsShape {
	$acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta): void;
}

export interface ExtHostTreeViewsShape {
	$getChildren(treeViewId: string, treeItemHandle?: string): Promise<ITreeItem[]>;
	$setExpanded(treeViewId: string, treeItemHandle: string, expanded: boolean): void;
	$setSelection(treeViewId: string, treeItemHandles: string[]): void;
	$setVisible(treeViewId: string, visible: boolean): void;
}

export interface ExtHostWorkspaceShape {
	$initializeWorkspace(workspace: IWorkspaceData | null): void;
	$acceptWorkspaceData(workspace: IWorkspaceData | null): void;
	$handleTextSearchResult(result: search.IRawFileMatch2, requestId: number): void;
}

export interface ExtHostFileSystemShape {
	$stat(handle: number, resource: UriComponents): Promise<files.IStat>;
	$readdir(handle: number, resource: UriComponents): Promise<[string, files.FileType][]>;
	$readFile(handle: number, resource: UriComponents): Promise<VSBuffer>;
	$writeFile(handle: number, resource: UriComponents, content: VSBuffer, opts: files.FileWriteOptions): Promise<void>;
	$rename(handle: number, resource: UriComponents, target: UriComponents, opts: files.FileOverwriteOptions): Promise<void>;
	$copy(handle: number, resource: UriComponents, target: UriComponents, opts: files.FileOverwriteOptions): Promise<void>;
	$mkdir(handle: number, resource: UriComponents): Promise<void>;
	$delete(handle: number, resource: UriComponents, opts: files.FileDeleteOptions): Promise<void>;
	$watch(handle: number, session: number, resource: UriComponents, opts: files.IWatchOptions): void;
	$unwatch(handle: number, session: number): void;
	$open(handle: number, resource: UriComponents, opts: files.FileOpenOptions): Promise<number>;
	$close(handle: number, fd: number): Promise<void>;
	$read(handle: number, fd: number, pos: number, length: number): Promise<VSBuffer>;
	$write(handle: number, fd: number, pos: number, data: VSBuffer): Promise<number>;
}

export interface ExtHostSearchShape {
	$provideFileSearchResults(handle: number, session: number, query: search.IRawQuery, token: CancellationToken): Promise<search.ISearchCompleteStats>;
	$provideTextSearchResults(handle: number, session: number, query: search.IRawTextQuery, token: CancellationToken): Promise<search.ISearchCompleteStats>;
	$clearCache(cacheKey: string): Promise<void>;
}

export interface IResolveAuthorityErrorResult {
	type: 'error';
	error: {
		message: string | undefined;
		code: RemoteAuthorityResolverErrorCode;
		detail: any;
	};
}

export interface IResolveAuthorityOKResult {
	type: 'ok';
	value: ResolvedAuthority;
}

export type IResolveAuthorityResult = IResolveAuthorityErrorResult | IResolveAuthorityOKResult;

export interface ExtHostExtensionServiceShape {
	$resolveAuthority(remoteAuthority: string, resolveAttempt: number): Promise<IResolveAuthorityResult>;
	$startExtensionHost(enabledExtensionIds: ExtensionIdentifier[]): Promise<void>;
	$activateByEvent(activationEvent: string): Promise<void>;
	$activate(extensionId: ExtensionIdentifier, activationEvent: string): Promise<boolean>;

	$deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void>;

	$test_latency(n: number): Promise<number>;
	$test_up(b: VSBuffer): Promise<number>;
	$test_down(size: number): Promise<VSBuffer>;
}

export interface FileSystemEvents {
	created: UriComponents[];
	changed: UriComponents[];
	deleted: UriComponents[];
}
export interface ExtHostFileSystemEventServiceShape {
	$onFileEvent(events: FileSystemEvents): void;
	$onFileRename(oldUri: UriComponents, newUri: UriComponents): void;
	$onWillRename(oldUri: UriComponents, newUri: UriComponents): Promise<any>;
}

export interface ObjectIdentifier {
	$ident?: number;
}

export namespace ObjectIdentifier {
	export const name = '$ident';
	export function mixin<T>(obj: T, id: number): T & ObjectIdentifier {
		Object.defineProperty(obj, name, { value: id, enumerable: true });
		return <T & ObjectIdentifier>obj;
	}
	export function of(obj: any): number {
		return obj[name];
	}
}

export interface ExtHostHeapServiceShape {
	$onGarbageCollection(ids: number[]): void;
}
export interface IRawColorInfo {
	color: [number, number, number, number];
	range: IRange;
}

export class IdObject {
	_id?: number;
	private static _n = 0;
	static mixin<T extends object>(object: T): T & IdObject {
		(<any>object)._id = IdObject._n++;
		return <any>object;
	}
}

export interface SuggestDataDto {
	a/* label */: string;
	b/* kind */: modes.CompletionItemKind;
	c/* detail */?: string;
	d/* documentation */?: string | IMarkdownString;
	e/* sortText */?: string;
	f/* filterText */?: string;
	g/* preselect */?: boolean;
	h/* insertText */?: string;
	i/* insertTextRules */?: modes.CompletionItemInsertTextRule;
	j/* range */?: IRange;
	k/* commitCharacters */?: string[];
	l/* additionalTextEdits */?: ISingleEditOperation[];
	m/* command */?: modes.Command;
	// not-standard
	x?: ChainedCacheId;
}

export interface SuggestResultDto {
	x?: number;
	a: IRange;
	b: SuggestDataDto[];
	c?: boolean;
}

export interface LocationDto {
	uri: UriComponents;
	range: IRange;
}

export interface DefinitionLinkDto {
	originSelectionRange?: IRange;
	uri: UriComponents;
	range: IRange;
	targetSelectionRange?: IRange;
}

export interface WorkspaceSymbolDto extends IdObject {
	name: string;
	containerName?: string;
	kind: modes.SymbolKind;
	location: LocationDto;
}

export interface WorkspaceSymbolsDto extends IdObject {
	symbols: WorkspaceSymbolDto[];
}

export interface ResourceFileEditDto {
	oldUri?: UriComponents;
	newUri?: UriComponents;
	options?: {
		overwrite?: boolean;
		ignoreIfExists?: boolean;
		ignoreIfNotExists?: boolean;
		recursive?: boolean;
	};
}

export interface ResourceTextEditDto {
	resource: UriComponents;
	modelVersionId?: number;
	edits: modes.TextEdit[];
}

export interface WorkspaceEditDto {
	edits: Array<ResourceFileEditDto | ResourceTextEditDto>;

	// todo@joh reject should go into rename
	rejectReason?: string;
}

export function reviveWorkspaceEditDto(data: WorkspaceEditDto | undefined): modes.WorkspaceEdit {
	if (data && data.edits) {
		for (const edit of data.edits) {
			if (typeof (<ResourceTextEditDto>edit).resource === 'object') {
				(<ResourceTextEditDto>edit).resource = URI.revive((<ResourceTextEditDto>edit).resource);
			} else {
				(<ResourceFileEditDto>edit).newUri = URI.revive((<ResourceFileEditDto>edit).newUri);
				(<ResourceFileEditDto>edit).oldUri = URI.revive((<ResourceFileEditDto>edit).oldUri);
			}
		}
	}
	return <modes.WorkspaceEdit>data;
}

export type CommandDto = ObjectIdentifier & modes.Command;

export interface CodeActionDto {
	title: string;
	edit?: WorkspaceEditDto;
	diagnostics?: IMarkerData[];
	command?: CommandDto;
	kind?: string;
	isPreferred?: boolean;
}

export type CacheId = number;
export type ChainedCacheId = [CacheId, CacheId];

export interface LinksListDto {
	id?: CacheId;
	links: LinkDto[];
}

export interface LinkDto {
	cacheId?: ChainedCacheId;
	range: IRange;
	url?: string | UriComponents;
	tooltip?: string;
}

export interface CodeLensDto extends ObjectIdentifier {
	range: IRange;
	id?: string;
	command?: CommandDto;
}

export type CodeInsetDto = ObjectIdentifier & codeInset.ICodeInsetSymbol;

export interface CallHierarchyDto {
	_id: number;
	kind: modes.SymbolKind;
	name: string;
	detail?: string;
	uri: UriComponents;
	range: IRange;
	selectionRange: IRange;
}

export interface ExtHostLanguageFeaturesShape {
	$provideDocumentSymbols(handle: number, resource: UriComponents, token: CancellationToken): Promise<modes.DocumentSymbol[] | undefined>;
	$provideCodeLenses(handle: number, resource: UriComponents, token: CancellationToken): Promise<CodeLensDto[]>;
	$resolveCodeLens(handle: number, symbol: CodeLensDto, token: CancellationToken): Promise<CodeLensDto | undefined>;
	$provideCodeInsets(handle: number, resource: UriComponents, token: CancellationToken): Promise<CodeInsetDto[] | undefined>;
	$resolveCodeInset(handle: number, resource: UriComponents, symbol: CodeInsetDto, token: CancellationToken): Promise<CodeInsetDto>;
	$provideDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<DefinitionLinkDto[]>;
	$provideDeclaration(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<DefinitionLinkDto[]>;
	$provideImplementation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<DefinitionLinkDto[]>;
	$provideTypeDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<DefinitionLinkDto[]>;
	$provideHover(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.Hover | undefined>;
	$provideDocumentHighlights(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DocumentHighlight[] | undefined>;
	$provideReferences(handle: number, resource: UriComponents, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Promise<LocationDto[] | undefined>;
	$provideCodeActions(handle: number, resource: UriComponents, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Promise<CodeActionDto[] | undefined>;
	$provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideWorkspaceSymbols(handle: number, search: string, token: CancellationToken): Promise<WorkspaceSymbolsDto>;
	$resolveWorkspaceSymbol(handle: number, symbol: WorkspaceSymbolDto, token: CancellationToken): Promise<WorkspaceSymbolDto | undefined>;
	$releaseWorkspaceSymbols(handle: number, id: number): void;
	$provideRenameEdits(handle: number, resource: UriComponents, position: IPosition, newName: string, token: CancellationToken): Promise<WorkspaceEditDto | undefined>;
	$resolveRenameLocation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.RenameLocation | undefined>;
	$provideCompletionItems(handle: number, resource: UriComponents, position: IPosition, context: modes.CompletionContext, token: CancellationToken): Promise<SuggestResultDto | undefined>;
	$resolveCompletionItem(handle: number, resource: UriComponents, position: IPosition, id: ChainedCacheId, token: CancellationToken): Promise<SuggestDataDto | undefined>;
	$releaseCompletionItems(handle: number, id: number): void;
	$provideSignatureHelp(handle: number, resource: UriComponents, position: IPosition, context: modes.SignatureHelpContext, token: CancellationToken): Promise<modes.SignatureHelp | undefined>;
	$provideDocumentLinks(handle: number, resource: UriComponents, token: CancellationToken): Promise<LinksListDto | undefined>;
	$resolveDocumentLink(handle: number, id: ChainedCacheId, token: CancellationToken): Promise<LinkDto | undefined>;
	$releaseDocumentLinks(handle: number, id: number): void;
	$provideDocumentColors(handle: number, resource: UriComponents, token: CancellationToken): Promise<IRawColorInfo[]>;
	$provideColorPresentations(handle: number, resource: UriComponents, colorInfo: IRawColorInfo, token: CancellationToken): Promise<modes.IColorPresentation[] | undefined>;
	$provideFoldingRanges(handle: number, resource: UriComponents, context: modes.FoldingContext, token: CancellationToken): Promise<modes.FoldingRange[] | undefined>;
	$provideSelectionRanges(handle: number, resource: UriComponents, positions: IPosition[], token: CancellationToken): Promise<modes.SelectionRange[][]>;
	$provideCallHierarchyItem(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<CallHierarchyDto | undefined>;
	$resolveCallHierarchyItem(handle: number, item: callHierarchy.CallHierarchyItem, direction: callHierarchy.CallHierarchyDirection, token: CancellationToken): Promise<[CallHierarchyDto, modes.Location[]][]>;
}

export interface ExtHostQuickOpenShape {
	$onItemSelected(handle: number): void;
	$validateInput(input: string): Promise<string | null | undefined>;
	$onDidChangeActive(sessionId: number, handles: number[]): void;
	$onDidChangeSelection(sessionId: number, handles: number[]): void;
	$onDidAccept(sessionId: number): void;
	$onDidChangeValue(sessionId: number, value: string): void;
	$onDidTriggerButton(sessionId: number, handle: number): void;
	$onDidHide(sessionId: number): void;
}

export interface ShellLaunchConfigDto {
	name?: string;
	executable?: string;
	args?: string[] | string;
	cwd?: string | UriComponents;
	env?: { [key: string]: string | null };
}

export interface ExtHostTerminalServiceShape {
	$acceptTerminalClosed(id: number): void;
	$acceptTerminalOpened(id: number, name: string): void;
	$acceptActiveTerminalChanged(id: number | null): void;
	$acceptTerminalProcessId(id: number, processId: number): void;
	$acceptTerminalProcessData(id: number, data: string): void;
	$acceptTerminalRendererInput(id: number, data: string): void;
	$acceptTerminalTitleChange(id: number, name: string): void;
	$acceptTerminalDimensions(id: number, cols: number, rows: number): void;
	$createProcess(id: number, shellLaunchConfig: ShellLaunchConfigDto, activeWorkspaceRootUri: UriComponents, cols: number, rows: number, isWorkspaceShellAllowed: boolean): void;
	$acceptProcessInput(id: number, data: string): void;
	$acceptProcessResize(id: number, cols: number, rows: number): void;
	$acceptProcessShutdown(id: number, immediate: boolean): void;
	$acceptProcessRequestInitialCwd(id: number): void;
	$acceptProcessRequestCwd(id: number): void;
	$acceptProcessRequestLatency(id: number): number;
}

export interface ExtHostSCMShape {
	$provideOriginalResource(sourceControlHandle: number, uri: UriComponents, token: CancellationToken): Promise<UriComponents | null>;
	$onInputBoxValueChange(sourceControlHandle: number, value: string): void;
	$executeResourceCommand(sourceControlHandle: number, groupHandle: number, handle: number): Promise<void>;
	$validateInput(sourceControlHandle: number, value: string, cursorPosition: number): Promise<[string, number] | undefined>;
	$setSelectedSourceControls(selectedSourceControlHandles: number[]): Promise<void>;
}

export interface ExtHostTaskShape {
	$provideTasks(handle: number, validTypes: { [key: string]: boolean; }): Thenable<tasks.TaskSetDTO>;
	$onDidStartTask(execution: tasks.TaskExecutionDTO, terminalId: number): void;
	$onDidStartTaskProcess(value: tasks.TaskProcessStartedDTO): void;
	$onDidEndTaskProcess(value: tasks.TaskProcessEndedDTO): void;
	$OnDidEndTask(execution: tasks.TaskExecutionDTO): void;
	$resolveVariables(workspaceFolder: UriComponents, toResolve: { process?: { name: string; cwd?: string }, variables: string[] }): Promise<{ process?: string; variables: { [key: string]: string } }>;
}

export interface IBreakpointDto {
	type: string;
	id?: string;
	enabled: boolean;
	condition?: string;
	hitCondition?: string;
	logMessage?: string;
}

export interface IFunctionBreakpointDto extends IBreakpointDto {
	type: 'function';
	functionName: string;
}

export interface ISourceBreakpointDto extends IBreakpointDto {
	type: 'source';
	uri: UriComponents;
	line: number;
	character: number;
}

export interface IBreakpointsDeltaDto {
	added?: Array<ISourceBreakpointDto | IFunctionBreakpointDto>;
	removed?: string[];
	changed?: Array<ISourceBreakpointDto | IFunctionBreakpointDto>;
}

export interface ISourceMultiBreakpointDto {
	type: 'sourceMulti';
	uri: UriComponents;
	lines: {
		id: string;
		enabled: boolean;
		condition?: string;
		hitCondition?: string;
		logMessage?: string;
		line: number;
		character: number;
	}[];
}

export interface IDebugSessionFullDto {
	id: DebugSessionUUID;
	type: string;
	name: string;
	folderUri: UriComponents | undefined;
	configuration: IConfig;
}

export type IDebugSessionDto = IDebugSessionFullDto | DebugSessionUUID;

export interface ExtHostDebugServiceShape {
	$substituteVariables(folder: UriComponents | undefined, config: IConfig): Promise<IConfig>;
	$runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): Promise<number | undefined>;
	$startDASession(handle: number, session: IDebugSessionDto): Promise<void>;
	$stopDASession(handle: number): Promise<void>;
	$sendDAMessage(handle: number, message: DebugProtocol.ProtocolMessage): void;
	$resolveDebugConfiguration(handle: number, folder: UriComponents | undefined, debugConfiguration: IConfig): Promise<IConfig | null | undefined>;
	$provideDebugConfigurations(handle: number, folder: UriComponents | undefined): Promise<IConfig[]>;
	$legacyDebugAdapterExecutable(handle: number, folderUri: UriComponents | undefined): Promise<IAdapterDescriptor>; // TODO@AW legacy
	$provideDebugAdapter(handle: number, session: IDebugSessionDto): Promise<IAdapterDescriptor>;
	$acceptDebugSessionStarted(session: IDebugSessionDto): void;
	$acceptDebugSessionTerminated(session: IDebugSessionDto): void;
	$acceptDebugSessionActiveChanged(session: IDebugSessionDto | undefined): void;
	$acceptDebugSessionCustomEvent(session: IDebugSessionDto, event: any): void;
	$acceptBreakpointsDelta(delta: IBreakpointsDeltaDto): void;
}


export interface DecorationRequest {
	readonly id: number;
	readonly handle: number;
	readonly uri: UriComponents;
}

export type DecorationData = [number, boolean, string, string, ThemeColor, string];
export type DecorationReply = { [id: number]: DecorationData };

export interface ExtHostDecorationsShape {
	$provideDecorations(requests: DecorationRequest[], token: CancellationToken): Promise<DecorationReply>;
}

export interface ExtHostWindowShape {
	$onDidChangeWindowFocus(value: boolean): void;
}

export interface ExtHostLogServiceShape {
	$setLevel(level: LogLevel): void;
}

export interface ExtHostOutputServiceShape {
	$setVisibleChannel(channelId: string | null): void;
}

export interface ExtHostProgressShape {
	$acceptProgressCanceled(handle: number): void;
}

export interface ExtHostCommentsShape {
	$provideDocumentComments(handle: number, document: UriComponents): Promise<modes.CommentInfo | null>;
	$createNewCommentThread(handle: number, document: UriComponents, range: IRange, text: string): Promise<modes.CommentThread | null>;
	$createCommentThreadTemplate(commentControllerHandle: number, uriComponents: UriComponents, range: IRange): void;
	$onCommentWidgetInputChange(commentControllerHandle: number, document: UriComponents, range: IRange, input: string | undefined): Promise<number | undefined>;
	$deleteCommentThread(commentControllerHandle: number, commentThreadHandle: number): void;
	$provideCommentingRanges(commentControllerHandle: number, uriComponents: UriComponents, token: CancellationToken): Promise<IRange[] | undefined>;
	$checkStaticContribution(commentControllerHandle: number): Promise<boolean>;
	$provideReactionGroup(commentControllerHandle: number): Promise<modes.CommentReaction[] | undefined>;
	$toggleReaction(commentControllerHandle: number, threadHandle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void>;
	$createNewCommentWidgetCallback(commentControllerHandle: number, uriComponents: UriComponents, range: IRange, token: CancellationToken): Promise<void>;
	$replyToCommentThread(handle: number, document: UriComponents, range: IRange, commentThread: modes.CommentThread, text: string): Promise<modes.CommentThread | null>;
	$editComment(handle: number, document: UriComponents, comment: modes.Comment, text: string): Promise<void>;
	$deleteComment(handle: number, document: UriComponents, comment: modes.Comment): Promise<void>;
	$startDraft(handle: number, document: UriComponents): Promise<void>;
	$deleteDraft(handle: number, document: UriComponents): Promise<void>;
	$finishDraft(handle: number, document: UriComponents): Promise<void>;
	$addReaction(handle: number, document: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void>;
	$deleteReaction(handle: number, document: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void>;
	$provideWorkspaceComments(handle: number): Promise<modes.CommentThread[] | null>;
}

export interface ExtHostStorageShape {
	$acceptValue(shared: boolean, key: string, value: object | undefined): void;
}

// --- proxy identifiers

export const MainContext = {
	MainThreadClipboard: createMainId<MainThreadClipboardShape>('MainThreadClipboard'),
	MainThreadCommands: createMainId<MainThreadCommandsShape>('MainThreadCommands'),
	MainThreadComments: createMainId<MainThreadCommentsShape>('MainThreadComments'),
	MainThreadConfiguration: createMainId<MainThreadConfigurationShape>('MainThreadConfiguration'),
	MainThreadConsole: createMainId<MainThreadConsoleShape>('MainThreadConsole'),
	MainThreadDebugService: createMainId<MainThreadDebugServiceShape>('MainThreadDebugService'),
	MainThreadDecorations: createMainId<MainThreadDecorationsShape>('MainThreadDecorations'),
	MainThreadDiagnostics: createMainId<MainThreadDiagnosticsShape>('MainThreadDiagnostics'),
	MainThreadDialogs: createMainId<MainThreadDiaglogsShape>('MainThreadDiaglogs'),
	MainThreadDocuments: createMainId<MainThreadDocumentsShape>('MainThreadDocuments'),
	MainThreadDocumentContentProviders: createMainId<MainThreadDocumentContentProvidersShape>('MainThreadDocumentContentProviders'),
	MainThreadTextEditors: createMainId<MainThreadTextEditorsShape>('MainThreadTextEditors'),
	MainThreadErrors: createMainId<MainThreadErrorsShape>('MainThreadErrors'),
	MainThreadTreeViews: createMainId<MainThreadTreeViewsShape>('MainThreadTreeViews'),
	MainThreadKeytar: createMainId<MainThreadKeytarShape>('MainThreadKeytar'),
	MainThreadLanguageFeatures: createMainId<MainThreadLanguageFeaturesShape>('MainThreadLanguageFeatures'),
	MainThreadLanguages: createMainId<MainThreadLanguagesShape>('MainThreadLanguages'),
	MainThreadMessageService: createMainId<MainThreadMessageServiceShape>('MainThreadMessageService'),
	MainThreadOutputService: createMainId<MainThreadOutputServiceShape>('MainThreadOutputService'),
	MainThreadProgress: createMainId<MainThreadProgressShape>('MainThreadProgress'),
	MainThreadQuickOpen: createMainId<MainThreadQuickOpenShape>('MainThreadQuickOpen'),
	MainThreadStatusBar: createMainId<MainThreadStatusBarShape>('MainThreadStatusBar'),
	MainThreadStorage: createMainId<MainThreadStorageShape>('MainThreadStorage'),
	MainThreadTelemetry: createMainId<MainThreadTelemetryShape>('MainThreadTelemetry'),
	MainThreadTerminalService: createMainId<MainThreadTerminalServiceShape>('MainThreadTerminalService'),
	MainThreadWebviews: createMainId<MainThreadWebviewsShape>('MainThreadWebviews'),
	MainThreadUrls: createMainId<MainThreadUrlsShape>('MainThreadUrls'),
	MainThreadWorkspace: createMainId<MainThreadWorkspaceShape>('MainThreadWorkspace'),
	MainThreadFileSystem: createMainId<MainThreadFileSystemShape>('MainThreadFileSystem'),
	MainThreadExtensionService: createMainId<MainThreadExtensionServiceShape>('MainThreadExtensionService'),
	MainThreadSCM: createMainId<MainThreadSCMShape>('MainThreadSCM'),
	MainThreadSearch: createMainId<MainThreadSearchShape>('MainThreadSearch'),
	MainThreadTask: createMainId<MainThreadTaskShape>('MainThreadTask'),
	MainThreadWindow: createMainId<MainThreadWindowShape>('MainThreadWindow'),
};

export const ExtHostContext = {
	ExtHostCommands: createExtId<ExtHostCommandsShape>('ExtHostCommands'),
	ExtHostConfiguration: createExtId<ExtHostConfigurationShape>('ExtHostConfiguration'),
	ExtHostDiagnostics: createExtId<ExtHostDiagnosticsShape>('ExtHostDiagnostics'),
	ExtHostDebugService: createExtId<ExtHostDebugServiceShape>('ExtHostDebugService'),
	ExtHostDecorations: createExtId<ExtHostDecorationsShape>('ExtHostDecorations'),
	ExtHostDocumentsAndEditors: createExtId<ExtHostDocumentsAndEditorsShape>('ExtHostDocumentsAndEditors'),
	ExtHostDocuments: createExtId<ExtHostDocumentsShape>('ExtHostDocuments'),
	ExtHostDocumentContentProviders: createExtId<ExtHostDocumentContentProvidersShape>('ExtHostDocumentContentProviders'),
	ExtHostDocumentSaveParticipant: createExtId<ExtHostDocumentSaveParticipantShape>('ExtHostDocumentSaveParticipant'),
	ExtHostEditors: createExtId<ExtHostEditorsShape>('ExtHostEditors'),
	ExtHostTreeViews: createExtId<ExtHostTreeViewsShape>('ExtHostTreeViews'),
	ExtHostFileSystem: createExtId<ExtHostFileSystemShape>('ExtHostFileSystem'),
	ExtHostFileSystemEventService: createExtId<ExtHostFileSystemEventServiceShape>('ExtHostFileSystemEventService'),
	ExtHostHeapService: createExtId<ExtHostHeapServiceShape>('ExtHostHeapMonitor'),
	ExtHostLanguageFeatures: createExtId<ExtHostLanguageFeaturesShape>('ExtHostLanguageFeatures'),
	ExtHostQuickOpen: createExtId<ExtHostQuickOpenShape>('ExtHostQuickOpen'),
	ExtHostExtensionService: createExtId<ExtHostExtensionServiceShape>('ExtHostExtensionService'),
	ExtHostLogService: createExtId<ExtHostLogServiceShape>('ExtHostLogService'),
	ExtHostTerminalService: createExtId<ExtHostTerminalServiceShape>('ExtHostTerminalService'),
	ExtHostSCM: createExtId<ExtHostSCMShape>('ExtHostSCM'),
	ExtHostSearch: createExtId<ExtHostSearchShape>('ExtHostSearch'),
	ExtHostTask: createExtId<ExtHostTaskShape>('ExtHostTask'),
	ExtHostWorkspace: createExtId<ExtHostWorkspaceShape>('ExtHostWorkspace'),
	ExtHostWindow: createExtId<ExtHostWindowShape>('ExtHostWindow'),
	ExtHostWebviews: createExtId<ExtHostWebviewsShape>('ExtHostWebviews'),
	ExtHostProgress: createMainId<ExtHostProgressShape>('ExtHostProgress'),
	ExtHostComments: createMainId<ExtHostCommentsShape>('ExtHostComments'),
	ExtHostStorage: createMainId<ExtHostStorageShape>('ExtHostStorage'),
	ExtHostUrls: createExtId<ExtHostUrlsShape>('ExtHostUrls'),
	ExtHostOutputService: createMainId<ExtHostOutputServiceShape>('ExtHostOutputService'),
};
