/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

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

export enum RuntimeOnlineState {
	Starting = 'starting',
	Busy = 'busy',
	Idle = 'idle',
}

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

export enum LanguageRuntimeSessionMode {
	Console = 'console',
	Notebook = 'notebook',
	Background = 'background',
}

export enum LanguageRuntimeStreamName {
	Stdout = 'stdout',
	Stderr = 'stderr'
}

export enum RuntimeCodeFragmentStatus {
	Complete = 'complete',
	Incomplete = 'incomplete',
	Invalid = 'invalid',
	Unknown = 'unknown'
}

export enum ErdosOutputLocation {
	Console = 'console',
	Viewer = 'viewer',
	Plot = 'plot',
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

export enum RuntimeMethodErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
	ServerErrorStart = -32000,
	ServerErrorEnd = -32099
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

export enum LanguageRuntimeSessionChannel {
	Console = 'console',
	Kernel = 'kernel',
	LSP = 'lsp',
}

export enum CodeAttributionSource {
	Extension = 'extension',
	Interactive = 'interactive',
	Notebook = 'notebook',
	Paste = 'paste',
	Script = 'script',
}

export { UiRuntimeNotifications } from '../../../services/languageRuntime/common/languageRuntimeService.js';
export { PlotRenderSettings, PlotRenderFormat } from '../../../services/erdosPlots/common/erdosPlots.js';