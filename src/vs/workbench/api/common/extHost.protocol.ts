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
import { revive } from 'vs/base/common/marshalling';
import * as performance from 'vs/base/common/performance';
import Severity from 'vs/base/common/severity';
import { URI, UriComponents } from 'vs/base/common/uri';
import { RenderLineNumbersType, TextEditorCursorStyle } from 'vs/editor/common/config/editorOptions';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { ILineChange } from 'vs/editor/common/diff/smartLinesDiffComputer';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as languages from 'vs/editor/common/languages';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { CharacterPair, CommentRule, EnterAction } from 'vs/editor/common/languages/languageConfiguration';
import { EndOfLineSequence } from 'vs/editor/common/model';
import { IModelChangedEvent } from 'vs/editor/common/model/mirrorTextModel';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { ConfigurationTarget, IConfigurationChange, IConfigurationData, IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IExtensionIdWithVersion } from 'vs/platform/extensionManagement/common/extensionStorage';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as files from 'vs/platform/files/common/files';
import { ResourceLabelFormatter } from 'vs/platform/label/common/label';
import { ILoggerOptions, LogLevel } from 'vs/platform/log/common/log';
import { IMarkerData } from 'vs/platform/markers/common/markers';
import { IProgressOptions, IProgressStep } from 'vs/platform/progress/common/progress';
import * as quickInput from 'vs/platform/quickinput/common/quickInput';
import { IRemoteConnectionData, TunnelDescription } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { ICreateContributedTerminalProfileOptions, IProcessProperty, IShellLaunchConfigDto, ITerminalEnvironment, ITerminalLaunchError, ITerminalProfile, TerminalExitReason, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { ThemeColor, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ProvidedPortAttributes, TunnelCreationOptions, TunnelOptions, TunnelPrivacyId, TunnelProviderFeatures } from 'vs/platform/tunnel/common/tunnel';
import { WorkspaceTrustRequestOptions } from 'vs/platform/workspace/common/workspaceTrust';
import * as tasks from 'vs/workbench/api/common/shared/tasks';
import { SaveReason } from 'vs/workbench/common/editor';
import { IRevealOptions, ITreeItem, IViewBadge } from 'vs/workbench/common/views';
import { CallHierarchyItem } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { DebugConfigurationProviderTriggerKind, IAdapterDescriptor, IConfig, IDebugSessionReplMode } from 'vs/workbench/contrib/debug/common/debug';
import * as notebookCommon from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { ICellExecutionComplete, ICellExecutionStateUpdate } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { OutputChannelUpdateMode } from 'vs/workbench/services/output/common/output';
import { InputValidationType } from 'vs/workbench/contrib/scm/common/scm';
import { IWorkspaceSymbol } from 'vs/workbench/contrib/search/common/search';
import { ISerializableEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { CoverageDetails, ExtensionRunTestsRequest, IFileCoverage, ISerializedTestResults, ITestItem, ITestMessage, ITestRunProfile, ITestRunTask, ResolvedTestRunRequest, RunTestForControllerRequest, TestResultState, TestsDiffOp } from 'vs/workbench/contrib/testing/common/testTypes';
import { Timeline, TimelineChangeEvent, TimelineOptions, TimelineProviderDescriptor } from 'vs/workbench/contrib/timeline/common/timeline';
import { TypeHierarchyItem } from 'vs/workbench/contrib/typeHierarchy/common/typeHierarchy';
import { AuthenticationProviderInformation, AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vs/workbench/services/authentication/common/authentication';
import { EditorGroupColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { IExtensionDescriptionDelta, IStaticWorkspaceData } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IResolveAuthorityResult } from 'vs/workbench/services/extensions/common/extensionHostProxy';
import { ActivationKind, ExtensionActivationReason, MissingExtensionDependency } from 'vs/workbench/services/extensions/common/extensions';
import { createProxyIdentifier, Dto, IRPCProtocol, SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { ILanguageStatus } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { CandidatePort } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { ITextQueryBuilderOptions } from 'vs/workbench/services/search/common/queryBuilder';
import * as search from 'vs/workbench/services/search/common/search';

export interface IWorkspaceData extends IStaticWorkspaceData {
	folders: { uri: UriComponents; name: string; index: number }[];
}

export interface IConfigurationInitData extends IConfigurationData {
	configurationScopes: [string, ConfigurationScope | undefined][];
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
	$fireCommandActivationEvent(id: string): void;
	$executeCommand(id: string, args: any[] | SerializableObjectWithBuffers<any[]>, retry: boolean): Promise<unknown | undefined>;
	$getCommands(): Promise<string[]>;
}

export interface CommentProviderFeatures {
	reactionGroup?: languages.CommentReaction[];
	reactionHandler?: boolean;
	options?: languages.CommentOptions;
}

export interface CommentChanges {
	readonly uniqueIdInThread: number;
	readonly body: string | IMarkdownString;
	readonly userName: string;
	readonly userIconPath?: string;
	readonly contextValue?: string;
	readonly commentReactions?: languages.CommentReaction[];
	readonly label?: string;
	readonly mode?: languages.CommentMode;
	readonly timestamp?: string;
}

export type CommentThreadChanges<T = IRange> = Partial<{
	range: T;
	label: string;
	contextValue: string | null;
	comments: CommentChanges[];
	collapseState: languages.CommentThreadCollapsibleState;
	canReply: boolean;
	state: languages.CommentThreadState;
	isTemplate: boolean;
}>;

export interface MainThreadCommentsShape extends IDisposable {
	$registerCommentController(handle: number, id: string, label: string): void;
	$unregisterCommentController(handle: number): void;
	$updateCommentControllerFeatures(handle: number, features: CommentProviderFeatures): void;
	$createCommentThread(handle: number, commentThreadHandle: number, threadId: string, resource: UriComponents, range: IRange | ICellRange, extensionId: ExtensionIdentifier, isTemplate: boolean): languages.CommentThread<IRange | ICellRange> | undefined;
	$updateCommentThread(handle: number, commentThreadHandle: number, threadId: string, resource: UriComponents, changes: CommentThreadChanges): void;
	$deleteCommentThread(handle: number, commentThreadHandle: number): void;
	$updateCommentingRanges(handle: number): void;
}

export interface MainThreadAuthenticationShape extends IDisposable {
	$registerAuthenticationProvider(id: string, label: string, supportsMultipleAccounts: boolean): void;
	$unregisterAuthenticationProvider(id: string): void;
	$ensureProvider(id: string): Promise<void>;
	$sendDidChangeSessions(providerId: string, event: AuthenticationSessionsChangeEvent): void;
	$getSession(providerId: string, scopes: readonly string[], extensionId: string, extensionName: string, options: { createIfNone?: boolean; forceNewSession?: boolean | { detail: string }; clearSessionPreference?: boolean }): Promise<AuthenticationSession | undefined>;
	$removeSession(providerId: string, sessionId: string): Promise<void>;
}

export interface MainThreadSecretStateShape extends IDisposable {
	$getPassword(extensionId: string, key: string): Promise<string | undefined>;
	$setPassword(extensionId: string, key: string, value: string): Promise<void>;
	$deletePassword(extensionId: string, key: string): Promise<void>;
}

export interface MainThreadConfigurationShape extends IDisposable {
	$updateConfigurationOption(target: ConfigurationTarget | null, key: string, value: any, overrides: IConfigurationOverrides | undefined, scopeToLanguage: boolean | undefined): Promise<void>;
	$removeConfigurationOption(target: ConfigurationTarget | null, key: string, overrides: IConfigurationOverrides | undefined, scopeToLanguage: boolean | undefined): Promise<void>;
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
	title?: string;
}

export interface MainThreadDialogSaveOptions {
	defaultUri?: UriComponents;
	saveLabel?: string;
	filters?: { [name: string]: string[] };
	title?: string;
}

export interface MainThreadDiaglogsShape extends IDisposable {
	$showOpenDialog(options?: MainThreadDialogOpenOptions): Promise<UriComponents[] | undefined>;
	$showSaveDialog(options?: MainThreadDialogSaveOptions): Promise<UriComponents | undefined>;
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
	$tryCreateDocument(options?: { language?: string; content?: string }): Promise<UriComponents>;
	$tryOpenDocument(uri: UriComponents): Promise<UriComponents>;
	$trySaveDocument(uri: UriComponents): Promise<boolean>;
}

export interface ITextEditorConfigurationUpdate {
	tabSize?: number | 'auto';
	insertSpaces?: boolean | 'auto';
	cursorStyle?: TextEditorCursorStyle;
	lineNumbers?: RenderLineNumbersType;
}

export interface IResolvedTextEditorConfiguration {
	tabSize: number;
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
	position?: EditorGroupColumn;
	preserveFocus?: boolean;
	pinned?: boolean;
	selection?: IRange;
}

export interface MainThreadBulkEditsShape extends IDisposable {
	$tryApplyWorkspaceEdit(workspaceEditDto: IWorkspaceEditDto, undoRedoGroupId?: number): Promise<boolean>;
}

export interface MainThreadTextEditorsShape extends IDisposable {
	$tryShowTextDocument(resource: UriComponents, options: ITextDocumentShowOptions): Promise<string | undefined>;
	$registerTextEditorDecorationType(extensionId: ExtensionIdentifier, key: string, options: editorCommon.IDecorationRenderOptions): void;
	$removeTextEditorDecorationType(key: string): void;
	$tryShowEditor(id: string, position: EditorGroupColumn): Promise<void>;
	$tryHideEditor(id: string): Promise<void>;
	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): Promise<void>;
	$trySetDecorations(id: string, key: string, ranges: editorCommon.IDecorationOptions[]): Promise<void>;
	$trySetDecorationsFast(id: string, key: string, ranges: number[]): Promise<void>;
	$tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): Promise<void>;
	$trySetSelections(id: string, selections: ISelection[]): Promise<void>;
	$tryApplyEdits(id: string, modelVersionId: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): Promise<boolean>;
	$tryInsertSnippet(id: string, modelVersionId: number, template: string, selections: readonly IRange[], opts: IUndoStopOptions): Promise<boolean>;
	$getDiffInformation(id: string): Promise<ILineChange[]>;
}

export interface MainThreadTreeViewsShape extends IDisposable {
	$registerTreeViewDataProvider(treeViewId: string, options: { showCollapseAll: boolean; canSelectMany: boolean; dropMimeTypes: readonly string[]; dragMimeTypes: readonly string[]; hasHandleDrag: boolean; hasHandleDrop: boolean }): Promise<void>;
	$refresh(treeViewId: string, itemsToRefresh?: { [treeItemHandle: string]: ITreeItem }): Promise<void>;
	$reveal(treeViewId: string, itemInfo: { item: ITreeItem; parentChain: ITreeItem[] } | undefined, options: IRevealOptions): Promise<void>;
	$setMessage(treeViewId: string, message: string): void;
	$setTitle(treeViewId: string, title: string, description: string | undefined): void;
	$setBadge(treeViewId: string, badge: IViewBadge | undefined): void;
	$resolveDropFileData(destinationViewId: string, requestId: number, dataItemIndex: number): Promise<VSBuffer>;
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
	$findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
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
	previousLineText?: IRegExpDto;
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

export type GlobPattern = string | IRelativePattern;

export interface IRelativePatternDto extends IRelativePattern {
	baseUri: UriComponents;
}

export interface IDocumentFilterDto {
	$serialized: true;
	language?: string;
	scheme?: string;
	pattern?: string | IRelativePattern;
	exclusive?: boolean;
	notebookType?: string;
}

export interface ISignatureHelpProviderMetadataDto {
	readonly triggerCharacters: readonly string[];
	readonly retriggerCharacters: readonly string[];
}

export interface IdentifiableInlineCompletions extends languages.InlineCompletions<IdentifiableInlineCompletion> {
	pid: number;
}

export interface IdentifiableInlineCompletion extends languages.InlineCompletion {
	idx: number;
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
	$registerEvaluatableExpressionProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerInlineValuesProvider(handle: number, selector: IDocumentFilterDto[], eventHandle: number | undefined): void;
	$emitInlineValuesEvent(eventHandle: number, event?: any): void;
	$registerDocumentHighlightProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerLinkedEditingRangeProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerReferenceSupport(handle: number, selector: IDocumentFilterDto[]): void;
	$registerQuickFixSupport(handle: number, selector: IDocumentFilterDto[], metadata: ICodeActionProviderMetadataDto, displayName: string, supportsResolve: boolean): void;
	$registerPasteEditProvider(handle: number, selector: IDocumentFilterDto[], supportsCopy: boolean, pasteMimeTypes: readonly string[]): void;
	$registerDocumentFormattingSupport(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, displayName: string): void;
	$registerRangeFormattingSupport(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, displayName: string): void;
	$registerOnTypeFormattingSupport(handle: number, selector: IDocumentFilterDto[], autoFormatTriggerCharacters: string[], extensionId: ExtensionIdentifier): void;
	$registerNavigateTypeSupport(handle: number, supportsResolve: boolean): void;
	$registerRenameSupport(handle: number, selector: IDocumentFilterDto[], supportsResolveInitialValues: boolean): void;
	$registerDocumentSemanticTokensProvider(handle: number, selector: IDocumentFilterDto[], legend: languages.SemanticTokensLegend, eventHandle: number | undefined): void;
	$emitDocumentSemanticTokensEvent(eventHandle: number): void;
	$registerDocumentRangeSemanticTokensProvider(handle: number, selector: IDocumentFilterDto[], legend: languages.SemanticTokensLegend): void;
	$registerCompletionsProvider(handle: number, selector: IDocumentFilterDto[], triggerCharacters: string[], supportsResolveDetails: boolean, displayName: string): void;
	$registerInlineCompletionsSupport(handle: number, selector: IDocumentFilterDto[], supportsHandleDidShowCompletionItem: boolean): void;
	$registerSignatureHelpProvider(handle: number, selector: IDocumentFilterDto[], metadata: ISignatureHelpProviderMetadataDto): void;
	$registerInlayHintsProvider(handle: number, selector: IDocumentFilterDto[], supportsResolve: boolean, eventHandle: number | undefined, displayName: string | undefined): void;
	$emitInlayHintsEvent(eventHandle: number): void;
	$registerDocumentLinkProvider(handle: number, selector: IDocumentFilterDto[], supportsResolve: boolean): void;
	$registerDocumentColorProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerFoldingRangeProvider(handle: number, selector: IDocumentFilterDto[], eventHandle: number | undefined): void;
	$emitFoldingRangeEvent(eventHandle: number, event?: any): void;
	$registerSelectionRangeProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerCallHierarchyProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerTypeHierarchyProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$registerDocumentOnDropEditProvider(handle: number, selector: IDocumentFilterDto[]): void;
	$resolvePasteFileData(handle: number, requestId: number, dataIndex: number): Promise<VSBuffer>;
	$resolveDocumentOnDropFileData(handle: number, requestId: number, dataIndex: number): Promise<VSBuffer>;
	$setLanguageConfiguration(handle: number, languageId: string, configuration: ILanguageConfigurationDto): void;
}

export interface MainThreadLanguagesShape extends IDisposable {
	$changeLanguage(resource: UriComponents, languageId: string): Promise<void>;
	$tokensAtPosition(resource: UriComponents, position: IPosition): Promise<undefined | { type: StandardTokenType; range: IRange }>;
	$setLanguageStatus(handle: number, status: ILanguageStatus): void;
	$removeLanguageStatus(handle: number): void;
}

export interface MainThreadMessageOptions {
	source?: { identifier: ExtensionIdentifier; label: string };
	modal?: boolean;
	detail?: string;
	useCustom?: boolean;
}

export interface MainThreadMessageServiceShape extends IDisposable {
	$showMessage(severity: Severity, message: string, options: MainThreadMessageOptions, commands: { title: string; isCloseAffordance: boolean; handle: number }[]): Promise<number | undefined>;
}

export interface MainThreadOutputServiceShape extends IDisposable {
	$register(label: string, log: boolean, file: UriComponents, languageId: string | undefined, extensionId: string): Promise<string>;
	$update(channelId: string, mode: OutputChannelUpdateMode, till?: number): Promise<void>;
	$reveal(channelId: string, preserveFocus: boolean): Promise<void>;
	$close(channelId: string): Promise<void>;
	$dispose(channelId: string): Promise<void>;
}

export interface MainThreadProgressShape extends IDisposable {

	$startProgress(handle: number, options: IProgressOptions, extensionId?: string): Promise<void>;
	$progressReport(handle: number, message: IProgressStep): void;
	$progressEnd(handle: number): void;
}

/**
 * A terminal that is created on the extension host side is temporarily assigned
 * a UUID by the extension host that created it. Once the renderer side has assigned
 * a real numeric id, the numeric id will be used.
 *
 * All other terminals (that are not created on the extension host side) always
 * use the numeric id.
 */
export type ExtHostTerminalIdentifier = number | string;

export interface TerminalLaunchConfig {
	name?: string;
	shellPath?: string;
	shellArgs?: string[] | string;
	cwd?: string | UriComponents;
	env?: ITerminalEnvironment;
	icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	color?: string;
	initialText?: string;
	waitOnExit?: boolean;
	strictEnv?: boolean;
	hideFromUser?: boolean;
	isExtensionCustomPtyTerminal?: boolean;
	isFeatureTerminal?: boolean;
	isExtensionOwnedTerminal?: boolean;
	useShellEnvironment?: boolean;
	location?: TerminalLocation | { viewColumn: number; preserveFocus?: boolean } | { parentTerminal: ExtHostTerminalIdentifier } | { splitActiveTerminal: boolean };
	isTransient?: boolean;
}

export interface MainThreadTerminalServiceShape extends IDisposable {
	$createTerminal(extHostTerminalId: string, config: TerminalLaunchConfig): Promise<void>;
	$dispose(id: ExtHostTerminalIdentifier): void;
	$hide(id: ExtHostTerminalIdentifier): void;
	$sendText(id: ExtHostTerminalIdentifier, text: string, addNewLine: boolean): void;
	$show(id: ExtHostTerminalIdentifier, preserveFocus: boolean): void;
	$startSendingDataEvents(): void;
	$stopSendingDataEvents(): void;
	$startLinkProvider(): void;
	$stopLinkProvider(): void;
	$registerProcessSupport(isSupported: boolean): void;
	$registerProfileProvider(id: string, extensionIdentifier: string): void;
	$unregisterProfileProvider(id: string): void;
	$setEnvironmentVariableCollection(extensionIdentifier: string, persistent: boolean, collection: ISerializableEnvironmentVariableCollection | undefined): void;

	// Process
	$sendProcessData(terminalId: number, data: string): void;
	$sendProcessReady(terminalId: number, pid: number, cwd: string): void;
	$sendProcessProperty(terminalId: number, property: IProcessProperty<any>): void;
	$sendProcessExit(terminalId: number, exitCode: number | undefined): void;
}

export type TransferQuickPickItemOrSeparator = TransferQuickPickItem | quickInput.IQuickPickSeparator;
export interface TransferQuickPickItem {
	handle: number;

	// shared properties from IQuickPickItem
	type?: 'item';
	label: string;
	description?: string;
	detail?: string;
	picked?: boolean;
	alwaysShow?: boolean;
	buttons?: TransferQuickInputButton[];
}

export interface TransferQuickInputButton extends quickInput.IQuickInputButton {
	handle: number;
}

export type TransferQuickInput = TransferQuickPick | TransferInputBox;

export interface BaseTransferQuickInput {

	[key: string]: any;

	id: number;

	title?: string;

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

	items?: TransferQuickPickItemOrSeparator[];

	activeItems?: number[];

	selectedItems?: number[];

	canSelectMany?: boolean;

	ignoreFocusOut?: boolean;

	matchOnDescription?: boolean;

	matchOnDetail?: boolean;

	sortByLabel?: boolean;
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
	title?: string;
	value?: string;
	valueSelection?: [number, number];
	prompt?: string;
	placeHolder?: string;
	password?: boolean;
	ignoreFocusOut?: boolean;
}

export interface MainThreadQuickOpenShape extends IDisposable {
	$show(instance: number, options: quickInput.IPickOptions<TransferQuickPickItem>, token: CancellationToken): Promise<number | number[] | undefined>;
	$setItems(instance: number, items: TransferQuickPickItemOrSeparator[]): Promise<void>;
	$setError(instance: number, error: Error): Promise<void>;
	$input(options: IInputBoxOptions | undefined, validateInput: boolean, token: CancellationToken): Promise<string | undefined>;
	$createOrUpdate(params: TransferQuickInput): Promise<void>;
	$dispose(id: number): Promise<void>;
}

export interface MainThreadStatusBarShape extends IDisposable {
	$setEntry(id: number, statusId: string, statusName: string, text: string, tooltip: IMarkdownString | string | undefined, command: ICommandDto | undefined, color: string | ThemeColor | undefined, backgroundColor: string | ThemeColor | undefined, alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation | undefined): void;
	$dispose(id: number): void;
}

export interface MainThreadStorageShape extends IDisposable {
	$initializeExtensionStorage(shared: boolean, extensionId: string): Promise<object | undefined>;
	$setValue(shared: boolean, extensionId: string, value: object): Promise<void>;
	$registerExtensionStorageKeysToSync(extension: IExtensionIdWithVersion, keys: string[]): void;
}

export interface MainThreadTelemetryShape extends IDisposable {
	$publicLog(eventName: string, data?: any): void;
	$publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void;
	$logTelemetryToOutputChannel(eventName: string, data: Record<string, any>): void;
}

export interface MainThreadEditorInsetsShape extends IDisposable {
	$createEditorInset(handle: number, id: string, uri: UriComponents, line: number, height: number, options: IWebviewContentOptions, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): Promise<void>;
	$disposeEditorInset(handle: number): void;

	$setHtml(handle: number, value: string): void;
	$setOptions(handle: number, options: IWebviewContentOptions): void;
	$postMessage(handle: number, value: any): Promise<boolean>;
}

export interface ExtHostEditorInsetsShape {
	$onDidDispose(handle: number): void;
	$onDidReceiveMessage(handle: number, message: any): void;
}

//#region --- tabs model

export const enum TabInputKind {
	UnknownInput,
	TextInput,
	TextDiffInput,
	TextMergeInput,
	NotebookInput,
	NotebookDiffInput,
	CustomEditorInput,
	WebviewEditorInput,
	TerminalEditorInput,
	InteractiveEditorInput,
}

export const enum TabModelOperationKind {
	TAB_OPEN,
	TAB_CLOSE,
	TAB_UPDATE,
	TAB_MOVE
}

export interface UnknownInputDto {
	kind: TabInputKind.UnknownInput;
}

export interface TextInputDto {
	kind: TabInputKind.TextInput;
	uri: UriComponents;
}

export interface TextDiffInputDto {
	kind: TabInputKind.TextDiffInput;
	original: UriComponents;
	modified: UriComponents;
}

export interface TextMergeInputDto {
	kind: TabInputKind.TextMergeInput;
	base: UriComponents;
	input1: UriComponents;
	input2: UriComponents;
	result: UriComponents;
}

export interface NotebookInputDto {
	kind: TabInputKind.NotebookInput;
	notebookType: string;
	uri: UriComponents;
}

export interface NotebookDiffInputDto {
	kind: TabInputKind.NotebookDiffInput;
	notebookType: string;
	original: UriComponents;
	modified: UriComponents;
}

export interface CustomInputDto {
	kind: TabInputKind.CustomEditorInput;
	viewType: string;
	uri: UriComponents;
}

export interface WebviewInputDto {
	kind: TabInputKind.WebviewEditorInput;
	viewType: string;
}

export interface InteractiveEditorInputDto {
	kind: TabInputKind.InteractiveEditorInput;
	uri: UriComponents;
	inputBoxUri: UriComponents;
}

export interface TabInputDto {
	kind: TabInputKind.TerminalEditorInput;
}

export type AnyInputDto = UnknownInputDto | TextInputDto | TextDiffInputDto | TextMergeInputDto | NotebookInputDto | NotebookDiffInputDto | CustomInputDto | WebviewInputDto | InteractiveEditorInputDto | TabInputDto;

export interface MainThreadEditorTabsShape extends IDisposable {
	// manage tabs: move, close, rearrange etc
	$moveTab(tabId: string, index: number, viewColumn: EditorGroupColumn, preserveFocus?: boolean): void;
	$closeTab(tabIds: string[], preserveFocus?: boolean): Promise<boolean>;
	$closeGroup(groupIds: number[], preservceFocus?: boolean): Promise<boolean>;
}

export interface IEditorTabGroupDto {
	isActive: boolean;
	viewColumn: EditorGroupColumn;
	// Decided not to go with simple index here due to opening and closing causing index shifts
	// This allows us to patch the model without having to do full rebuilds
	tabs: IEditorTabDto[];
	groupId: number;
}

export interface TabOperation {
	readonly kind: TabModelOperationKind.TAB_OPEN | TabModelOperationKind.TAB_CLOSE | TabModelOperationKind.TAB_UPDATE | TabModelOperationKind.TAB_MOVE;
	// TODO @lramos15 Possibly get rid of index for tab update, it's only needed for open and close
	readonly index: number;
	readonly tabDto: IEditorTabDto;
	readonly groupId: number;
	readonly oldIndex?: number;
}

export interface IEditorTabDto {
	id: string;
	label: string;
	input: AnyInputDto;
	editorId?: string;
	isActive: boolean;
	isPinned: boolean;
	isPreview: boolean;
	isDirty: boolean;
}

export interface IExtHostEditorTabsShape {
	// Accepts a whole new model
	$acceptEditorTabModel(tabGroups: IEditorTabGroupDto[]): void;
	// Only when group property changes (not the tabs inside)
	$acceptTabGroupUpdate(groupDto: IEditorTabGroupDto): void;
	// When a tab is added, removed, or updated
	$acceptTabOperation(operation: TabOperation): void;
}

//#endregion

export type WebviewHandle = string;

export interface WebviewPanelShowOptions {
	readonly viewColumn?: EditorGroupColumn;
	readonly preserveFocus?: boolean;
}

export interface WebviewExtensionDescription {
	readonly id: ExtensionIdentifier;
	readonly location: UriComponents;
}

export enum WebviewEditorCapabilities {
	Editable,
	SupportsHotExit,
}

export interface IWebviewPortMapping {
	readonly webviewPort: number;
	readonly extensionHostPort: number;
}

export interface IWebviewContentOptions {
	readonly enableScripts?: boolean;
	readonly enableForms?: boolean;
	readonly enableCommandUris?: boolean;
	readonly localResourceRoots?: readonly UriComponents[];
	readonly portMapping?: readonly IWebviewPortMapping[];
}

export interface IWebviewPanelOptions {
	readonly enableFindWidget?: boolean;
	readonly retainContextWhenHidden?: boolean;
}

export interface CustomTextEditorCapabilities {
	readonly supportsMove?: boolean;
}

export const enum WebviewMessageArrayBufferViewType {
	Int8Array = 1,
	Uint8Array = 2,
	Uint8ClampedArray = 3,
	Int16Array = 4,
	Uint16Array = 5,
	Int32Array = 6,
	Uint32Array = 7,
	Float32Array = 8,
	Float64Array = 9,
	BigInt64Array = 10,
	BigUint64Array = 11,
}

export interface WebviewMessageArrayBufferReference {
	readonly $$vscode_array_buffer_reference$$: true;

	readonly index: number;

	/**
	 * Tracks if the reference is to a view instead of directly to an ArrayBuffer.
	 */
	readonly view?: {
		readonly type: WebviewMessageArrayBufferViewType;
		readonly byteLength: number;
		readonly byteOffset: number;
	};
}

export interface MainThreadWebviewsShape extends IDisposable {
	$setHtml(handle: WebviewHandle, value: string): void;
	$setOptions(handle: WebviewHandle, options: IWebviewContentOptions): void;
	$postMessage(handle: WebviewHandle, value: string, ...buffers: VSBuffer[]): Promise<boolean>;
}

export interface IWebviewIconPath {
	readonly light: UriComponents;
	readonly dark: UriComponents;
}

export interface IWebviewInitData {
	readonly title: string;
	readonly webviewOptions: IWebviewContentOptions;
	readonly panelOptions: IWebviewPanelOptions;
	readonly serializeBuffersForPostMessage: boolean;
}

export interface MainThreadWebviewPanelsShape extends IDisposable {
	$createWebviewPanel(
		extension: WebviewExtensionDescription,
		handle: WebviewHandle,
		viewType: string,
		initData: IWebviewInitData,
		showOptions: WebviewPanelShowOptions,
	): void;
	$disposeWebview(handle: WebviewHandle): void;
	$reveal(handle: WebviewHandle, showOptions: WebviewPanelShowOptions): void;
	$setTitle(handle: WebviewHandle, value: string): void;
	$setIconPath(handle: WebviewHandle, value: IWebviewIconPath | undefined): void;

	$registerSerializer(viewType: string, options: { serializeBuffersForPostMessage: boolean }): void;
	$unregisterSerializer(viewType: string): void;
}

export interface MainThreadCustomEditorsShape extends IDisposable {
	$registerTextEditorProvider(extension: WebviewExtensionDescription, viewType: string, options: IWebviewPanelOptions, capabilities: CustomTextEditorCapabilities, serializeBuffersForPostMessage: boolean): void;
	$registerCustomEditorProvider(extension: WebviewExtensionDescription, viewType: string, options: IWebviewPanelOptions, supportsMultipleEditorsPerDocument: boolean, serializeBuffersForPostMessage: boolean): void;
	$unregisterEditorProvider(viewType: string): void;

	$onDidEdit(resource: UriComponents, viewType: string, editId: number, label: string | undefined): void;
	$onContentChange(resource: UriComponents, viewType: string): void;
}

export interface MainThreadWebviewViewsShape extends IDisposable {
	$registerWebviewViewProvider(extension: WebviewExtensionDescription, viewType: string, options: { retainContextWhenHidden?: boolean; serializeBuffersForPostMessage: boolean }): void;
	$unregisterWebviewViewProvider(viewType: string): void;

	$setWebviewViewTitle(handle: WebviewHandle, value: string | undefined): void;
	$setWebviewViewDescription(handle: WebviewHandle, value: string | undefined): void;
	$setWebviewViewBadge(handle: WebviewHandle, badge: IViewBadge | undefined): void;

	$show(handle: WebviewHandle, preserveFocus: boolean): void;
}

export interface WebviewPanelViewStateData {
	[handle: string]: {
		readonly active: boolean;
		readonly visible: boolean;
		readonly position: EditorGroupColumn;
	};
}

export interface ExtHostWebviewsShape {
	$onMessage(handle: WebviewHandle, jsonSerializedMessage: string, buffers: SerializableObjectWithBuffers<VSBuffer[]>): void;
	$onMissingCsp(handle: WebviewHandle, extensionId: string): void;
}

export interface ExtHostWebviewPanelsShape {
	$onDidChangeWebviewPanelViewStates(newState: WebviewPanelViewStateData): void;
	$onDidDisposeWebviewPanel(handle: WebviewHandle): Promise<void>;
	$deserializeWebviewPanel(
		newWebviewHandle: WebviewHandle,
		viewType: string,
		initData: {
			title: string;
			state: any;
			webviewOptions: IWebviewContentOptions;
			panelOptions: IWebviewPanelOptions;
			active: boolean;
		},
		position: EditorGroupColumn,
	): Promise<void>;
}

export interface ExtHostCustomEditorsShape {
	$resolveWebviewEditor(
		resource: UriComponents,
		newWebviewHandle: WebviewHandle,
		viewType: string,
		initData: {
			title: string;
			webviewOptions: IWebviewContentOptions;
			panelOptions: IWebviewPanelOptions;
		},
		position: EditorGroupColumn,
		cancellation: CancellationToken
	): Promise<void>;
	$createCustomDocument(resource: UriComponents, viewType: string, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, cancellation: CancellationToken): Promise<{ editable: boolean }>;
	$disposeCustomDocument(resource: UriComponents, viewType: string): Promise<void>;

	$undo(resource: UriComponents, viewType: string, editId: number, isDirty: boolean): Promise<void>;
	$redo(resource: UriComponents, viewType: string, editId: number, isDirty: boolean): Promise<void>;
	$revert(resource: UriComponents, viewType: string, cancellation: CancellationToken): Promise<void>;
	$disposeEdits(resourceComponents: UriComponents, viewType: string, editIds: number[]): void;

	$onSave(resource: UriComponents, viewType: string, cancellation: CancellationToken): Promise<void>;
	$onSaveAs(resource: UriComponents, viewType: string, targetResource: UriComponents, cancellation: CancellationToken): Promise<void>;

	$backup(resource: UriComponents, viewType: string, cancellation: CancellationToken): Promise<string>;

	$onMoveCustomEditor(handle: WebviewHandle, newResource: UriComponents, viewType: string): Promise<void>;
}

export interface ExtHostWebviewViewsShape {
	$resolveWebviewView(webviewHandle: WebviewHandle, viewType: string, title: string | undefined, state: any, cancellation: CancellationToken): Promise<void>;

	$onDidChangeWebviewViewVisibility(webviewHandle: WebviewHandle, visible: boolean): void;

	$disposeWebviewView(webviewHandle: WebviewHandle): void;
}

export enum CellOutputKind {
	Text = 1,
	Error = 2,
	Rich = 3
}

export enum NotebookEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export interface INotebookDocumentShowOptions {
	position?: EditorGroupColumn;
	preserveFocus?: boolean;
	pinned?: boolean;
	selections?: ICellRange[];
}

export type INotebookCellStatusBarEntryDto = Dto<notebookCommon.INotebookCellStatusBarItem>;

export interface INotebookCellStatusBarListDto {
	items: INotebookCellStatusBarEntryDto[];
	cacheId: number;
}

export interface MainThreadNotebookShape extends IDisposable {
	$registerNotebookProvider(extension: notebookCommon.NotebookExtensionDescription, viewType: string, options: notebookCommon.TransientOptions, registration: notebookCommon.INotebookContributionData | undefined): Promise<void>;
	$updateNotebookProviderOptions(viewType: string, options?: { transientOutputs: boolean; transientCellMetadata: notebookCommon.TransientCellMetadata; transientDocumentMetadata: notebookCommon.TransientDocumentMetadata }): Promise<void>;
	$unregisterNotebookProvider(viewType: string): Promise<void>;

	$registerNotebookSerializer(handle: number, extension: notebookCommon.NotebookExtensionDescription, viewType: string, options: notebookCommon.TransientOptions, registration: notebookCommon.INotebookContributionData | undefined): void;
	$unregisterNotebookSerializer(handle: number): void;

	$registerNotebookCellStatusBarItemProvider(handle: number, eventHandle: number | undefined, viewType: string): Promise<void>;
	$unregisterNotebookCellStatusBarItemProvider(handle: number, eventHandle: number | undefined): Promise<void>;
	$emitCellStatusBarEvent(eventHandle: number): void;
}

export interface MainThreadNotebookEditorsShape extends IDisposable {
	$tryShowNotebookDocument(uriComponents: UriComponents, viewType: string, options: INotebookDocumentShowOptions): Promise<string>;
	$tryRevealRange(id: string, range: ICellRange, revealType: NotebookEditorRevealType): Promise<void>;
	$trySetSelections(id: string, range: ICellRange[]): void;
}

export interface MainThreadNotebookDocumentsShape extends IDisposable {
	$tryCreateNotebook(options: { viewType: string; content?: NotebookDataDto }): Promise<UriComponents>;
	$tryOpenNotebook(uriComponents: UriComponents): Promise<UriComponents>;
	$trySaveNotebook(uri: UriComponents): Promise<boolean>;
}

export interface INotebookKernelDto2 {
	id: string;
	notebookType: string;
	extensionId: ExtensionIdentifier;
	extensionLocation: UriComponents;
	label: string;
	detail?: string;
	description?: string;
	kind?: string;
	supportedLanguages?: string[];
	supportsInterrupt?: boolean;
	supportsExecutionOrder?: boolean;
	preloads?: { uri: UriComponents; provides: readonly string[] }[];
}

export interface INotebookProxyKernelDto {
	id: string;
	notebookType: string;
	extensionId: ExtensionIdentifier;
	extensionLocation: UriComponents;
	label: string;
	detail?: string;
	description?: string;
	kind?: string;
}

export interface ICellExecuteOutputEditDto {
	editType: CellExecutionUpdateType.Output;
	cellHandle: number;
	append?: boolean;
	outputs: NotebookOutputDto[];
}

export interface ICellExecuteOutputItemEditDto {
	editType: CellExecutionUpdateType.OutputItems;
	append?: boolean;
	outputId: string;
	items: NotebookOutputItemDto[];
}

export interface ICellExecutionStateUpdateDto extends ICellExecutionStateUpdate {
}

export interface ICellExecutionCompleteDto extends ICellExecutionComplete {
}

export type ICellExecuteUpdateDto = ICellExecuteOutputEditDto | ICellExecuteOutputItemEditDto | ICellExecutionStateUpdateDto;

export interface MainThreadNotebookKernelsShape extends IDisposable {
	$postMessage(handle: number, editorId: string | undefined, message: any): Promise<boolean>;
	$addKernel(handle: number, data: INotebookKernelDto2): Promise<void>;
	$updateKernel(handle: number, data: Partial<INotebookKernelDto2>): void;
	$removeKernel(handle: number): void;
	$updateNotebookPriority(handle: number, uri: UriComponents, value: number | undefined): void;

	$createExecution(handle: number, controllerId: string, uri: UriComponents, cellHandle: number): void;
	$updateExecution(handle: number, data: SerializableObjectWithBuffers<ICellExecuteUpdateDto[]>): void;
	$completeExecution(handle: number, data: SerializableObjectWithBuffers<ICellExecutionCompleteDto>): void;
}

export interface MainThreadNotebookRenderersShape extends IDisposable {
	$postMessage(editorId: string | undefined, rendererId: string, message: unknown): Promise<boolean>;
}

export interface MainThreadInteractiveShape extends IDisposable {
}

export interface MainThreadUrlsShape extends IDisposable {
	$registerUriHandler(handle: number, extensionId: ExtensionIdentifier): Promise<void>;
	$unregisterUriHandler(handle: number): Promise<void>;
	$createAppUri(uri: UriComponents): Promise<UriComponents>;
}

export interface ExtHostUrlsShape {
	$handleExternalUri(handle: number, uri: UriComponents): Promise<void>;
}

export interface MainThreadUriOpenersShape extends IDisposable {
	$registerUriOpener(id: string, schemes: readonly string[], extensionId: ExtensionIdentifier, label: string): Promise<void>;
	$unregisterUriOpener(id: string): Promise<void>;
}

export interface ExtHostUriOpenersShape {
	$canOpenUri(id: string, uri: UriComponents, token: CancellationToken): Promise<languages.ExternalUriOpenerPriority>;
	$openUri(id: string, context: { resolvedUri: UriComponents; sourceUri: UriComponents }, token: CancellationToken): Promise<void>;
}

export interface ITextSearchComplete {
	limitHit?: boolean;
}

export interface MainThreadWorkspaceShape extends IDisposable {
	$startFileSearch(includePattern: string | null, includeFolder: UriComponents | null, excludePatternOrDisregardExcludes: string | false | null, maxResults: number | null, token: CancellationToken): Promise<UriComponents[] | null>;
	$startTextSearch(query: search.IPatternInfo, folder: UriComponents | null, options: ITextQueryBuilderOptions, requestId: number, token: CancellationToken): Promise<ITextSearchComplete | null>;
	$checkExists(folders: readonly UriComponents[], includes: string[], token: CancellationToken): Promise<boolean>;
	$saveAll(includeUntitled?: boolean): Promise<boolean>;
	$updateWorkspaceFolders(extensionName: string, index: number, deleteCount: number, workspaceFoldersToAdd: { uri: UriComponents; name?: string }[]): Promise<void>;
	$resolveProxy(url: string): Promise<string | undefined>;
	$requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean | undefined>;
	$registerEditSessionIdentityProvider(handle: number, scheme: string): void;
	$unregisterEditSessionIdentityProvider(handle: number): void;
}

export interface IFileChangeDto {
	resource: UriComponents;
	type: files.FileChangeType;
}

export interface MainThreadFileSystemShape extends IDisposable {
	$registerFileSystemProvider(handle: number, scheme: string, capabilities: files.FileSystemProviderCapabilities): Promise<void>;
	$unregisterProvider(handle: number): void;
	$onFileSystemChange(handle: number, resource: IFileChangeDto[]): void;

	$stat(uri: UriComponents): Promise<files.IStat>;
	$readdir(resource: UriComponents): Promise<[string, files.FileType][]>;
	$readFile(resource: UriComponents): Promise<VSBuffer>;
	$writeFile(resource: UriComponents, content: VSBuffer): Promise<void>;
	$rename(resource: UriComponents, target: UriComponents, opts: files.IFileOverwriteOptions): Promise<void>;
	$copy(resource: UriComponents, target: UriComponents, opts: files.IFileOverwriteOptions): Promise<void>;
	$mkdir(resource: UriComponents): Promise<void>;
	$delete(resource: UriComponents, opts: files.IFileDeleteOptions): Promise<void>;

	$watch(extensionId: string, session: number, resource: UriComponents, opts: files.IWatchOptions): void;
	$unwatch(session: number): void;

	$ensureActivation(scheme: string): Promise<void>;
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
	$createTaskId(task: tasks.ITaskDTO): Promise<string>;
	$registerTaskProvider(handle: number, type: string): Promise<void>;
	$unregisterTaskProvider(handle: number): Promise<void>;
	$fetchTasks(filter?: tasks.ITaskFilterDTO): Promise<tasks.ITaskDTO[]>;
	$getTaskExecution(value: tasks.ITaskHandleDTO | tasks.ITaskDTO): Promise<tasks.ITaskExecutionDTO>;
	$executeTask(task: tasks.ITaskHandleDTO | tasks.ITaskDTO): Promise<tasks.ITaskExecutionDTO>;
	$terminateTask(id: string): Promise<void>;
	$registerTaskSystem(scheme: string, info: tasks.ITaskSystemInfoDTO): void;
	$customExecutionComplete(id: string, result?: number): Promise<void>;
	$registerSupportedExecutions(custom?: boolean, shell?: boolean, process?: boolean): Promise<void>;
}

export interface MainThreadExtensionServiceShape extends IDisposable {
	$getExtension(extensionId: string): Promise<Dto<IExtensionDescription> | undefined>;
	$activateExtension(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void>;
	$onWillActivateExtension(extensionId: ExtensionIdentifier): Promise<void>;
	$onDidActivateExtension(extensionId: ExtensionIdentifier, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationReason: ExtensionActivationReason): void;
	$onExtensionActivationError(extensionId: ExtensionIdentifier, error: SerializedError, missingExtensionDependency: MissingExtensionDependency | null): Promise<void>;
	$onExtensionRuntimeError(extensionId: ExtensionIdentifier, error: SerializedError): void;
	$setPerformanceMarks(marks: performance.PerformanceMark[]): Promise<void>;
	$asBrowserUri(uri: UriComponents): Promise<UriComponents>;
}

export interface SCMProviderFeatures {
	hasQuickDiffProvider?: boolean;
	count?: number;
	commitTemplate?: string;
	acceptInputCommand?: languages.Command;
	actionButton?: SCMActionButtonDto | null;
	statusBarCommands?: ICommandDto[];
}

export interface SCMActionButtonDto {
	command: ICommandDto;
	secondaryCommands?: ICommandDto[][];
	description?: string;
	enabled: boolean;
}

export interface SCMGroupFeatures {
	hideWhenEmpty?: boolean;
}

export type SCMRawResource = [
	number /*handle*/,
	UriComponents /*resourceUri*/,
	[UriComponents | ThemeIcon | undefined, UriComponents | ThemeIcon | undefined] /*icons: light, dark*/,
	string /*tooltip*/,
	boolean /*strike through*/,
	boolean /*faded*/,
	string /*context value*/,
	ICommandDto | undefined /*command*/
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

	$registerGroups(sourceControlHandle: number, groups: [number /*handle*/, string /*id*/, string /*label*/, SCMGroupFeatures][], splices: SCMRawResourceSplices[]): void;
	$updateGroup(sourceControlHandle: number, handle: number, features: SCMGroupFeatures): void;
	$updateGroupLabel(sourceControlHandle: number, handle: number, label: string): void;
	$unregisterGroup(sourceControlHandle: number, handle: number): void;

	$spliceResourceStates(sourceControlHandle: number, splices: SCMRawResourceSplices[]): void;

	$setInputBoxValue(sourceControlHandle: number, value: string): void;
	$setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): void;
	$setInputBoxEnablement(sourceControlHandle: number, enabled: boolean): void;
	$setInputBoxVisibility(sourceControlHandle: number, visible: boolean): void;
	$showValidationMessage(sourceControlHandle: number, message: string | IMarkdownString, type: InputValidationType): void;
	$setValidationProviderIsEnabled(sourceControlHandle: number, enabled: boolean): void;
}

export type DebugSessionUUID = string;

export interface IDebugConfiguration {
	type: string;
	name: string;
	request: string;
	[key: string]: any;
}

export interface IStartDebuggingOptions {
	parentSessionID?: DebugSessionUUID;
	lifecycleManagedByParent?: boolean;
	repl?: IDebugSessionReplMode;
	noDebug?: boolean;
	compact?: boolean;
	debugUI?: {
		simple?: boolean;
	};
	suppressSaveBeforeStart?: boolean;
}

export interface MainThreadDebugServiceShape extends IDisposable {
	$registerDebugTypes(debugTypes: string[]): void;
	$sessionCached(sessionID: string): void;
	$acceptDAMessage(handle: number, message: DebugProtocol.ProtocolMessage): void;
	$acceptDAError(handle: number, name: string, message: string, stack: string | undefined): void;
	$acceptDAExit(handle: number, code: number | undefined, signal: string | undefined): void;
	$registerDebugConfigurationProvider(type: string, triggerKind: DebugConfigurationProviderTriggerKind, hasProvideMethod: boolean, hasResolveMethod: boolean, hasResolve2Method: boolean, handle: number): Promise<void>;
	$registerDebugAdapterDescriptorFactory(type: string, handle: number): Promise<void>;
	$unregisterDebugConfigurationProvider(handle: number): void;
	$unregisterDebugAdapterDescriptorFactory(handle: number): void;
	$startDebugging(folder: UriComponents | undefined, nameOrConfig: string | IDebugConfiguration, options: IStartDebuggingOptions): Promise<boolean>;
	$stopDebugging(sessionId: DebugSessionUUID | undefined): Promise<void>;
	$setDebugSessionName(id: DebugSessionUUID, name: string): void;
	$customDebugAdapterRequest(id: DebugSessionUUID, command: string, args: any): Promise<any>;
	$getDebugProtocolBreakpoint(id: DebugSessionUUID, breakpoinId: string): Promise<DebugProtocol.Breakpoint | undefined>;
	$appendDebugConsole(value: string): void;
	$startBreakpointEvents(): void;
	$registerBreakpoints(breakpoints: Array<ISourceMultiBreakpointDto | IFunctionBreakpointDto | IDataBreakpointDto>): Promise<void>;
	$unregisterBreakpoints(breakpointIds: string[], functionBreakpointIds: string[], dataBreakpointIds: string[]): Promise<void>;
}

export interface IOpenUriOptions {
	readonly allowTunneling?: boolean;
	readonly allowContributedOpeners?: boolean | string;
}

export interface MainThreadWindowShape extends IDisposable {
	$getWindowVisibility(): Promise<boolean>;
	$openUri(uri: UriComponents, uriString: string | undefined, options: IOpenUriOptions): Promise<boolean>;
	$asExternalUri(uri: UriComponents, options: IOpenUriOptions): Promise<UriComponents>;
}

export enum CandidatePortSource {
	None = 0,
	Process = 1,
	Output = 2
}

export interface PortAttributesProviderSelector {
	pid?: number;
	portRange?: [number, number];
	commandMatcher?: RegExp;
}

export interface MainThreadTunnelServiceShape extends IDisposable {
	$openTunnel(tunnelOptions: TunnelOptions, source: string | undefined): Promise<TunnelDto | undefined>;
	$closeTunnel(remote: { host: string; port: number }): Promise<void>;
	$getTunnels(): Promise<TunnelDescription[]>;
	$setTunnelProvider(features?: TunnelProviderFeatures): Promise<void>;
	$setRemoteTunnelService(processId: number): Promise<void>;
	$setCandidateFilter(): Promise<void>;
	$onFoundNewCandidates(candidates: CandidatePort[]): Promise<void>;
	$setCandidatePortSource(source: CandidatePortSource): Promise<void>;
	$registerPortsAttributesProvider(selector: PortAttributesProviderSelector, providerHandle: number): Promise<void>;
	$unregisterPortsAttributesProvider(providerHandle: number): Promise<void>;
}

export interface MainThreadTimelineShape extends IDisposable {
	$registerTimelineProvider(provider: TimelineProviderDescriptor): void;
	$unregisterTimelineProvider(source: string): void;
	$emitTimelineChangeEvent(e: TimelineChangeEvent | undefined): void;
}

// -- extension host

export interface ICommandHandlerDescriptionDto {
	readonly description: string;
	readonly args: ReadonlyArray<{
		readonly name: string;
		readonly isOptional?: boolean;
		readonly description?: string;
	}>;
	readonly returns?: string;
}

export interface ExtHostCommandsShape {
	$executeContributedCommand(id: string, ...args: any[]): Promise<unknown>;
	$getContributedCommandHandlerDescriptions(): Promise<{ [id: string]: string | ICommandHandlerDescriptionDto }>;
}

export interface ExtHostConfigurationShape {
	$initializeConfiguration(data: IConfigurationInitData): void;
	$acceptConfigurationChanged(data: IConfigurationInitData, change: IConfigurationChange): void;
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
	languageId: string;
	isDirty: boolean;
}
export interface ExtHostDocumentsShape {
	$acceptModelLanguageChanged(strURL: UriComponents, newLanguageId: string): void;
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
	editorPosition: EditorGroupColumn | undefined;
}
export interface ITextEditorPositionData {
	[id: string]: EditorGroupColumn;
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

export interface IDataTransferFileDTO {
	readonly name: string;
	readonly uri?: UriComponents;
}

export interface DataTransferItemDTO {
	readonly asString: string;
	readonly fileData: IDataTransferFileDTO | undefined;
}

export interface DataTransferDTO {
	readonly items: Array<[/* type */string, DataTransferItemDTO]>;
}

export interface CheckboxUpdate {
	treeItemHandle: string;
	newState: boolean;
}

export interface ExtHostTreeViewsShape {
	$getChildren(treeViewId: string, treeItemHandle?: string): Promise<ITreeItem[] | undefined>;
	$handleDrop(destinationViewId: string, requestId: number, treeDataTransfer: DataTransferDTO, targetHandle: string | undefined, token: CancellationToken, operationUuid?: string, sourceViewId?: string, sourceTreeItemHandles?: string[]): Promise<void>;
	$handleDrag(sourceViewId: string, sourceTreeItemHandles: string[], operationUuid: string, token: CancellationToken): Promise<DataTransferDTO | undefined>;
	$setExpanded(treeViewId: string, treeItemHandle: string, expanded: boolean): void;
	$setSelection(treeViewId: string, treeItemHandles: string[]): void;
	$setFocus(treeViewId: string, treeItemHandle: string): void;
	$setVisible(treeViewId: string, visible: boolean): void;
	$changeCheckboxState(treeViewId: string, checkboxUpdates: CheckboxUpdate[]): void;
	$hasResolve(treeViewId: string): Promise<boolean>;
	$resolve(treeViewId: string, treeItemHandle: string, token: CancellationToken): Promise<ITreeItem | undefined>;
}

export interface ExtHostWorkspaceShape {
	$initializeWorkspace(workspace: IWorkspaceData | null, trusted: boolean): void;
	$acceptWorkspaceData(workspace: IWorkspaceData | null): void;
	$handleTextSearchResult(result: search.IRawFileMatch2, requestId: number): void;
	$onDidGrantWorkspaceTrust(): void;
	$getEditSessionIdentifier(folder: UriComponents, token: CancellationToken): Promise<string | undefined>;
}

export interface ExtHostFileSystemInfoShape {
	$acceptProviderInfos(uri: UriComponents, capabilities: number | null): void;
}

export interface ExtHostFileSystemShape {
	$stat(handle: number, resource: UriComponents): Promise<files.IStat>;
	$readdir(handle: number, resource: UriComponents): Promise<[string, files.FileType][]>;
	$readFile(handle: number, resource: UriComponents): Promise<VSBuffer>;
	$writeFile(handle: number, resource: UriComponents, content: VSBuffer, opts: files.IFileWriteOptions): Promise<void>;
	$rename(handle: number, resource: UriComponents, target: UriComponents, opts: files.IFileOverwriteOptions): Promise<void>;
	$copy(handle: number, resource: UriComponents, target: UriComponents, opts: files.IFileOverwriteOptions): Promise<void>;
	$mkdir(handle: number, resource: UriComponents): Promise<void>;
	$delete(handle: number, resource: UriComponents, opts: files.IFileDeleteOptions): Promise<void>;
	$watch(handle: number, session: number, resource: UriComponents, opts: files.IWatchOptions): void;
	$unwatch(handle: number, session: number): void;
	$open(handle: number, resource: UriComponents, opts: files.IFileOpenOptions): Promise<number>;
	$close(handle: number, fd: number): Promise<void>;
	$read(handle: number, fd: number, pos: number, length: number): Promise<VSBuffer>;
	$write(handle: number, fd: number, pos: number, data: VSBuffer): Promise<number>;
}

export interface ExtHostLabelServiceShape {
	$registerResourceLabelFormatter(formatter: ResourceLabelFormatter): IDisposable;
}

export interface ExtHostAuthenticationShape {
	$getSessions(id: string, scopes?: string[]): Promise<ReadonlyArray<AuthenticationSession>>;
	$createSession(id: string, scopes: string[]): Promise<AuthenticationSession>;
	$removeSession(id: string, sessionId: string): Promise<void>;
	$onDidChangeAuthenticationSessions(id: string, label: string): Promise<void>;
	$setProviders(providers: AuthenticationProviderInformation[]): Promise<void>;
}

export interface ExtHostSecretStateShape {
	$onDidChangePassword(e: { extensionId: string; key: string }): Promise<void>;
}

export interface ExtHostSearchShape {
	$enableExtensionHostSearch(): void;
	$provideFileSearchResults(handle: number, session: number, query: search.IRawQuery, token: CancellationToken): Promise<search.ISearchCompleteStats>;
	$provideTextSearchResults(handle: number, session: number, query: search.IRawTextQuery, token: CancellationToken): Promise<search.ISearchCompleteStats>;
	$clearCache(cacheKey: string): Promise<void>;
}

export interface ExtHostExtensionServiceShape {
	$resolveAuthority(remoteAuthority: string, resolveAttempt: number): Promise<IResolveAuthorityResult>;
	/**
	 * Returns `null` if no resolver for `remoteAuthority` is found.
	 */
	$getCanonicalURI(remoteAuthority: string, uri: UriComponents): Promise<UriComponents | null>;
	$startExtensionHost(extensionsDelta: IExtensionDescriptionDelta): Promise<void>;
	$extensionTestsExecute(): Promise<number>;
	$activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void>;
	$activate(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean>;
	$setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void>;
	$updateRemoteConnectionData(connectionData: IRemoteConnectionData): Promise<void>;

	$deltaExtensions(extensionsDelta: IExtensionDescriptionDelta): Promise<void>;

	$test_latency(n: number): Promise<number>;
	$test_up(b: VSBuffer): Promise<number>;
	$test_down(size: number): Promise<VSBuffer>;
}

export interface FileSystemEvents {
	created: UriComponents[];
	changed: UriComponents[];
	deleted: UriComponents[];
}

export interface SourceTargetPair {
	source?: UriComponents;
	target: UriComponents;
}

export interface IWillRunFileOperationParticipation {
	edit: IWorkspaceEditDto;
	extensionNames: string[];
}

export interface ExtHostFileSystemEventServiceShape {
	$onFileEvent(events: FileSystemEvents): void;
	$onWillRunFileOperation(operation: files.FileOperation, files: readonly SourceTargetPair[], timeout: number, token: CancellationToken): Promise<IWillRunFileOperationParticipation | undefined>;
	$onDidRunFileOperation(operation: files.FileOperation, files: readonly SourceTargetPair[]): void;
}

export interface ExtHostLanguagesShape {
	$acceptLanguageIds(ids: string[]): void;
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

export const enum ISuggestDataDtoField {
	label = 'a',
	kind = 'b',
	detail = 'c',
	documentation = 'd',
	sortText = 'e',
	filterText = 'f',
	preselect = 'g',
	insertText = 'h',
	insertTextRules = 'i',
	range = 'j',
	commitCharacters = 'k',
	additionalTextEdits = 'l',
	command = 'm',
	kindModifier = 'n',
}

export interface ISuggestDataDto {
	[ISuggestDataDtoField.label]: string | languages.CompletionItemLabel;
	[ISuggestDataDtoField.kind]?: languages.CompletionItemKind;
	[ISuggestDataDtoField.detail]?: string;
	[ISuggestDataDtoField.documentation]?: string | IMarkdownString;
	[ISuggestDataDtoField.sortText]?: string;
	[ISuggestDataDtoField.filterText]?: string;
	[ISuggestDataDtoField.preselect]?: true;
	[ISuggestDataDtoField.insertText]?: string;
	[ISuggestDataDtoField.insertTextRules]?: languages.CompletionItemInsertTextRule;
	[ISuggestDataDtoField.range]?: IRange | { insert: IRange; replace: IRange };
	[ISuggestDataDtoField.commitCharacters]?: string[];
	[ISuggestDataDtoField.additionalTextEdits]?: ISingleEditOperation[];
	[ISuggestDataDtoField.command]?: languages.Command;
	[ISuggestDataDtoField.kindModifier]?: languages.CompletionItemTag[];
	// not-standard
	x?: ChainedCacheId;
}

export const enum ISuggestResultDtoField {
	defaultRanges = 'a',
	completions = 'b',
	isIncomplete = 'c',
	duration = 'd',
}

export interface ISuggestResultDto {
	[ISuggestResultDtoField.defaultRanges]: { insert: IRange; replace: IRange };
	[ISuggestResultDtoField.completions]: ISuggestDataDto[];
	[ISuggestResultDtoField.isIncomplete]: undefined | true;
	[ISuggestResultDtoField.duration]: number;
	x?: number;
}

export interface ISignatureHelpDto {
	id: CacheId;
	signatures: languages.SignatureInformation[];
	activeSignature: number;
	activeParameter: number;
}

export interface ISignatureHelpContextDto {
	readonly triggerKind: languages.SignatureHelpTriggerKind;
	readonly triggerCharacter: string | undefined;
	readonly isRetrigger: boolean;
	readonly activeSignatureHelp: ISignatureHelpDto | undefined;
}

export type IInlayHintDto = CachedSessionItem<Dto<languages.InlayHint>>;

export type IInlayHintsDto = CachedSession<{ hints: IInlayHintDto[] }>;

export type ILocationDto = Dto<languages.Location>;
export type ILocationLinkDto = Dto<languages.LocationLink>;

export type IWorkspaceSymbolDto = CachedSessionItem<Dto<IWorkspaceSymbol>>;
export type IWorkspaceSymbolsDto = CachedSession<{ symbols: IWorkspaceSymbolDto[] }>;

export interface IWorkspaceEditEntryMetadataDto {
	needsConfirmation: boolean;
	label: string;
	description?: string;
	iconPath?: { id: string } | UriComponents | { light: UriComponents; dark: UriComponents };
}


export type ICellEditOperationDto =
	notebookCommon.ICellPartialMetadataEdit
	| notebookCommon.IDocumentMetadataEdit
	| {
		editType: notebookCommon.CellEditType.Replace;
		index: number;
		count: number;
		cells: NotebookCellDataDto[];
	};

export type IWorkspaceCellEditDto = Dto<Omit<notebookCommon.IWorkspaceNotebookCellEdit, 'cellEdit'>> & { cellEdit: ICellEditOperationDto };

export type IWorkspaceFileEditDto = Dto<languages.IWorkspaceFileEdit>;

export type IWorkspaceTextEditDto = Dto<languages.IWorkspaceTextEdit>;

export interface IWorkspaceEditDto {
	edits: Array<IWorkspaceFileEditDto | IWorkspaceTextEditDto | IWorkspaceCellEditDto>;
}

export function reviveWorkspaceEditDto(data: IWorkspaceEditDto): languages.WorkspaceEdit;
export function reviveWorkspaceEditDto(data: IWorkspaceEditDto | undefined): languages.WorkspaceEdit | undefined;
export function reviveWorkspaceEditDto(data: IWorkspaceEditDto | undefined): languages.WorkspaceEdit | undefined {
	if (data && data.edits) {
		revive<languages.WorkspaceEdit>(data);
	}
	return <languages.WorkspaceEdit>data;
}

export type ICommandDto = { $ident?: number } & languages.Command;

export interface ICodeActionDto {
	cacheId?: ChainedCacheId;
	title: string;
	edit?: IWorkspaceEditDto;
	diagnostics?: Dto<IMarkerData[]>;
	command?: ICommandDto;
	kind?: string;
	isPreferred?: boolean;
	disabled?: string;
}

export interface ICodeActionListDto {
	cacheId: CacheId;
	actions: ReadonlyArray<ICodeActionDto>;
}

export interface ICodeActionProviderMetadataDto {
	readonly providedKinds?: readonly string[];
	readonly documentation?: ReadonlyArray<{ readonly kind: string; readonly command: ICommandDto }>;
}

export type CacheId = number;
export type ChainedCacheId = [CacheId, CacheId];

type CachedSessionItem<T> = T & { cacheId?: ChainedCacheId };
type CachedSession<T> = T & { cacheId?: CacheId };

export type ILinksListDto = CachedSession<{ links: ILinkDto[] }>;
export type ILinkDto = CachedSessionItem<Dto<languages.ILink>>;

export type ICodeLensListDto = CachedSession<{ lenses: ICodeLensDto[] }>;
export type ICodeLensDto = CachedSessionItem<Dto<languages.CodeLens>>;

export type ICallHierarchyItemDto = Dto<CallHierarchyItem>;

export interface IIncomingCallDto {
	from: ICallHierarchyItemDto;
	fromRanges: IRange[];
}

export interface IOutgoingCallDto {
	fromRanges: IRange[];
	to: ICallHierarchyItemDto;
}

export interface ILanguageWordDefinitionDto {
	languageId: string;
	regexSource: string;
	regexFlags: string;
}

export interface ILinkedEditingRangesDto {
	ranges: IRange[];
	wordPattern?: IRegExpDto;
}

export interface IInlineValueContextDto {
	frameId: number;
	stoppedLocation: IRange;
}

export type ITypeHierarchyItemDto = Dto<TypeHierarchyItem>;

export interface IPasteEditDto {
	insertText: string | { snippet: string };
	additionalEdit?: IWorkspaceEditDto;
}

export interface IDocumentOnDropEditDto {
	insertText: string | { snippet: string };
	additionalEdit?: IWorkspaceEditDto;
}

export interface ExtHostLanguageFeaturesShape {
	$provideDocumentSymbols(handle: number, resource: UriComponents, token: CancellationToken): Promise<languages.DocumentSymbol[] | undefined>;
	$provideCodeLenses(handle: number, resource: UriComponents, token: CancellationToken): Promise<ICodeLensListDto | undefined>;
	$resolveCodeLens(handle: number, symbol: ICodeLensDto, token: CancellationToken): Promise<ICodeLensDto | undefined>;
	$releaseCodeLenses(handle: number, id: number): void;
	$provideDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ILocationLinkDto[]>;
	$provideDeclaration(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ILocationLinkDto[]>;
	$provideImplementation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ILocationLinkDto[]>;
	$provideTypeDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ILocationLinkDto[]>;
	$provideHover(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.Hover | undefined>;
	$provideEvaluatableExpression(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.EvaluatableExpression | undefined>;
	$provideInlineValues(handle: number, resource: UriComponents, range: IRange, context: languages.InlineValueContext, token: CancellationToken): Promise<languages.InlineValue[] | undefined>;
	$provideDocumentHighlights(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.DocumentHighlight[] | undefined>;
	$provideLinkedEditingRanges(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ILinkedEditingRangesDto | undefined>;
	$provideReferences(handle: number, resource: UriComponents, position: IPosition, context: languages.ReferenceContext, token: CancellationToken): Promise<ILocationDto[] | undefined>;
	$provideCodeActions(handle: number, resource: UriComponents, rangeOrSelection: IRange | ISelection, context: languages.CodeActionContext, token: CancellationToken): Promise<ICodeActionListDto | undefined>;
	$resolveCodeAction(handle: number, id: ChainedCacheId, token: CancellationToken): Promise<IWorkspaceEditDto | undefined>;
	$releaseCodeActions(handle: number, cacheId: number): void;
	$prepareDocumentPaste(handle: number, uri: UriComponents, ranges: readonly IRange[], dataTransfer: DataTransferDTO, token: CancellationToken): Promise<DataTransferDTO | undefined>;
	$providePasteEdits(handle: number, requestId: number, uri: UriComponents, ranges: IRange[], dataTransfer: DataTransferDTO, token: CancellationToken): Promise<IPasteEditDto | undefined>;
	$provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: IRange, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: IPosition, ch: string, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined>;
	$provideWorkspaceSymbols(handle: number, search: string, token: CancellationToken): Promise<IWorkspaceSymbolsDto>;
	$resolveWorkspaceSymbol(handle: number, symbol: IWorkspaceSymbolDto, token: CancellationToken): Promise<IWorkspaceSymbolDto | undefined>;
	$releaseWorkspaceSymbols(handle: number, id: number): void;
	$provideRenameEdits(handle: number, resource: UriComponents, position: IPosition, newName: string, token: CancellationToken): Promise<IWorkspaceEditDto & { rejectReason?: string } | undefined>;
	$resolveRenameLocation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.RenameLocation | undefined>;
	$provideDocumentSemanticTokens(handle: number, resource: UriComponents, previousResultId: number, token: CancellationToken): Promise<VSBuffer | null>;
	$releaseDocumentSemanticTokens(handle: number, semanticColoringResultId: number): void;
	$provideDocumentRangeSemanticTokens(handle: number, resource: UriComponents, range: IRange, token: CancellationToken): Promise<VSBuffer | null>;
	$provideCompletionItems(handle: number, resource: UriComponents, position: IPosition, context: languages.CompletionContext, token: CancellationToken): Promise<ISuggestResultDto | undefined>;
	$resolveCompletionItem(handle: number, id: ChainedCacheId, token: CancellationToken): Promise<ISuggestDataDto | undefined>;
	$releaseCompletionItems(handle: number, id: number): void;
	$provideInlineCompletions(handle: number, resource: UriComponents, position: IPosition, context: languages.InlineCompletionContext, token: CancellationToken): Promise<IdentifiableInlineCompletions | undefined>;
	$handleInlineCompletionDidShow(handle: number, pid: number, idx: number): void;
	$freeInlineCompletionsList(handle: number, pid: number): void;
	$provideSignatureHelp(handle: number, resource: UriComponents, position: IPosition, context: languages.SignatureHelpContext, token: CancellationToken): Promise<ISignatureHelpDto | undefined>;
	$releaseSignatureHelp(handle: number, id: number): void;
	$provideInlayHints(handle: number, resource: UriComponents, range: IRange, token: CancellationToken): Promise<IInlayHintsDto | undefined>;
	$resolveInlayHint(handle: number, id: ChainedCacheId, token: CancellationToken): Promise<IInlayHintDto | undefined>;
	$releaseInlayHints(handle: number, id: number): void;
	$provideDocumentLinks(handle: number, resource: UriComponents, token: CancellationToken): Promise<ILinksListDto | undefined>;
	$resolveDocumentLink(handle: number, id: ChainedCacheId, token: CancellationToken): Promise<ILinkDto | undefined>;
	$releaseDocumentLinks(handle: number, id: number): void;
	$provideDocumentColors(handle: number, resource: UriComponents, token: CancellationToken): Promise<IRawColorInfo[]>;
	$provideColorPresentations(handle: number, resource: UriComponents, colorInfo: IRawColorInfo, token: CancellationToken): Promise<languages.IColorPresentation[] | undefined>;
	$provideFoldingRanges(handle: number, resource: UriComponents, context: languages.FoldingContext, token: CancellationToken): Promise<languages.FoldingRange[] | undefined>;
	$provideSelectionRanges(handle: number, resource: UriComponents, positions: IPosition[], token: CancellationToken): Promise<languages.SelectionRange[][]>;
	$prepareCallHierarchy(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ICallHierarchyItemDto[] | undefined>;
	$provideCallHierarchyIncomingCalls(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<IIncomingCallDto[] | undefined>;
	$provideCallHierarchyOutgoingCalls(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<IOutgoingCallDto[] | undefined>;
	$releaseCallHierarchy(handle: number, sessionId: string): void;
	$setWordDefinitions(wordDefinitions: ILanguageWordDefinitionDto[]): void;
	$prepareTypeHierarchy(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<ITypeHierarchyItemDto[] | undefined>;
	$provideTypeHierarchySupertypes(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<ITypeHierarchyItemDto[] | undefined>;
	$provideTypeHierarchySubtypes(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<ITypeHierarchyItemDto[] | undefined>;
	$releaseTypeHierarchy(handle: number, sessionId: string): void;
	$provideDocumentOnDropEdits(handle: number, requestId: number, resource: UriComponents, position: IPosition, dataTransferDto: DataTransferDTO, token: CancellationToken): Promise<IDocumentOnDropEditDto | undefined>;
}

export interface ExtHostQuickOpenShape {
	$onItemSelected(handle: number): void;
	$validateInput(input: string): Promise<string | { content: string; severity: Severity } | null | undefined>;
	$onDidChangeActive(sessionId: number, handles: number[]): void;
	$onDidChangeSelection(sessionId: number, handles: number[]): void;
	$onDidAccept(sessionId: number): void;
	$onDidChangeValue(sessionId: number, value: string): void;
	$onDidTriggerButton(sessionId: number, handle: number): void;
	$onDidTriggerItemButton(sessionId: number, itemHandle: number, buttonHandle: number): void;
	$onDidHide(sessionId: number): void;
}

export interface ExtHostTelemetryShape {
	$initializeTelemetryLevel(level: TelemetryLevel, productConfig?: { usage: boolean; error: boolean }): void;
	$onDidChangeTelemetryLevel(level: TelemetryLevel): void;
}

export interface ITerminalLinkDto {
	/** The ID of the link to enable activation and disposal. */
	id: number;
	/** The startIndex of the link in the line. */
	startIndex: number;
	/** The length of the link in the line. */
	length: number;
	/** The descriptive label for what the link does when activated. */
	label?: string;
}

export interface ITerminalDimensionsDto {
	columns: number;
	rows: number;
}

export interface ExtHostTerminalServiceShape {
	$acceptTerminalClosed(id: number, exitCode: number | undefined, exitReason: TerminalExitReason): void;
	$acceptTerminalOpened(id: number, extHostTerminalId: string | undefined, name: string, shellLaunchConfig: IShellLaunchConfigDto): void;
	$acceptActiveTerminalChanged(id: number | null): void;
	$acceptTerminalProcessId(id: number, processId: number): void;
	$acceptTerminalProcessData(id: number, data: string): void;
	$acceptTerminalTitleChange(id: number, name: string): void;
	$acceptTerminalDimensions(id: number, cols: number, rows: number): void;
	$acceptTerminalMaximumDimensions(id: number, cols: number, rows: number): void;
	$acceptTerminalInteraction(id: number): void;
	$startExtensionTerminal(id: number, initialDimensions: ITerminalDimensionsDto | undefined): Promise<ITerminalLaunchError | undefined>;
	$acceptProcessAckDataEvent(id: number, charCount: number): void;
	$acceptProcessInput(id: number, data: string): void;
	$acceptProcessResize(id: number, cols: number, rows: number): void;
	$acceptProcessShutdown(id: number, immediate: boolean): void;
	$acceptProcessRequestInitialCwd(id: number): void;
	$acceptProcessRequestCwd(id: number): void;
	$acceptProcessRequestLatency(id: number): Promise<number>;
	$provideLinks(id: number, line: string): Promise<ITerminalLinkDto[]>;
	$activateLink(id: number, linkId: number): void;
	$initEnvironmentVariableCollections(collections: [string, ISerializableEnvironmentVariableCollection][]): void;
	$acceptDefaultProfile(profile: ITerminalProfile, automationProfile: ITerminalProfile): void;
	$createContributedProfileTerminal(id: string, options: ICreateContributedTerminalProfileOptions): Promise<void>;
}

export interface ExtHostSCMShape {
	$provideOriginalResource(sourceControlHandle: number, uri: UriComponents, token: CancellationToken): Promise<UriComponents | null>;
	$onInputBoxValueChange(sourceControlHandle: number, value: string): void;
	$executeResourceCommand(sourceControlHandle: number, groupHandle: number, handle: number, preserveFocus: boolean): Promise<void>;
	$validateInput(sourceControlHandle: number, value: string, cursorPosition: number): Promise<[string | IMarkdownString, number] | undefined>;
	$setSelectedSourceControl(selectedSourceControlHandle: number | undefined): Promise<void>;
}

export interface ExtHostTaskShape {
	$provideTasks(handle: number, validTypes: { [key: string]: boolean }): Promise<tasks.ITaskSetDTO>;
	$resolveTask(handle: number, taskDTO: tasks.ITaskDTO): Promise<tasks.ITaskDTO | undefined>;
	$onDidStartTask(execution: tasks.ITaskExecutionDTO, terminalId: number, resolvedDefinition: tasks.ITaskDefinitionDTO): void;
	$onDidStartTaskProcess(value: tasks.ITaskProcessStartedDTO): void;
	$onDidEndTaskProcess(value: tasks.ITaskProcessEndedDTO): void;
	$OnDidEndTask(execution: tasks.ITaskExecutionDTO): void;
	$resolveVariables(workspaceFolder: UriComponents, toResolve: { process?: { name: string; cwd?: string }; variables: string[] }): Promise<{ process?: string; variables: { [key: string]: string } }>;
	$jsonTasksSupported(): Promise<boolean>;
	$findExecutable(command: string, cwd?: string, paths?: string[]): Promise<string | undefined>;
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
	accessTypes?: DebugProtocol.DataBreakpointAccessType[];
	accessType: DebugProtocol.DataBreakpointAccessType;
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
	parent: DebugSessionUUID | undefined;
	folderUri: UriComponents | undefined;
	configuration: IConfig;
}

export type IDebugSessionDto = IDebugSessionFullDto | DebugSessionUUID;

export interface ExtHostDebugServiceShape {
	$substituteVariables(folder: UriComponents | undefined, config: IConfig): Promise<IConfig>;
	$runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, sessionId: string): Promise<number | undefined>;
	$startDASession(handle: number, session: IDebugSessionDto): Promise<void>;
	$stopDASession(handle: number): Promise<void>;
	$sendDAMessage(handle: number, message: DebugProtocol.ProtocolMessage): void;
	$resolveDebugConfiguration(handle: number, folder: UriComponents | undefined, debugConfiguration: IConfig, token: CancellationToken): Promise<IConfig | null | undefined>;
	$resolveDebugConfigurationWithSubstitutedVariables(handle: number, folder: UriComponents | undefined, debugConfiguration: IConfig, token: CancellationToken): Promise<IConfig | null | undefined>;
	$provideDebugConfigurations(handle: number, folder: UriComponents | undefined, token: CancellationToken): Promise<IConfig[]>;
	$provideDebugAdapter(handle: number, session: IDebugSessionDto): Promise<Dto<IAdapterDescriptor>>;
	$acceptDebugSessionStarted(session: IDebugSessionDto): void;
	$acceptDebugSessionTerminated(session: IDebugSessionDto): void;
	$acceptDebugSessionActiveChanged(session: IDebugSessionDto | undefined): void;
	$acceptDebugSessionCustomEvent(session: IDebugSessionDto, event: any): void;
	$acceptBreakpointsDelta(delta: IBreakpointsDeltaDto): void;
	$acceptDebugSessionNameChanged(session: IDebugSessionDto, name: string): void;
}


export interface DecorationRequest {
	readonly id: number;
	readonly uri: UriComponents;
}

export type DecorationData = [boolean, string, string, ThemeColor];
export type DecorationReply = { [id: number]: DecorationData };

export interface ExtHostDecorationsShape {
	$provideDecorations(handle: number, requests: DecorationRequest[], token: CancellationToken): Promise<DecorationReply>;
}

export interface ExtHostWindowShape {
	$onDidChangeWindowFocus(value: boolean): void;
}

export interface ExtHostLogLevelServiceShape {
	$setLevel(level: LogLevel): void;
}

export interface MainThreadLoggerShape {
	$log(file: UriComponents, messages: [LogLevel, string][]): void;
	$createLogger(file: UriComponents, options?: ILoggerOptions): Promise<void>;
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
	$toggleReaction(commentControllerHandle: number, threadHandle: number, uri: UriComponents, comment: languages.Comment, reaction: languages.CommentReaction): Promise<void>;
}

export interface INotebookSelectionChangeEvent {
	selections: ICellRange[];
}

export interface INotebookVisibleRangesEvent {
	ranges: ICellRange[];
}

export interface INotebookEditorPropertiesChangeData {
	visibleRanges?: INotebookVisibleRangesEvent;
	selections?: INotebookSelectionChangeEvent;
}

export interface INotebookDocumentPropertiesChangeData {
	metadata?: notebookCommon.NotebookDocumentMetadata;
}

export interface INotebookModelAddedData {
	uri: UriComponents;
	versionId: number;
	cells: NotebookCellDto[];
	viewType: string;
	metadata?: notebookCommon.NotebookDocumentMetadata;
}

export interface INotebookEditorAddData {
	id: string;
	documentUri: UriComponents;
	selections: ICellRange[];
	visibleRanges: ICellRange[];
	viewColumn?: number;
}

export interface INotebookDocumentsAndEditorsDelta {
	removedDocuments?: UriComponents[];
	addedDocuments?: INotebookModelAddedData[];
	removedEditors?: string[];
	addedEditors?: INotebookEditorAddData[];
	newActiveEditor?: string | null;
	visibleEditors?: string[];
}

export interface NotebookOutputItemDto {
	readonly mime: string;
	readonly valueBytes: VSBuffer;
}

export interface NotebookOutputDto {
	items: NotebookOutputItemDto[];
	outputId: string;
	metadata?: Record<string, any>;
}

export interface NotebookCellDataDto {
	source: string;
	language: string;
	mime: string | undefined;
	cellKind: notebookCommon.CellKind;
	outputs: NotebookOutputDto[];
	metadata?: notebookCommon.NotebookCellMetadata;
	internalMetadata?: notebookCommon.NotebookCellInternalMetadata;
}

export interface NotebookDataDto {
	readonly cells: NotebookCellDataDto[];
	readonly metadata: notebookCommon.NotebookDocumentMetadata;
}

export interface NotebookCellDto {
	handle: number;
	uri: UriComponents;
	eol: string;
	source: string[];
	language: string;
	mime?: string;
	cellKind: notebookCommon.CellKind;
	outputs: NotebookOutputDto[];
	metadata?: notebookCommon.NotebookCellMetadata;
	internalMetadata?: notebookCommon.NotebookCellInternalMetadata;
}

export interface ExtHostNotebookShape extends ExtHostNotebookDocumentsAndEditorsShape {
	$provideNotebookCellStatusBarItems(handle: number, uri: UriComponents, index: number, token: CancellationToken): Promise<INotebookCellStatusBarListDto | undefined>;
	$releaseNotebookCellStatusBarItems(id: number): void;

	$openNotebook(viewType: string, uri: UriComponents, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, token: CancellationToken): Promise<SerializableObjectWithBuffers<NotebookDataDto>>;
	$saveNotebook(viewType: string, uri: UriComponents, token: CancellationToken): Promise<boolean>;
	$saveNotebookAs(viewType: string, uri: UriComponents, target: UriComponents, token: CancellationToken): Promise<boolean>;
	$backupNotebook(viewType: string, uri: UriComponents, cancellation: CancellationToken): Promise<string>;

	$dataToNotebook(handle: number, data: VSBuffer, token: CancellationToken): Promise<SerializableObjectWithBuffers<NotebookDataDto>>;
	$notebookToData(handle: number, data: SerializableObjectWithBuffers<NotebookDataDto>, token: CancellationToken): Promise<VSBuffer>;
}

export interface ExtHostNotebookRenderersShape {
	$postRendererMessage(editorId: string, rendererId: string, message: unknown): void;
}

export interface ExtHostNotebookDocumentsAndEditorsShape {
	$acceptDocumentAndEditorsDelta(delta: SerializableObjectWithBuffers<INotebookDocumentsAndEditorsDelta>): void;
}

export type NotebookRawContentEventDto =
	// notebookCommon.NotebookCellsInitializeEvent<NotebookCellDto>
	| {

		readonly kind: notebookCommon.NotebookCellsChangeType.ModelChange;
		readonly changes: notebookCommon.NotebookCellTextModelSplice<NotebookCellDto>[];
	}
	| {
		readonly kind: notebookCommon.NotebookCellsChangeType.Move;
		readonly index: number;
		readonly length: number;
		readonly newIdx: number;
	}
	| {
		readonly kind: notebookCommon.NotebookCellsChangeType.Output;
		readonly index: number;
		readonly outputs: NotebookOutputDto[];
	}
	| {
		readonly kind: notebookCommon.NotebookCellsChangeType.OutputItem;
		readonly index: number;
		readonly outputId: string;
		readonly outputItems: NotebookOutputItemDto[];
		readonly append: boolean;
	}
	| notebookCommon.NotebookCellsChangeLanguageEvent
	| notebookCommon.NotebookCellsChangeMimeEvent
	| notebookCommon.NotebookCellsChangeMetadataEvent
	| notebookCommon.NotebookCellsChangeInternalMetadataEvent
	// | notebookCommon.NotebookDocumentChangeMetadataEvent
	| notebookCommon.NotebookCellContentChangeEvent
	// | notebookCommon.NotebookDocumentUnknownChangeEvent
	;

export type NotebookCellsChangedEventDto = {
	readonly rawEvents: NotebookRawContentEventDto[];
	readonly versionId: number;
};

export interface ExtHostNotebookDocumentsShape {
	$acceptModelChanged(uriComponents: UriComponents, event: SerializableObjectWithBuffers<NotebookCellsChangedEventDto>, isDirty: boolean, newMetadata?: notebookCommon.NotebookDocumentMetadata): void;
	$acceptDirtyStateChanged(uriComponents: UriComponents, isDirty: boolean): void;
	$acceptModelSaved(uriComponents: UriComponents): void;
}

export type INotebookEditorViewColumnInfo = Record<string, number>;

export interface ExtHostNotebookEditorsShape {
	$acceptEditorPropertiesChanged(id: string, data: INotebookEditorPropertiesChangeData): void;
	$acceptEditorViewColumns(data: INotebookEditorViewColumnInfo): void;
}

export interface ExtHostNotebookKernelsShape {
	$acceptNotebookAssociation(handle: number, uri: UriComponents, value: boolean): void;
	$executeCells(handle: number, uri: UriComponents, handles: number[]): Promise<void>;
	$cancelCells(handle: number, uri: UriComponents, handles: number[]): Promise<void>;
	$acceptKernelMessageFromRenderer(handle: number, editorId: string, message: any): void;
	$cellExecutionChanged(uri: UriComponents, cellHandle: number, state: notebookCommon.NotebookCellExecutionState | undefined): void;
}

export interface ExtHostInteractiveShape {
	$willAddInteractiveDocument(uri: UriComponents, eol: string, languageId: string, notebookUri: UriComponents): void;
	$willRemoveInteractiveDocument(uri: UriComponents, notebookUri: UriComponents): void;
}

export interface ExtHostStorageShape {
	$acceptValue(shared: boolean, extensionId: string, value: object | undefined): void;
}

export interface ExtHostThemingShape {
	$onColorThemeChange(themeType: string): void;
}

export interface MainThreadThemingShape extends IDisposable {
}

export interface TunnelDto {
	remoteAddress: { port: number; host: string };
	localAddress: { port: number; host: string } | string;
	public: boolean;
	privacy: TunnelPrivacyId | string;
	protocol: string | undefined;
}


export interface ExtHostTunnelServiceShape {
	$forwardPort(tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions): Promise<TunnelDto | undefined>;
	$closeTunnel(remote: { host: string; port: number }, silent?: boolean): Promise<void>;
	$onDidTunnelsChange(): Promise<void>;
	$registerCandidateFinder(enable: boolean): Promise<void>;
	$applyCandidateFilter(candidates: CandidatePort[]): Promise<CandidatePort[]>;
	$providePortAttributes(handles: number[], ports: number[], pid: number | undefined, commandline: string | undefined, cancellationToken: CancellationToken): Promise<ProvidedPortAttributes[]>;
}

export interface ExtHostTimelineShape {
	$getTimeline(source: string, uri: UriComponents, options: TimelineOptions, token: CancellationToken): Promise<Dto<Timeline> | undefined>;
}

export const enum ExtHostTestingResource {
	Workspace,
	TextDocument
}

export interface ExtHostTestingShape {
	$runControllerTests(req: RunTestForControllerRequest[], token: CancellationToken): Promise<{ error?: string }[]>;
	$cancelExtensionTestRun(runId: string | undefined): void;
	/** Handles a diff of tests, as a result of a subscribeToDiffs() call */
	$acceptDiff(diff: TestsDiffOp.Serialized[]): void;
	/** Publishes that a test run finished. */
	$publishTestResults(results: ISerializedTestResults[]): void;
	/** Expands a test item's children, by the given number of levels. */
	$expandTest(testId: string, levels: number): Promise<void>;
	/** Requests file coverage for a test run. Errors if not available. */
	$provideFileCoverage(runId: string, taskId: string, token: CancellationToken): Promise<Dto<IFileCoverage[]>>;
	/**
	 * Requests coverage details for the file index in coverage data for the run.
	 * Requires file coverage to have been previously requested via $provideFileCoverage.
	 */
	$resolveFileCoverage(runId: string, taskId: string, fileIndex: number, token: CancellationToken): Promise<CoverageDetails[]>;
	/** Configures a test run config. */
	$configureRunProfile(controllerId: string, configId: number): void;
	/** Asks the controller to refresh its tests */
	$refreshTests(controllerId: string, token: CancellationToken): Promise<void>;
}

export interface ITestControllerPatch {
	label?: string;
	canRefresh?: boolean;
}

export interface MainThreadTestingShape {
	// --- test lifecycle:

	/** Registers that there's a test controller with the given ID */
	$registerTestController(controllerId: string, label: string, canRefresh: boolean): void;
	/** Updates the label of an existing test controller. */
	$updateController(controllerId: string, patch: ITestControllerPatch): void;
	/** Diposes of the test controller with the given ID */
	$unregisterTestController(controllerId: string): void;
	/** Requests tests published to VS Code. */
	$subscribeToDiffs(): void;
	/** Stops requesting tests published to VS Code. */
	$unsubscribeFromDiffs(): void;
	/** Publishes that new tests were available on the given source. */
	$publishDiff(controllerId: string, diff: TestsDiffOp.Serialized[]): void;

	// --- test run configurations:

	/** Called when a new test run configuration is available */
	$publishTestRunProfile(config: ITestRunProfile): void;
	/** Updates an existing test run configuration */
	$updateTestRunConfig(controllerId: string, configId: number, update: Partial<ITestRunProfile>): void;
	/** Removes a previously-published test run config */
	$removeTestProfile(controllerId: string, configId: number): void;


	// --- test run handling:

	/** Request by an extension to run tests. */
	$runTests(req: ResolvedTestRunRequest, token: CancellationToken): Promise<string>;
	/**
	 * Adds tests to the run. The tests are given in descending depth. The first
	 * item will be a previously-known test, or a test root.
	 */
	$addTestsToRun(controllerId: string, runId: string, tests: ITestItem.Serialized[]): void;
	/** Updates the state of a test run in the given run. */
	$updateTestStateInRun(runId: string, taskId: string, testId: string, state: TestResultState, duration?: number): void;
	/** Appends a message to a test in the run. */
	$appendTestMessagesInRun(runId: string, taskId: string, testId: string, messages: ITestMessage.Serialized[]): void;
	/** Appends raw output to the test run.. */
	$appendOutputToRun(runId: string, taskId: string, output: VSBuffer, location?: ILocationDto, testId?: string): void;
	/** Triggered when coverage is added to test results. */
	$signalCoverageAvailable(runId: string, taskId: string): void;
	/** Signals a task in a test run started. */
	$startedTestRunTask(runId: string, task: ITestRunTask): void;
	/** Signals a task in a test run ended. */
	$finishedTestRunTask(runId: string, taskId: string): void;
	/** Start a new extension-provided test run. */
	$startedExtensionTestRun(req: ExtensionRunTestsRequest): void;
	/** Signals that an extension-provided test run finished. */
	$finishedExtensionTestRun(runId: string): void;
}

// --- proxy identifiers

export const MainContext = {
	MainThreadAuthentication: createProxyIdentifier<MainThreadAuthenticationShape>('MainThreadAuthentication'),
	MainThreadBulkEdits: createProxyIdentifier<MainThreadBulkEditsShape>('MainThreadBulkEdits'),
	MainThreadClipboard: createProxyIdentifier<MainThreadClipboardShape>('MainThreadClipboard'),
	MainThreadCommands: createProxyIdentifier<MainThreadCommandsShape>('MainThreadCommands'),
	MainThreadComments: createProxyIdentifier<MainThreadCommentsShape>('MainThreadComments'),
	MainThreadConfiguration: createProxyIdentifier<MainThreadConfigurationShape>('MainThreadConfiguration'),
	MainThreadConsole: createProxyIdentifier<MainThreadConsoleShape>('MainThreadConsole'),
	MainThreadDebugService: createProxyIdentifier<MainThreadDebugServiceShape>('MainThreadDebugService'),
	MainThreadDecorations: createProxyIdentifier<MainThreadDecorationsShape>('MainThreadDecorations'),
	MainThreadDiagnostics: createProxyIdentifier<MainThreadDiagnosticsShape>('MainThreadDiagnostics'),
	MainThreadDialogs: createProxyIdentifier<MainThreadDiaglogsShape>('MainThreadDiaglogs'),
	MainThreadDocuments: createProxyIdentifier<MainThreadDocumentsShape>('MainThreadDocuments'),
	MainThreadDocumentContentProviders: createProxyIdentifier<MainThreadDocumentContentProvidersShape>('MainThreadDocumentContentProviders'),
	MainThreadTextEditors: createProxyIdentifier<MainThreadTextEditorsShape>('MainThreadTextEditors'),
	MainThreadEditorInsets: createProxyIdentifier<MainThreadEditorInsetsShape>('MainThreadEditorInsets'),
	MainThreadEditorTabs: createProxyIdentifier<MainThreadEditorTabsShape>('MainThreadEditorTabs'),
	MainThreadErrors: createProxyIdentifier<MainThreadErrorsShape>('MainThreadErrors'),
	MainThreadTreeViews: createProxyIdentifier<MainThreadTreeViewsShape>('MainThreadTreeViews'),
	MainThreadDownloadService: createProxyIdentifier<MainThreadDownloadServiceShape>('MainThreadDownloadService'),
	MainThreadKeytar: createProxyIdentifier<MainThreadKeytarShape>('MainThreadKeytar'),
	MainThreadLanguageFeatures: createProxyIdentifier<MainThreadLanguageFeaturesShape>('MainThreadLanguageFeatures'),
	MainThreadLanguages: createProxyIdentifier<MainThreadLanguagesShape>('MainThreadLanguages'),
	MainThreadLogger: createProxyIdentifier<MainThreadLoggerShape>('MainThreadLogger'),
	MainThreadMessageService: createProxyIdentifier<MainThreadMessageServiceShape>('MainThreadMessageService'),
	MainThreadOutputService: createProxyIdentifier<MainThreadOutputServiceShape>('MainThreadOutputService'),
	MainThreadProgress: createProxyIdentifier<MainThreadProgressShape>('MainThreadProgress'),
	MainThreadQuickOpen: createProxyIdentifier<MainThreadQuickOpenShape>('MainThreadQuickOpen'),
	MainThreadStatusBar: createProxyIdentifier<MainThreadStatusBarShape>('MainThreadStatusBar'),
	MainThreadSecretState: createProxyIdentifier<MainThreadSecretStateShape>('MainThreadSecretState'),
	MainThreadStorage: createProxyIdentifier<MainThreadStorageShape>('MainThreadStorage'),
	MainThreadTelemetry: createProxyIdentifier<MainThreadTelemetryShape>('MainThreadTelemetry'),
	MainThreadTerminalService: createProxyIdentifier<MainThreadTerminalServiceShape>('MainThreadTerminalService'),
	MainThreadWebviews: createProxyIdentifier<MainThreadWebviewsShape>('MainThreadWebviews'),
	MainThreadWebviewPanels: createProxyIdentifier<MainThreadWebviewPanelsShape>('MainThreadWebviewPanels'),
	MainThreadWebviewViews: createProxyIdentifier<MainThreadWebviewViewsShape>('MainThreadWebviewViews'),
	MainThreadCustomEditors: createProxyIdentifier<MainThreadCustomEditorsShape>('MainThreadCustomEditors'),
	MainThreadUrls: createProxyIdentifier<MainThreadUrlsShape>('MainThreadUrls'),
	MainThreadUriOpeners: createProxyIdentifier<MainThreadUriOpenersShape>('MainThreadUriOpeners'),
	MainThreadWorkspace: createProxyIdentifier<MainThreadWorkspaceShape>('MainThreadWorkspace'),
	MainThreadFileSystem: createProxyIdentifier<MainThreadFileSystemShape>('MainThreadFileSystem'),
	MainThreadExtensionService: createProxyIdentifier<MainThreadExtensionServiceShape>('MainThreadExtensionService'),
	MainThreadSCM: createProxyIdentifier<MainThreadSCMShape>('MainThreadSCM'),
	MainThreadSearch: createProxyIdentifier<MainThreadSearchShape>('MainThreadSearch'),
	MainThreadTask: createProxyIdentifier<MainThreadTaskShape>('MainThreadTask'),
	MainThreadWindow: createProxyIdentifier<MainThreadWindowShape>('MainThreadWindow'),
	MainThreadLabelService: createProxyIdentifier<MainThreadLabelServiceShape>('MainThreadLabelService'),
	MainThreadNotebook: createProxyIdentifier<MainThreadNotebookShape>('MainThreadNotebook'),
	MainThreadNotebookDocuments: createProxyIdentifier<MainThreadNotebookDocumentsShape>('MainThreadNotebookDocumentsShape'),
	MainThreadNotebookEditors: createProxyIdentifier<MainThreadNotebookEditorsShape>('MainThreadNotebookEditorsShape'),
	MainThreadNotebookKernels: createProxyIdentifier<MainThreadNotebookKernelsShape>('MainThreadNotebookKernels'),
	MainThreadNotebookRenderers: createProxyIdentifier<MainThreadNotebookRenderersShape>('MainThreadNotebookRenderers'),
	MainThreadInteractive: createProxyIdentifier<MainThreadInteractiveShape>('MainThreadInteractive'),
	MainThreadTheming: createProxyIdentifier<MainThreadThemingShape>('MainThreadTheming'),
	MainThreadTunnelService: createProxyIdentifier<MainThreadTunnelServiceShape>('MainThreadTunnelService'),
	MainThreadTimeline: createProxyIdentifier<MainThreadTimelineShape>('MainThreadTimeline'),
	MainThreadTesting: createProxyIdentifier<MainThreadTestingShape>('MainThreadTesting'),
};

export const ExtHostContext = {
	ExtHostCommands: createProxyIdentifier<ExtHostCommandsShape>('ExtHostCommands'),
	ExtHostConfiguration: createProxyIdentifier<ExtHostConfigurationShape>('ExtHostConfiguration'),
	ExtHostDiagnostics: createProxyIdentifier<ExtHostDiagnosticsShape>('ExtHostDiagnostics'),
	ExtHostDebugService: createProxyIdentifier<ExtHostDebugServiceShape>('ExtHostDebugService'),
	ExtHostDecorations: createProxyIdentifier<ExtHostDecorationsShape>('ExtHostDecorations'),
	ExtHostDocumentsAndEditors: createProxyIdentifier<ExtHostDocumentsAndEditorsShape>('ExtHostDocumentsAndEditors'),
	ExtHostDocuments: createProxyIdentifier<ExtHostDocumentsShape>('ExtHostDocuments'),
	ExtHostDocumentContentProviders: createProxyIdentifier<ExtHostDocumentContentProvidersShape>('ExtHostDocumentContentProviders'),
	ExtHostDocumentSaveParticipant: createProxyIdentifier<ExtHostDocumentSaveParticipantShape>('ExtHostDocumentSaveParticipant'),
	ExtHostEditors: createProxyIdentifier<ExtHostEditorsShape>('ExtHostEditors'),
	ExtHostTreeViews: createProxyIdentifier<ExtHostTreeViewsShape>('ExtHostTreeViews'),
	ExtHostFileSystem: createProxyIdentifier<ExtHostFileSystemShape>('ExtHostFileSystem'),
	ExtHostFileSystemInfo: createProxyIdentifier<ExtHostFileSystemInfoShape>('ExtHostFileSystemInfo'),
	ExtHostFileSystemEventService: createProxyIdentifier<ExtHostFileSystemEventServiceShape>('ExtHostFileSystemEventService'),
	ExtHostLanguages: createProxyIdentifier<ExtHostLanguagesShape>('ExtHostLanguages'),
	ExtHostLanguageFeatures: createProxyIdentifier<ExtHostLanguageFeaturesShape>('ExtHostLanguageFeatures'),
	ExtHostQuickOpen: createProxyIdentifier<ExtHostQuickOpenShape>('ExtHostQuickOpen'),
	ExtHostExtensionService: createProxyIdentifier<ExtHostExtensionServiceShape>('ExtHostExtensionService'),
	ExtHostLogLevelServiceShape: createProxyIdentifier<ExtHostLogLevelServiceShape>('ExtHostLogLevelServiceShape'),
	ExtHostTerminalService: createProxyIdentifier<ExtHostTerminalServiceShape>('ExtHostTerminalService'),
	ExtHostSCM: createProxyIdentifier<ExtHostSCMShape>('ExtHostSCM'),
	ExtHostSearch: createProxyIdentifier<ExtHostSearchShape>('ExtHostSearch'),
	ExtHostTask: createProxyIdentifier<ExtHostTaskShape>('ExtHostTask'),
	ExtHostWorkspace: createProxyIdentifier<ExtHostWorkspaceShape>('ExtHostWorkspace'),
	ExtHostWindow: createProxyIdentifier<ExtHostWindowShape>('ExtHostWindow'),
	ExtHostWebviews: createProxyIdentifier<ExtHostWebviewsShape>('ExtHostWebviews'),
	ExtHostWebviewPanels: createProxyIdentifier<ExtHostWebviewPanelsShape>('ExtHostWebviewPanels'),
	ExtHostCustomEditors: createProxyIdentifier<ExtHostCustomEditorsShape>('ExtHostCustomEditors'),
	ExtHostWebviewViews: createProxyIdentifier<ExtHostWebviewViewsShape>('ExtHostWebviewViews'),
	ExtHostEditorInsets: createProxyIdentifier<ExtHostEditorInsetsShape>('ExtHostEditorInsets'),
	ExtHostEditorTabs: createProxyIdentifier<IExtHostEditorTabsShape>('ExtHostEditorTabs'),
	ExtHostProgress: createProxyIdentifier<ExtHostProgressShape>('ExtHostProgress'),
	ExtHostComments: createProxyIdentifier<ExtHostCommentsShape>('ExtHostComments'),
	ExtHostSecretState: createProxyIdentifier<ExtHostSecretStateShape>('ExtHostSecretState'),
	ExtHostStorage: createProxyIdentifier<ExtHostStorageShape>('ExtHostStorage'),
	ExtHostUrls: createProxyIdentifier<ExtHostUrlsShape>('ExtHostUrls'),
	ExtHostUriOpeners: createProxyIdentifier<ExtHostUriOpenersShape>('ExtHostUriOpeners'),
	ExtHostOutputService: createProxyIdentifier<ExtHostOutputServiceShape>('ExtHostOutputService'),
	ExtHosLabelService: createProxyIdentifier<ExtHostLabelServiceShape>('ExtHostLabelService'),
	ExtHostNotebook: createProxyIdentifier<ExtHostNotebookShape>('ExtHostNotebook'),
	ExtHostNotebookDocuments: createProxyIdentifier<ExtHostNotebookDocumentsShape>('ExtHostNotebookDocuments'),
	ExtHostNotebookEditors: createProxyIdentifier<ExtHostNotebookEditorsShape>('ExtHostNotebookEditors'),
	ExtHostNotebookKernels: createProxyIdentifier<ExtHostNotebookKernelsShape>('ExtHostNotebookKernels'),
	ExtHostNotebookRenderers: createProxyIdentifier<ExtHostNotebookRenderersShape>('ExtHostNotebookRenderers'),
	ExtHostInteractive: createProxyIdentifier<ExtHostInteractiveShape>('ExtHostInteractive'),
	ExtHostTheming: createProxyIdentifier<ExtHostThemingShape>('ExtHostTheming'),
	ExtHostTunnelService: createProxyIdentifier<ExtHostTunnelServiceShape>('ExtHostTunnelService'),
	ExtHostAuthentication: createProxyIdentifier<ExtHostAuthenticationShape>('ExtHostAuthentication'),
	ExtHostTimeline: createProxyIdentifier<ExtHostTimelineShape>('ExtHostTimeline'),
	ExtHostTesting: createProxyIdentifier<ExtHostTestingShape>('ExtHostTesting'),
	ExtHostTelemetry: createProxyIdentifier<ExtHostTelemetryShape>('ExtHostTelemetry'),
};
