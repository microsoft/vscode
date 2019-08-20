/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { SerializedError } from 'vs/base/common/errors';
import { IRelativePattern } from 'vs/base/common/glob';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { URI, UriComponents } from 'vs/base/common/uri';
import { RenderLineNumbersType, TextEditorCursorStyle } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EndOfLineSequence, ISingleEditOperation } from 'vs/editor/common/model';
import { IModelChangedEvent } from 'vs/editor/common/model/mirrorTextModel';
import * as modes from 'vs/editor/common/modes';
import { CharacterPair, CommentRule, EnterAction } from 'vs/editor/common/modes/languageConfiguration';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationData, IConfigurationModel } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as files from 'vs/platform/files/common/files';
import { ResourceLabelFormatter } from 'vs/platform/label/common/label';
import { LogLevel } from 'vs/platform/log/common/log';
import { IMarkerData } from 'vs/platform/markers/common/markers';
import { IProgressOptions, IProgressStep } from 'vs/platform/progress/common/progress';
import * as quickInput from 'vs/platform/quickinput/common/quickInput';
import { RemoteAuthorityResolverErrorCode, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import * as statusbar from 'vs/platform/statusbar/common/statusbar';
import { ClassifiedEvent, GDPRClassification, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { EditorViewColumn } from 'vs/workbench/api/common/shared/editor';
import * as tasks from 'vs/workbench/api/common/shared/tasks';
import { IRevealOptions, ITreeItem } from 'vs/workbench/common/views';
import * as callHierarchy from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { IAdapterDescriptor, IConfig } from 'vs/workbench/contrib/debug/common/debug';
import { ITextQueryBuilderOptions } from 'vs/workbench/contrib/search/common/queryBuilder';
import { ITerminalDimensions, IShellLaunchConfig } from 'vs/workbench/contrib/terminal/common/terminal';
import { ExtensionActivationError } from 'vs/workbench/services/extensions/common/extensions';
import { createExtHostContextProxyIdentifier as createExtId, createMainContextProxyIdentifier as createMainId, IRPCProtocol } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import * as search from 'vs/workbench/services/search/common/search';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';

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
	webviewResourceRoot: string;
	webviewCspSource: string;
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
	remote: { isRemote: boolean; authority: string | undefined; };
}

export interface IConfigurationInitData extends IConfigurationData {
	configurationScopes: [string, ConfigurationScope | undefined][];
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

export interface CommentProviderFeatures {
	reactionGroup?: modes.CommentReaction[];
	reactionHandler?: boolean;
}

export interface MainThreadCommentsShape extends IDisposable {
	$registerCommentController(handle: number, id: string, label: string): void;
	$unregisterCommentController(handle: number): void;
	$updateCommentControllerFeatures(handle: number, features: CommentProviderFeatures): void;
	$createCommentThread(handle: number, commentThreadHandle: number, threadId: string, resource: UriComponents, range: IRange, extensionId: ExtensionIdentifier): modes.CommentThread | undefined;
	$updateCommentThread(handle: number, commentThreadHandle: number, threadId: string, resource: UriComponents, range: IRange, label: string | undefined, contextValue: string | undefined, comments: modes.Comment[], collapseState: modes.CommentThreadCollapsibleState): void;
	$deleteCommentThread(handle: number, commentThreadHandle: number): void;
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
	$tryApplyWorkspaceEdit(workspaceEditDto: IWorkspaceEditDto): Promise<boolean>;
	$tryInsertSnippet(id: string, template: string, selections: readonly IRange[], opts: IUndoStopOptions): Promise<boolean>;
	$getDiffInformation(id: string): Promise<editorCommon.ILineChange[]>;
}

export interface MainThreadTreeViewsShape extends IDisposable {
	$registerTreeViewDataProvider(treeViewId: string, options: { showCollapseAll: boolean, canSelectMany: boolean }): void;
	$refresh(treeViewId: string, itemsToRefresh?: { [treeItemHandle: string]: ITreeItem }): Promise<void>;
	$reveal(treeViewId: string, treeItem: ITreeItem, parentChain: ITreeItem[], options: IRevealOptions): Promise<void>;
	$setMessage(treeViewId: string, message: string): void;
}

export interface MainThreadDownloadServiceShape extends IDisposable {
	$download(uri: UriComponents, to: UriComponents): Promise<void>;
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

export interface IRegExpDto {
	pattern: string;
	flags?: string;
}
export interface IIndentationRuleDto {
	decreaseIndentPattern: IRegExpDto;
	increaseIndentPattern: IRegExpDto;
	indentNextLinePattern?: IRegExpDto;
	unIndentedLinePattern?: IRegExpDto;
}
export interface IOnEnterRuleDto {
	beforeText: IRegExpDto;
	afterText?: IRegExpDto;
	oneLineAboveText?: IRegExpDto;
	action: EnterAction;
}
export interface ILanguageConfigurationDto {
	comments?: CommentRule;
	brackets?: CharacterPair[];
	wordPattern?: IRegExpDto;
	indentationRules?: IIndentationRuleDto;
	onEnterRules?: IOnEnterRuleDto[];
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

export interface IDocumentFilterDto {
	$serialized: true;
	language?: string;
	scheme?: string;
	pattern?: string | IRelativePattern;
	exclusive?: boolean;
}

export interface ISignatureHelpProviderMetadataDto {
	readonly triggerCharacters: readonly string[];
	readonly retriggerCharacters: readonly string[];
}

export interface MainThreadLanguageFeaturesShape extends IDisposable {
	$unregister(handle: number): void;
	$registerDocumentSymbolProvider(handle: number, selector: IDocumentFilterDto[], label: string): void;
	$registerCodeLensSupport(handle: number, selector: IDocumentFilterDto[], eventHandle: number | undefined): void;
	$emitCodeLensEvent(eventHandle: number, event?: any): void;
	$registerDefinitionSupport(handle: number, selector: IDocumentFilterDto[]): void;
	$registerDeclarationSupport(handle: number, selector: IDocumentFilterDto[]): void;
	$registerImplementationSupport(handle: number, selector: IDocumentFilterDto[]): void;
	$registerTypeDefinitionSupport(handle: number, selector: IDocumentFilterDto[]): void;
	$registerHoverProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerDocumentHighlightProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerReferenceSupport(handle: number, selector: IDocumentFilterDto[]): void;
	$registerQuickFixSupport(handle: number, selector: IDocumentFilterDto[], supportedKinds?: string[]): void;
	$registerDocumentFormattingSupport(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, displayName: string): void;
	$registerRangeFormattingSupport(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, displayName: string): void;
	$registerOnTypeFormattingSupport(handle: number, selector: IDocumentFilterDto[], autoFormatTriggerCharacters: string[], extensionId: ExtensionIdentifier): void;
	$registerNavigateTypeSupport(handle: number): void;
	$registerRenameSupport(handle: number, selector: IDocumentFilterDto[], supportsResolveInitialValues: boolean): void;
	$registerSuggestSupport(handle: number, selector: IDocumentFilterDto[], triggerCharacters: string[], supportsResolveDetails: boolean, extensionId: ExtensionIdentifier): void;
	$registerSignatureHelpProvider(handle: number, selector: IDocumentFilterDto[], metadata: ISignatureHelpProviderMetadataDto): void;
	$registerDocumentLinkProvider(handle: number, selector: IDocumentFilterDto[], supportsResolve: boolean): void;
	$registerDocumentColorProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerFoldingRangeProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerSelectionRangeProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerCallHierarchyProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$setLanguageConfiguration(handle: number, languageId: string, configuration: ILanguageConfigurationDto): void;
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

export interface TerminalLaunchConfig {
	name?: string;
	shellPath?: string;
	shellArgs?: string[] | string;
	cwd?: string | UriComponents;
	env?: { [key: string]: string | null };
	waitOnExit?: boolean;
	strictEnv?: boolean;
	hideFromUser?: boolean;
	isExtensionTerminal?: boolean;
}

export interface MainThreadTerminalServiceShape extends IDisposable {
	$createTerminal(config: TerminalLaunchConfig): Promise<{ id: number, name: string }>;
	$dispose(terminalId: number): void;
	$hide(terminalId: number): void;
	$sendText(terminalId: number, text: string, addNewLine: boolean): void;
	$show(terminalId: number, preserveFocus: boolean): void;
	/** @deprecated */
	$registerOnDataListener(terminalId: number): void;
	$startSendingDataEvents(): void;
	$stopSendingDataEvents(): void;

	// Process
	$sendProcessTitle(terminalId: number, title: string): void;
	$sendProcessData(terminalId: number, data: string): void;
	$sendProcessReady(terminalId: number, pid: number, cwd: string): void;
	$sendProcessExit(terminalId: number, exitCode: number): void;
	$sendProcessInitialCwd(terminalId: number, cwd: string): void;
	$sendProcessCwd(terminalId: number, initialCwd: string): void;
	$sendOverrideDimensions(terminalId: number, dimensions: ITerminalDimensions | undefined): void;
	$sendResolvedLaunchConfig(terminalId: number, shellLaunchConfig: IShellLaunchConfig): void;
}

export interface TransferQuickPickItems extends quickInput.IQuickPickItem {
	handle: number;
}

export interface TransferQuickInputButton extends quickInput.IQuickInputButton {
	handle: number;
}

export type TransferQuickInput = TransferQuickPick | TransferInputBox;

export interface BaseTransferQuickInput {

	[key: string]: any;

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
	$setEntry(id: number, statusId: string, statusName: string, text: string, tooltip: string, command: string, color: string | ThemeColor, alignment: statusbar.StatusbarAlignment, priority: number | undefined): void;
	$dispose(id: number): void;
}

export interface MainThreadStorageShape extends IDisposable {
	$getValue<T>(shared: boolean, key: string): Promise<T | undefined>;
	$setValue(shared: boolean, key: string, value: object): Promise<void>;
}

export interface MainThreadTelemetryShape extends IDisposable {
	$publicLog(eventName: string, data?: any): void;
	$publicLog2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void;
}

export interface MainThreadEditorInsetsShape extends IDisposable {
	$createEditorInset(handle: number, id: string, uri: UriComponents, line: number, height: number, options: modes.IWebviewOptions, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): Promise<void>;
	$disposeEditorInset(handle: number): void;

	$setHtml(handle: number, value: string): void;
	$setOptions(handle: number, options: modes.IWebviewOptions): void;
	$postMessage(handle: number, value: any): Promise<boolean>;
}

export interface ExtHostEditorInsetsShape {
	$onDidDispose(handle: number): void;
	$onDidReceiveMessage(handle: number, message: any): void;
}

export type WebviewPanelHandle = string;

export interface WebviewPanelShowOptions {
	readonly viewColumn?: EditorViewColumn;
	readonly preserveFocus?: boolean;
}

export interface MainThreadWebviewsShape extends IDisposable {
	$createWebviewPanel(handle: WebviewPanelHandle, viewType: string, title: string, showOptions: WebviewPanelShowOptions, options: modes.IWebviewPanelOptions & modes.IWebviewOptions, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): void;
	$disposeWebview(handle: WebviewPanelHandle): void;
	$reveal(handle: WebviewPanelHandle, showOptions: WebviewPanelShowOptions): void;
	$setTitle(handle: WebviewPanelHandle, value: string): void;
	$setIconPath(handle: WebviewPanelHandle, value: { light: UriComponents, dark: UriComponents } | undefined): void;

	$setHtml(handle: WebviewPanelHandle, value: string): void;
	$setOptions(handle: WebviewPanelHandle, options: modes.IWebviewOptions): void;
	$postMessage(handle: WebviewPanelHandle, value: any): Promise<boolean>;

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
	$startFileSearch(includePattern: string | null, includeFolder: UriComponents | null, excludePatternOrDisregardExcludes: string | false | null, maxResults: number | null, token: CancellationToken): Promise<UriComponents[] | null>;
	$startTextSearch(query: search.IPatternInfo, options: ITextQueryBuilderOptions, requestId: number, token: CancellationToken): Promise<ITextSearchComplete>;
	$checkExists(folders: UriComponents[], includes: string[], token: CancellationToken): Promise<boolean>;
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
	$onFileSystemChange(handle: number, resource: IFileChangeDto[]): void;

	$stat(uri: UriComponents): Promise<files.IStat>;
	$readdir(resource: UriComponents): Promise<[string, files.FileType][]>;
	$readFile(resource: UriComponents): Promise<VSBuffer>;
	$writeFile(resource: UriComponents, content: VSBuffer): Promise<void>;
	$rename(resource: UriComponents, target: UriComponents, opts: files.FileOverwriteOptions): Promise<void>;
	$copy(resource: UriComponents, target: UriComponents, opts: files.FileOverwriteOptions): Promise<void>;
	$mkdir(resource: UriComponents): Promise<void>;
	$delete(resource: UriComponents, opts: files.FileDeleteOptions): Promise<void>;
}

export interface MainThreadLabelServiceShape extends IDisposable {
	$registerResourceLabelFormatter(handle: number, formatter: ResourceLabelFormatter): void;
	$unregisterResourceLabelFormatter(handle: number): void;
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
	$registerTaskProvider(handle: number, type: string): Promise<void>;
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
	statusBarCommands?: ICommandDto[];
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
	$registerBreakpoints(breakpoints: Array<ISourceMultiBreakpointDto | IFunctionBreakpointDto | IDataBreakpointDto>): Promise<void>;
	$unregisterBreakpoints(breakpointIds: string[], functionBreakpointIds: string[], dataBreakpointIds: string[]): Promise<void>;
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
	$acceptMarkersChange(data: [UriComponents, IMarkerData[]][]): void;
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

export interface ExtHostLabelServiceShape {
	$registerResourceLabelFormatter(formatter: ResourceLabelFormatter): IDisposable;
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
	value: ResolverResult;
}

export type IResolveAuthorityResult = IResolveAuthorityErrorResult | IResolveAuthorityOKResult;

export interface ExtHostExtensionServiceShape {
	$resolveAuthority(remoteAuthority: string, resolveAttempt: number): Promise<IResolveAuthorityResult>;
	$startExtensionHost(enabledExtensionIds: ExtensionIdentifier[]): Promise<void>;
	$activateByEvent(activationEvent: string): Promise<void>;
	$activate(extensionId: ExtensionIdentifier, activationEvent: string): Promise<boolean>;
	$setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void>;

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

export interface ISuggestDataDto {
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

export interface ISuggestResultDto {
	x?: number;
	a: IRange;
	b: ISuggestDataDto[];
	c?: boolean;
}

export interface ISignatureHelpDto {
	id: CacheId;
	signatures: modes.SignatureInformation[];
	activeSignature: number;
	activeParameter: number;
}

export interface ISignatureHelpContextDto {
	readonly triggerKind: modes.SignatureHelpTriggerKind;
	readonly triggerCharacter?: string;
	readonly isRetrigger: boolean;
	readonly activeSignatureHelp?: ISignatureHelpDto;
}

export interface ILocationDto {
	uri: UriComponents;
	range: IRange;
}

export interface IDefinitionLinkDto {
	originSelectionRange?: IRange;
	uri: UriComponents;
	range: IRange;
	targetSelectionRange?: IRange;
}

export interface IWorkspaceSymbolDto extends IdObject {
	name: string;
	containerName?: string;
	kind: modes.SymbolKind;
	location: ILocationDto;
}

export interface IWorkspaceSymbolsDto extends IdObject {
	symbols: IWorkspaceSymbolDto[];
}

export interface IResourceFileEditDto {
	oldUri?: UriComponents;
	newUri?: UriComponents;
	options?: {
		overwrite?: boolean;
		ignoreIfExists?: boolean;
		ignoreIfNotExists?: boolean;
		recursive?: boolean;
	};
}

export interface IResourceTextEditDto {
	resource: UriComponents;
	modelVersionId?: number;
	edits: modes.TextEdit[];
}

export interface IWorkspaceEditDto {
	edits: Array<IResourceFileEditDto | IResourceTextEditDto>;

	// todo@joh reject should go into rename
	rejectReason?: string;
}

export function reviveWorkspaceEditDto(data: IWorkspaceEditDto | undefined): modes.WorkspaceEdit {
	if (data && data.edits) {
		for (const edit of data.edits) {
			if (typeof (<IResourceTextEditDto>edit).resource === 'object') {
				(<IResourceTextEditDto>edit).resource = URI.revive((<IResourceTextEditDto>edit).resource);
			} else {
				(<IResourceFileEditDto>edit).newUri = URI.revive((<IResourceFileEditDto>edit).newUri);
				(<IResourceFileEditDto>edit).oldUri = URI.revive((<IResourceFileEditDto>edit).oldUri);
			}
		}
	}
	return <modes.WorkspaceEdit>data;
}

export type ICommandDto = ObjectIdentifier & modes.Command;

export interface ICodeActionDto {
	title: string;
	edit?: IWorkspaceEditDto;
	diagnostics?: IMarkerData[];
	command?: ICommandDto;
	kind?: string;
	isPreferred?: boolean;
}

export interface ICodeActionListDto {
	cacheId: number;
	actions: ReadonlyArray<ICodeActionDto>;
}

export type CacheId = number;
export type ChainedCacheId = [CacheId, CacheId];

export interface ILinksListDto {
	id?: CacheId;
	links: ILinkDto[];
}

export interface ILinkDto {
	cacheId?: ChainedCacheId;
	range: IRange;
	url?: string | UriComponents;
	tooltip?: string;
}

export interface ICodeLensListDto {
	cacheId?: number;
	lenses: ICodeLensDto[];
}

export interface ICodeLensDto {
	cacheId?: ChainedCacheId;
	range: IRange;
	command?: ICommandDto;
}

export interface ICallHierarchyDto {
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
	$provideCodeLenses(handle: number, resource: UriComponents, token: CancellationToken): Promise<ICodeLensListDto | undefined>;
	$resolveCodeLens(handle: number, symbol: ICodeLensDto, token: CancellationToken): Promise<ICodeLensDto | undefined>;
	$releaseCodeLenses(handle: number, id: number): void;
	$provideDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<IDefinitionLinkDto[]>;
	$provideDeclaration(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<IDefinitionLinkDto[]>;
	$provideImplementation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<IDefinitionLinkDto[]>;
	$provideTypeDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<IDefinitionLinkDto[]>;
	$provideHover(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.Hover | undefined>;
	$provideDocumentHighlights(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DocumentHighlight[] | undefined>;
	$provideReferences(handle: number, resource: UriComponents, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Promise<ILocationDto[] | undefined>;
	$provideCodeActions(handle: number, resource: UriComponents, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Promise<ICodeActionListDto | undefined>;
	$releaseCodeActions(handle: number, cacheId: number): void;
	$provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideWorkspaceSymbols(handle: number, search: string, token: CancellationToken): Promise<IWorkspaceSymbolsDto>;
	$resolveWorkspaceSymbol(handle: number, symbol: IWorkspaceSymbolDto, token: CancellationToken): Promise<IWorkspaceSymbolDto | undefined>;
	$releaseWorkspaceSymbols(handle: number, id: number): void;
	$provideRenameEdits(handle: number, resource: UriComponents, position: IPosition, newName: string, token: CancellationToken): Promise<IWorkspaceEditDto | undefined>;
	$resolveRenameLocation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.RenameLocation | undefined>;
	$provideCompletionItems(handle: number, resource: UriComponents, position: IPosition, context: modes.CompletionContext, token: CancellationToken): Promise<ISuggestResultDto | undefined>;
	$resolveCompletionItem(handle: number, resource: UriComponents, position: IPosition, id: ChainedCacheId, token: CancellationToken): Promise<ISuggestDataDto | undefined>;
	$releaseCompletionItems(handle: number, id: number): void;
	$provideSignatureHelp(handle: number, resource: UriComponents, position: IPosition, context: modes.SignatureHelpContext, token: CancellationToken): Promise<ISignatureHelpDto | undefined>;
	$releaseSignatureHelp(handle: number, id: number): void;
	$provideDocumentLinks(handle: number, resource: UriComponents, token: CancellationToken): Promise<ILinksListDto | undefined>;
	$resolveDocumentLink(handle: number, id: ChainedCacheId, token: CancellationToken): Promise<ILinkDto | undefined>;
	$releaseDocumentLinks(handle: number, id: number): void;
	$provideDocumentColors(handle: number, resource: UriComponents, token: CancellationToken): Promise<IRawColorInfo[]>;
	$provideColorPresentations(handle: number, resource: UriComponents, colorInfo: IRawColorInfo, token: CancellationToken): Promise<modes.IColorPresentation[] | undefined>;
	$provideFoldingRanges(handle: number, resource: UriComponents, context: modes.FoldingContext, token: CancellationToken): Promise<modes.FoldingRange[] | undefined>;
	$provideSelectionRanges(handle: number, resource: UriComponents, positions: IPosition[], token: CancellationToken): Promise<modes.SelectionRange[][]>;
	$provideCallHierarchyItem(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ICallHierarchyDto | undefined>;
	$resolveCallHierarchyItem(handle: number, item: callHierarchy.CallHierarchyItem, direction: callHierarchy.CallHierarchyDirection, token: CancellationToken): Promise<[ICallHierarchyDto, modes.Location[]][]>;
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

export interface IShellLaunchConfigDto {
	name?: string;
	executable?: string;
	args?: string[] | string;
	cwd?: string | UriComponents;
	env?: { [key: string]: string | null };
}

export interface IShellDefinitionDto {
	label: string;
	path: string;
}

export interface IShellAndArgsDto {
	shell: string;
	args: string[] | string | undefined;
}

export interface ITerminalDimensionsDto {
	columns: number;
	rows: number;
}

export interface ExtHostTerminalServiceShape {
	$acceptTerminalClosed(id: number): void;
	$acceptTerminalOpened(id: number, name: string): void;
	$acceptActiveTerminalChanged(id: number | null): void;
	$acceptTerminalProcessId(id: number, processId: number): void;
	/** @deprecated */
	$acceptTerminalProcessData(id: number, data: string): void;
	$acceptTerminalProcessData2(id: number, data: string): void;
	$acceptTerminalTitleChange(id: number, name: string): void;
	$acceptTerminalDimensions(id: number, cols: number, rows: number): void;
	$acceptTerminalMaximumDimensions(id: number, cols: number, rows: number): void;
	$spawnExtHostProcess(id: number, shellLaunchConfig: IShellLaunchConfigDto, activeWorkspaceRootUri: UriComponents, cols: number, rows: number, isWorkspaceShellAllowed: boolean): void;
	$startExtensionTerminal(id: number, initialDimensions: ITerminalDimensionsDto | undefined): void;
	$acceptProcessInput(id: number, data: string): void;
	$acceptProcessResize(id: number, cols: number, rows: number): void;
	$acceptProcessShutdown(id: number, immediate: boolean): void;
	$acceptProcessRequestInitialCwd(id: number): void;
	$acceptProcessRequestCwd(id: number): void;
	$acceptProcessRequestLatency(id: number): number;
	$acceptWorkspacePermissionsChanged(isAllowed: boolean): void;
	$requestAvailableShells(): Promise<IShellDefinitionDto[]>;
	$requestDefaultShellAndArgs(useAutomationShell: boolean): Promise<IShellAndArgsDto>;
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
	$resolveTask(handle: number, taskDTO: tasks.TaskDTO): Thenable<tasks.TaskDTO | undefined>;
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

export interface IDataBreakpointDto extends IBreakpointDto {
	type: 'data';
	dataId: string;
	canPersist: boolean;
	label: string;
}

export interface ISourceBreakpointDto extends IBreakpointDto {
	type: 'source';
	uri: UriComponents;
	line: number;
	character: number;
}

export interface IBreakpointsDeltaDto {
	added?: Array<ISourceBreakpointDto | IFunctionBreakpointDto | IDataBreakpointDto>;
	removed?: string[];
	changed?: Array<ISourceBreakpointDto | IFunctionBreakpointDto | IDataBreakpointDto>;
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
	$runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments): Promise<number | undefined>;
	$startDASession(handle: number, session: IDebugSessionDto): Promise<void>;
	$stopDASession(handle: number): Promise<void>;
	$sendDAMessage(handle: number, message: DebugProtocol.ProtocolMessage): void;
	$resolveDebugConfiguration(handle: number, folder: UriComponents | undefined, debugConfiguration: IConfig, token: CancellationToken): Promise<IConfig | null | undefined>;
	$provideDebugConfigurations(handle: number, folder: UriComponents | undefined, token: CancellationToken): Promise<IConfig[]>;
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
	$createCommentThreadTemplate(commentControllerHandle: number, uriComponents: UriComponents, range: IRange): void;
	$updateCommentThreadTemplate(commentControllerHandle: number, threadHandle: number, range: IRange): Promise<void>;
	$deleteCommentThread(commentControllerHandle: number, commentThreadHandle: number): void;
	$provideCommentingRanges(commentControllerHandle: number, uriComponents: UriComponents, token: CancellationToken): Promise<IRange[] | undefined>;
	$toggleReaction(commentControllerHandle: number, threadHandle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void>;
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
	MainThreadEditorInsets: createMainId<MainThreadEditorInsetsShape>('MainThreadEditorInsets'),
	MainThreadErrors: createMainId<MainThreadErrorsShape>('MainThreadErrors'),
	MainThreadTreeViews: createMainId<MainThreadTreeViewsShape>('MainThreadTreeViews'),
	MainThreadDownloadService: createMainId<MainThreadDownloadServiceShape>('MainThreadDownloadService'),
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
	MainThreadLabelService: createMainId<MainThreadLabelServiceShape>('MainThreadLabelService')
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
	ExtHostEditorInsets: createExtId<ExtHostEditorInsetsShape>('ExtHostEditorInsets'),
	ExtHostProgress: createMainId<ExtHostProgressShape>('ExtHostProgress'),
	ExtHostComments: createMainId<ExtHostCommentsShape>('ExtHostComments'),
	ExtHostStorage: createMainId<ExtHostStorageShape>('ExtHostStorage'),
	ExtHostUrls: createExtId<ExtHostUrlsShape>('ExtHostUrls'),
	ExtHostOutputService: createMainId<ExtHostOutputServiceShape>('ExtHostOutputService'),
	ExtHosLabelService: createMainId<ExtHostLabelServiceShape>('ExtHostLabelService')
};
