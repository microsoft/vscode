/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'erdos' {

	import * as vscode from 'vscode';

	export const version: string;

	export const buildNumber: number;

	export enum LanguageRuntimeMessageType {
		ClearOutput = 'clear_output',
		Output = 'output',
		Result = 'result',
		Stream = 'stream',
		Input = 'input',
		Error = 'error',
		Prompt = 'prompt',
		State = 'state',
		Event = 'event',
		CommOpen = 'comm_open',
		CommData = 'comm_data',
		CommClosed = 'comm_closed',
		IPyWidget = 'ipywidget',
		UpdateOutput = 'update_output',
	}

	export enum RuntimeOnlineState {
		Starting = 'starting',
		Idle = 'idle',
		Busy = 'busy',
	}

	export enum RuntimeState {
		Uninitialized = 'uninitialized',
		Initializing = 'initializing',
		Starting = 'starting',
		Ready = 'ready',
		Idle = 'idle',
		Busy = 'busy',
		Restarting = 'restarting',
		Exiting = 'exiting',
		Exited = 'exited',
		Offline = 'offline',
		Interrupting = 'interrupting',
	}

	export enum RuntimeCodeFragmentStatus {
		Complete = 'complete',
		Incomplete = 'incomplete',
		Invalid = 'invalid',
		Unknown = 'unknown'
	}

	export enum RuntimeCodeExecutionMode {
		Interactive = 'interactive',
		NonInteractive = 'non-interactive',
		Transient = 'transient',
		Silent = 'silent'
	}

	export enum RuntimeErrorBehavior {
		Stop = 'stop',
		Continue = 'continue',
	}

	export enum RuntimeExitReason {
		StartupFailed = 'startupFailed',
		Shutdown = 'shutdown',
		ForcedQuit = 'forcedQuit',
		Restart = 'restart',
		SwitchRuntime = 'switchRuntime',
		Error = 'error',
		Transferred = 'transferred',
		ExtensionHost = 'extensionHost',
		Unknown = 'unknown',
	}

	export interface LanguageRuntimeExit {
		runtime_name: string;
		session_name: string;
		exit_code: number;
		reason: RuntimeExitReason;
		message: string;
	}

	export interface LanguageRuntimeMessage {
		id: string;
		parent_id: string;
		when: string;
		type: LanguageRuntimeMessageType;
		metadata?: Record<string, unknown>;
		buffers?: Array<Uint8Array>;
	}

	export interface LanguageRuntimeClearOutput extends LanguageRuntimeMessage {
		wait: boolean;
	}

	export interface LanguageRuntimeOutput extends LanguageRuntimeMessage {
		data: Record<string, unknown>;
		output_id?: string;
	}

	export interface LanguageRuntimeUpdateOutput extends LanguageRuntimeMessage {
		data: Record<string, unknown>;
		output_id: string;
	}

	export interface LanguageRuntimeResult extends LanguageRuntimeOutput {
	}

	export enum ErdosOutputLocation {
		Console = 'console',
		Viewer = 'viewer',
		Plot = 'plot',
	}

	export interface LanguageRuntimeWebOutput extends LanguageRuntimeOutput {
		output_location: ErdosOutputLocation;
		resource_roots: vscode.Uri[];
	}

	export enum LanguageRuntimeStreamName {
		Stdout = 'stdout',
		Stderr = 'stderr'
	}

	export interface LanguageRuntimeStream extends LanguageRuntimeMessage {
		name: LanguageRuntimeStreamName;
		text: string;
	}

	export interface LanguageRuntimeInput extends LanguageRuntimeMessage {
		code: string;
		execution_count: number;
	}

	export interface LanguageRuntimePrompt extends LanguageRuntimeMessage {
		prompt: string;
		password: boolean;
	}

	export interface LanguageRuntimeInfo {
		banner: string;
		implementation_version: string;
		language_version: string;
		input_prompt?: string;
		continuation_prompt?: string;
	}

	export interface LanguageRuntimeState extends LanguageRuntimeMessage {
		state: RuntimeOnlineState;
	}

	export interface LanguageRuntimeError extends LanguageRuntimeMessage {
		name: string;
		message: string;
		traceback: Array<string>;
	}

	export interface LanguageRuntimeMessageIPyWidget extends LanguageRuntimeMessage {
		original_message: LanguageRuntimeMessage;
	}

	export interface LanguageRuntimeCommOpen extends LanguageRuntimeMessage {
		comm_id: string;
		target_name: string;
		data: object;
	}

	export interface LanguageRuntimeCommMessage extends LanguageRuntimeMessage {
		comm_id: string;
		data: object;
	}

	export interface LanguageRuntimeCommClosed extends LanguageRuntimeMessage {
		comm_id: string;
		data: object;
	}

	export interface LanguageRuntimeMetadata {
		runtimePath: string;
		runtimeId: string;
		runtimeName: string;
		runtimeShortName: string;
		runtimeVersion: string;
		runtimeSource: string;
		languageName: string;
		languageId: string;
		languageVersion: string;
		base64EncodedIconSvg: string | undefined;
		startupBehavior: LanguageRuntimeStartupBehavior;
		sessionLocation: LanguageRuntimeSessionLocation;
		extraRuntimeData: any;
		uiSubscriptions?: UiRuntimeNotifications[];
	}

	export enum UiRuntimeNotifications {
		DidChangePlotsRenderSettings = 'did_change_plots_render_settings',
	}

	export interface RuntimeSessionMetadata {
		readonly sessionId: string;
		readonly sessionMode: LanguageRuntimeSessionMode;
		readonly notebookUri?: vscode.Uri;
		readonly workingDirectory?: string;
	}

	export enum LanguageRuntimeSessionMode {
		Console = 'console',
		Notebook = 'notebook',
		Background = 'background',
	}

	export interface LanguageRuntimeDynState {
		inputPrompt: string;
		continuationPrompt: string;
		sessionName: string;
	}

	export enum LanguageRuntimeStartupBehavior {
		Immediate = 'immediate',
		Implicit = 'implicit',
		Explicit = 'explicit',
		Manual = 'manual'
	}

	export enum LanguageRuntimeSessionLocation {
		Machine = 'machine',
		Workspace = 'workspace',
		Browser = 'browser',
	}

	export enum RuntimeClientType {
		Lsp = 'erdos.lsp',
		Dap = 'erdos.dap',
		Plot = 'erdos.plot',
		Ui = 'erdos.ui',
		Help = 'erdos.help',
		Connection = 'erdos.connection',
		Reticulate = 'erdos.reticulate',
		IPyWidget = 'jupyter.widget',
		IPyWidgetControl = 'jupyter.widget.control',
	}

	export enum RuntimeClientState {
		Uninitialized = 'uninitialized',
		Opening = 'opening',
		Connected = 'connected',
		Closing = 'closing',
		Closed = 'closed',
	}

	export interface RuntimeVariable {
		access_key: string;
		display_name: string;
		display_type: string;
		display_value: string;
		type_info?: string;
		length: number;
		size: number;
		has_children: boolean;
	}

	export interface QueryTableSummaryResult {
		num_rows: number;
		num_columns: number;
		column_schemas: Array<string>;
		column_profiles: Array<string>;
	}

	export interface RuntimeClientOutput<T> {
		data: T;
		buffers?: Array<Uint8Array>;
	}

	export interface RuntimeClientInstance extends vscode.Disposable {
		onDidChangeClientState: vscode.Event<RuntimeClientState>;
		onDidSendEvent: vscode.Event<RuntimeClientOutput<object>>;
		performRpcWithBuffers<T>(data: object): Thenable<RuntimeClientOutput<T>>;
		performRpc<T>(data: object): Thenable<T>;
		getClientState(): RuntimeClientState;
		getClientId(): string;
		getClientType(): RuntimeClientType;
	}

	export enum CodeAttributionSource {
		Extension = 'extension',
		Interactive = 'interactive',
		Notebook = 'notebook',
		Paste = 'paste',
		Script = 'script',
	}

	export interface CodeAttribution {
		source: CodeAttributionSource;
		metadata?: Record<string, any>;
	}

	export interface CodeExecutionEvent {
		languageId: string;
		runtimeName: string;
		code: string;
		attribution: CodeAttribution;
	}

	export interface LanguageRuntimeManager {
		discoverAllRuntimes(): AsyncGenerator<LanguageRuntimeMetadata>;
		recommendedWorkspaceRuntime(): Thenable<LanguageRuntimeMetadata | undefined>;
		onDidDiscoverRuntime?: vscode.Event<LanguageRuntimeMetadata>;
		validateMetadata?(metadata: LanguageRuntimeMetadata): Thenable<LanguageRuntimeMetadata>;
		validateSession?(sessionId: string): Thenable<boolean>;
		createSession(runtimeMetadata: LanguageRuntimeMetadata, sessionMetadata: RuntimeSessionMetadata): Thenable<LanguageRuntimeSession>;
		restoreSession?(runtimeMetadata: LanguageRuntimeMetadata, sessionMetadata: RuntimeSessionMetadata, sessionName: string): Thenable<LanguageRuntimeSession>;
	}

	export enum RuntimeMethodErrorCode {
		ParseError = -32700,
		InvalidRequest = -32600,
		MethodNotFound = -32601,
		InvalidParams = -32602,
		InternalError = -32603,
		ServerErrorStart = -32000,
		ServerErrorEnd = -32099
	}

	export interface RuntimeMethodError {
		code: RuntimeMethodErrorCode;
		message: string;
		name: string;
		data: any | undefined;
	}

	export enum LanguageRuntimeSessionChannel {
		Console = 'console',
		Kernel = 'kernel',
		LSP = 'lsp',
	}

	export interface LanguageRuntimeSession extends vscode.Disposable {
		readonly metadata: RuntimeSessionMetadata;
		readonly runtimeMetadata: LanguageRuntimeMetadata;
		dynState: LanguageRuntimeDynState;
		onDidReceiveRuntimeMessage: vscode.Event<LanguageRuntimeMessage>;
		onDidChangeRuntimeState: vscode.Event<RuntimeState>;
		onDidEndSession: vscode.Event<LanguageRuntimeExit>;
		openResource?(resource: vscode.Uri | string): Thenable<boolean>;
		execute(code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void;
		callMethod?(method: string, ...args: any[]): Thenable<any>;
		isCodeFragmentComplete(code: string): Thenable<RuntimeCodeFragmentStatus>;
		createClient(id: string, type: RuntimeClientType, params: Record<string, unknown>, metadata?: Record<string, unknown>): Thenable<void>;
		listClients(type?: RuntimeClientType): Thenable<Record<string, string>>;
		removeClient(id: string): void;
		sendClientMessage(client_id: string, message_id: string, message: Record<string, unknown>): void;
		replyToPrompt(id: string, reply: string): void;
		setWorkingDirectory(dir: string): Thenable<void>;
		start(): Thenable<LanguageRuntimeInfo>;
		interrupt(): Thenable<void>;
		restart(workingDirectory?: string): Thenable<void>;
		shutdown(exitReason: RuntimeExitReason): Thenable<void>;
		forceQuit(): Thenable<void>;
		updateSessionName(sessionName: string): void;
		showOutput?(channel?: LanguageRuntimeSessionChannel): void;
		listOutputChannels?(): LanguageRuntimeSessionChannel[];
		showProfile?(): Thenable<void>;
	}

	export type RuntimeClientHandlerCallback = (client: RuntimeClientInstance, params: Object,) => boolean;

	export interface RuntimeClientHandler {
		clientType: string;
		callback: RuntimeClientHandlerCallback;
	}

	export interface StatementRangeProvider {
		provideStatementRange(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<StatementRange>;
	}

	export interface StatementRange {
		readonly range: vscode.Range;
		readonly code?: string;
	}

	export interface HelpTopicProvider {
		provideHelpTopic(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<string>;
	}

	export interface Console {
		pasteText(text: string): void;
	}

	export interface ConnectionsInput {
		id: string;
		label: string;
		type: 'string' | 'number' | 'option';
		options?: { 'identifier': string; 'title': string }[];
		value?: string;
	}

	export interface ConnectionsDriverMetadata {
		languageId: string;
		name: string;
		base64EncodedIconSvg?: string;
		inputs: Array<ConnectionsInput>;
	}

	export interface ConnectionsDriver {
		driverId: string;
		metadata: ConnectionsDriverMetadata;
		generateCode?: (inputs: Array<ConnectionsInput>) => string;
		connect?: (code: string) => Thenable<void>;
		checkDependencies?: () => Thenable<boolean>;
		installDependencies?: () => Thenable<boolean>;
	}

	export interface PlotRenderSettings {
		size: {
			width: number;
			height: number;
		};
		pixel_ratio: number;
		format: PlotRenderFormat;
	}

	export enum PlotRenderFormat {
		Png = 'png',
		Jpeg = 'jpeg',
		Svg = 'svg',
		Pdf = 'pdf',
		Tiff = 'tiff'
	}

	namespace languages {
		export function registerStatementRangeProvider(selector: vscode.DocumentSelector, provider: StatementRangeProvider): vscode.Disposable;
		export function registerHelpTopicProvider(selector: vscode.DocumentSelector, provider: HelpTopicProvider): vscode.Disposable;
	}

	namespace window {
		export function createRawLogOutputChannel(name: string): vscode.OutputChannel;
		export function showSimpleModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): Thenable<boolean>;
		export function showSimpleModalDialogMessage(title: string, message: string, okButtonTitle?: string): Thenable<null>;
		export function getConsoleForLanguage(languageId: string): Thenable<Console | undefined>;
		export const onDidChangeConsoleWidth: vscode.Event<number>;
		export function getConsoleWidth(): Thenable<number>;
		export const onDidChangePlotsRenderSettings: vscode.Event<PlotRenderSettings>;
		export function getPlotsRenderSettings(): Thenable<PlotRenderSettings>;
	}

	namespace runtime {
		export interface ExecutionObserver {
			token?: vscode.CancellationToken;
			onStarted?: () => void;
			onOutput?: (message: string) => void;
			onError?: (message: string) => void;
			onPlot?: (plotData: string) => void;
			onData?: (data: any) => void;
			onCompleted?: (result: Record<string, any>) => void;
			onFailed?: (error: Error) => void;
			onFinished?: () => void;
		}

		export function executeCode(languageId: string, code: string, focus: boolean, allowIncomplete?: boolean, mode?: RuntimeCodeExecutionMode, errorBehavior?: RuntimeErrorBehavior, observer?: ExecutionObserver): Thenable<Record<string, any>>;
		export function registerLanguageRuntimeManager(languageId: string, manager: LanguageRuntimeManager): vscode.Disposable;
		export function getRegisteredRuntimes(): Thenable<LanguageRuntimeMetadata[]>;
		export function getPreferredRuntime(languageId: string): Thenable<LanguageRuntimeMetadata | undefined>;
		export function getActiveSessions(): Thenable<LanguageRuntimeSession[]>;
		export function getForegroundSession(): Thenable<LanguageRuntimeSession | undefined>;
		export function getNotebookSession(notebookUri: vscode.Uri): Thenable<LanguageRuntimeSession | undefined>;
		export function selectLanguageRuntime(runtimeId: string): Thenable<void>;
		export function startLanguageRuntime(runtimeId: string, sessionName: string, notebookUri?: vscode.Uri): Thenable<LanguageRuntimeSession>;
		export function restartSession(sessionId: string): Thenable<void>;
		export function focusSession(sessionId: string): void;
		export function querySessionTables(sessionId: string, accessKeys: Array<Array<string>>, queryTypes: Array<string>): Thenable<Array<QueryTableSummaryResult>>;
		export function registerClientHandler(handler: RuntimeClientHandler): vscode.Disposable;
		export function registerClientInstance(clientInstanceId: string): vscode.Disposable;
		export const onDidRegisterRuntime: vscode.Event<LanguageRuntimeMetadata>;
		export const onDidChangeForegroundSession: vscode.Event<string | undefined>;
		export const onDidExecuteCode: vscode.Event<CodeExecutionEvent>;
	}

	export type EditorContext = import('./ui-comm.js').EditorContext;

	namespace methods {
		export function call(method: string, params: Record<string, any>): Thenable<any>;
		export function lastActiveEditorContext(): Thenable<EditorContext | null>;
		export function showQuestion(title: string, message: string, okButtonTitle: string, cancelButtonTitle: string): Thenable<boolean>;
		export function showDialog(title: string, message: string): Thenable<null>;
	}

	export interface EnvironmentVariableAction {
		action: vscode.EnvironmentVariableMutatorType;
		name: string;
		value: string;
	}

	namespace environment {
		export function getEnvironmentContributions(): Thenable<Record<string, EnvironmentVariableAction[]>>;
	}

	namespace connections {
		export function registerConnectionDriver(driver: ConnectionsDriver): vscode.Disposable;
	}
}