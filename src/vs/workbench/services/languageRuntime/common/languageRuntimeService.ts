/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';

interface ILanguageRuntimeSession {
	dynState: { sessionName: string };
	sessionId: string;
	runtimeMetadata: ILanguageRuntimeMetadata;
}

export const ILanguageRuntimeService = createDecorator<ILanguageRuntimeService>('languageRuntimeService');

export const formatLanguageRuntimeMetadata = (metadata: ILanguageRuntimeMetadata) =>
	`${metadata.runtimeId} ` +
	`(language: ${metadata.languageName} ` +
	`name: ${metadata.runtimeName} ` +
	`version: ${metadata.languageVersion})`;

export const formatLanguageRuntimeSession = (session: ILanguageRuntimeSession) => {
	return `Session ${session.dynState.sessionName} (${session.sessionId}) from runtime ${formatLanguageRuntimeMetadata(session.runtimeMetadata)}`;
};

export interface ILanguageRuntimeMessage {
	id: string;
	type: LanguageRuntimeMessageType;
	event_clock: number;
	parent_id: string;
	when: string;
	metadata?: Record<string, unknown>;
	buffers?: VSBuffer[];
}

export enum RuntimeOutputKind {
	Text = 'text',
	StaticImage = 'static_image',
	InlineHtml = 'inline_html',
	ViewerWidget = 'viewer_widget',
	PlotWidget = 'plot',
	IPyWidget = 'ipywidget',
	WebviewPreload = 'webview_preload',
	QuartoInline = 'quarto_inline',
	Unknown = 'unknown',
}

export interface ILanguageRuntimeMessageClearOutput extends ILanguageRuntimeMessage {
	readonly wait: boolean;
}

enum ImageMimeType {
	Gif = 'image/gif',
	Jpeg = 'image/jpeg',
	Jpg = 'image/jpg',
	Png = 'image/png',
	Svg = 'image/svg+xml',
}

enum TextMimeType {
	Markdown = 'text/markdown',
	Plain = 'text/plain',
	Html = 'text/html',
}

export type ILanguageRuntimeMessageOutputData = {
	[K in (ImageMimeType | TextMimeType)]?: string;
} & {
	[key: string]: unknown;
};

export interface ILanguageRuntimeMessageOutput extends ILanguageRuntimeMessage {
	readonly kind: RuntimeOutputKind;
	readonly data: ILanguageRuntimeMessageOutputData;
	readonly output_id?: string;
}

export interface ILanguageRuntimeMessageUpdateOutput extends ILanguageRuntimeMessage {
	readonly kind: RuntimeOutputKind;
	readonly data: ILanguageRuntimeMessageOutputData;
	readonly output_id: string;
}

export interface ILanguageRuntimeMessageResult extends ILanguageRuntimeMessageOutput {
}

export enum ErdosOutputLocation {
	Console = 'console',
	Viewer = 'viewer',
	Plot = 'plot',
	Inline = 'inline',
}

export interface ILanguageRuntimeMessageWebOutput extends ILanguageRuntimeMessageOutput {
	output_location: ErdosOutputLocation | undefined;
	resource_roots: UriComponents[] | undefined;
}

export interface ILanguageRuntimeMessageStream extends ILanguageRuntimeMessage {
	name: 'stdout' | 'stderr';
	text: string;
}

export interface ILanguageRuntimeMessageInput extends ILanguageRuntimeMessage {
	code: string;
	execution_count: number;
}

export interface ILanguageRuntimeMessagePrompt extends ILanguageRuntimeMessage {
	prompt: string;
	password: boolean;
}

export interface ILanguageRuntimeMessageIPyWidget extends ILanguageRuntimeMessage {
	original_message: ILanguageRuntimeMessage;
}

export interface ILanguageRuntimeMessageCommOpen extends ILanguageRuntimeMessage {
	comm_id: string;
	target_name: string;
	data: Record<string, unknown>;
}

export interface ILanguageRuntimeMessageCommData extends ILanguageRuntimeMessage {
	comm_id: string;
	data: Record<string, unknown>;
}

export interface ILanguageRuntimeMessageCommClosed extends ILanguageRuntimeMessage {
	comm_id: string;
	data: Record<string, unknown>;
}

export interface ILanguageRuntimeClientCreatedEvent {
	message: ILanguageRuntimeMessageCommOpen;
	client: IRuntimeClientInstance<any, any>;
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

export enum RuntimeCodeExecutionMode {
	Interactive = 'interactive',
	NonInteractive = 'non-interactive',
	Transient = 'transient',
	Silent = 'silent'
}

export interface ILanguageRuntimeInfo {
	banner: string;
	implementation_version: string;
	language_version: string;
	input_prompt?: string;
	continuation_prompt?: string;
}

export interface ILanguageRuntimeStartupFailure {
	message: string;
	details: string;
}

export enum RuntimeExitReason {
	StartupFailed = 'startupFailed',
	Shutdown = 'shutdown',
	ForcedQuit = 'forcedQuit',
	Restart = 'restart',
	SwitchRuntime = 'switchRuntime',
	Error = 'error',
	ExtensionHost = 'extensionHost',
	Transferred = 'transferred',
	Unknown = 'unknown',
}

export interface ILanguageRuntimeExit {
	runtime_name: string;
	session_name: string;
	exit_code: number;
	reason: RuntimeExitReason;
	message: string;
}

export enum RuntimeErrorBehavior {
	Stop = 'stop',
	Continue = 'continue',
}

export enum RuntimeCodeFragmentStatus {
	Complete = 'complete',
	Incomplete = 'incomplete',
	Invalid = 'invalid',
	Unknown = 'unknown'
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

export enum LanguageRuntimeSessionLocation {
	Machine = 'machine',
	Workspace = 'workspace',
	Browser = 'browser',
}

export enum LanguageRuntimeStartupBehavior {
	Immediate = 'immediate',
	Implicit = 'implicit',
	Explicit = 'explicit',
	Manual = 'manual'
}

export enum LanguageStartupBehavior {
	Always = 'always',
	Auto = 'auto',
	Recommended = 'recommended',
	Manual = 'manual',
	Disabled = 'disabled'
}

export enum RuntimeStartupPhase {
	Initializing = 'initializing',
	AwaitingTrust = 'awaitingTrust',
	Reconnecting = 'reconnecting',
	Starting = 'starting',
	Discovering = 'discovering',
	Complete = 'complete',
}

export interface ILanguageRuntimeMessageState extends ILanguageRuntimeMessage {
	state: RuntimeOnlineState;
}

export interface ILanguageRuntimeMessageError extends ILanguageRuntimeMessage {
	name: string;
	message: string;
	traceback: Array<string>;
}

export interface ILanguageRuntimeMetadata {
	readonly runtimePath: string;
	readonly runtimeId: string;
	readonly languageName: string;
	readonly languageId: string;
	readonly languageVersion: string;
	readonly base64EncodedIconSvg: string | undefined;
	readonly runtimeName: string;
	readonly runtimeShortName: string;
	readonly runtimeVersion: string;
	readonly runtimeSource: string;
	readonly startupBehavior: LanguageRuntimeStartupBehavior;
	readonly sessionLocation: LanguageRuntimeSessionLocation;
	readonly extensionId: ExtensionIdentifier;
	readonly extraRuntimeData: any;
	readonly uiSubscriptions?: UiRuntimeNotifications[];
}

export interface IRuntimeManager {
	id: number;
	discoverAllRuntimes(disabledLanguageIds: string[]): Promise<void>;
	recommendWorkspaceRuntimes(disabledLanguageIds: string[]): Promise<ILanguageRuntimeMetadata[]>;
}

export interface ILangaugeRuntimeDynState {
	inputPrompt: string;
	continuationPrompt: string;
}

export interface ILanguageRuntimeSessionState extends ILangaugeRuntimeDynState {
	currentWorkingDirectory: string;
	busy: boolean;
	currentNotebookUri?: URI;
	sessionName: string;
}

export type RuntimeResourceRootProvider = (mimeType: string, data: any) => Promise<URI[]>;

export enum LanguageRuntimeSessionMode {
	Console = 'console',
	Notebook = 'notebook',
	Background = 'background',
}

export interface ILanguageRuntimeService {
	readonly _serviceBrand: undefined;
	readonly onDidRegisterRuntime: Event<ILanguageRuntimeMetadata>;
	onDidChangeRuntimeStartupPhase: Event<RuntimeStartupPhase>;
	readonly registeredRuntimes: ILanguageRuntimeMetadata[];
	registerRuntime(runtime: ILanguageRuntimeMetadata): IDisposable;
	getRegisteredRuntime(runtimeId: string): ILanguageRuntimeMetadata | undefined;
	unregisterRuntime(runtimeId: string): void;
	setStartupPhase(phase: RuntimeStartupPhase): void;
	get startupPhase(): RuntimeStartupPhase;
}

export enum UiRuntimeNotifications {
	DidChangePlotsRenderSettings = 'did_change_plots_render_settings',
}