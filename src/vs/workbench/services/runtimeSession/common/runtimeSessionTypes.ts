/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { UiClientInstance, IRuntimeClientEvent } from '../../languageRuntime/common/languageRuntimeUiClient.js';
import { ILanguageRuntimeMetadata, LanguageRuntimeSessionMode, RuntimeState, ILanguageRuntimeInfo, ILanguageRuntimeStartupFailure, ILanguageRuntimeExit, ILanguageRuntimeClientCreatedEvent, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageStream, ILanguageRuntimeMessageInput, ILanguageRuntimeMessageError, ILanguageRuntimeMessagePrompt, ILanguageRuntimeMessageState, RuntimeCodeExecutionMode, RuntimeErrorBehavior, RuntimeCodeFragmentStatus, RuntimeExitReason, ILanguageRuntimeMessageResult, ILanguageRuntimeMessageClearOutput, ILanguageRuntimeMessageIPyWidget, ILanguageRuntimeMessageUpdateOutput, ILanguageRuntimeSessionState } from '../../languageRuntime/common/languageRuntimeService.js';
import { RuntimeClientType, IRuntimeClientInstance } from '../../languageRuntime/common/languageRuntimeClientInstance.js';

export interface ILanguageRuntimeGlobalEvent {
	readonly session_id: string;
	readonly event: IRuntimeClientEvent;
}

export enum RuntimeStartMode {
	Starting = 'starting',
	Restarting = 'restarting',
	Reconnecting = 'reconnecting',
	Switching = 'switching',
}

export enum LanguageRuntimeSessionChannel {
	Console = 'console',
	Kernel = 'kernel',
	LSP = 'lsp',
}

export interface IRuntimeSessionWillStartEvent {
	readonly startMode: RuntimeStartMode;
	readonly activate: boolean;
	readonly session: ILanguageRuntimeSession;
}

export interface ILanguageRuntimeSessionStateEvent {
	readonly session_id: string;
	readonly old_state: RuntimeState;
	readonly new_state: RuntimeState;
}

export interface IRuntimeSessionMetadata {
	readonly sessionId: string;
	readonly sessionMode: LanguageRuntimeSessionMode;
	readonly notebookUri: URI | undefined;
	readonly workingDirectory?: string;
	readonly createdTimestamp: number;
	readonly startReason: string;
}

export interface ILanguageRuntimeSession extends IDisposable {
	readonly runtimeMetadata: ILanguageRuntimeMetadata;
	readonly metadata: IRuntimeSessionMetadata;
	readonly sessionId: string;
	dynState: ILanguageRuntimeSessionState;
	readonly onDidChangeRuntimeState: Event<RuntimeState>;
	readonly onDidCompleteStartup: Event<ILanguageRuntimeInfo>;
	readonly onDidEncounterStartupFailure: Event<ILanguageRuntimeStartupFailure>;
	readonly onDidEndSession: Event<ILanguageRuntimeExit>;
	readonly onDidCreateClientInstance: Event<ILanguageRuntimeClientCreatedEvent>;
	readonly onDidReceiveRuntimeMessageClearOutput: Event<ILanguageRuntimeMessageClearOutput>;
	readonly onDidReceiveRuntimeMessageOutput: Event<ILanguageRuntimeMessageOutput>;
	readonly onDidReceiveRuntimeMessageResult: Event<ILanguageRuntimeMessageResult>;
	readonly onDidReceiveRuntimeMessageStream: Event<ILanguageRuntimeMessageStream>;
	readonly onDidReceiveRuntimeMessageInput: Event<ILanguageRuntimeMessageInput>;
	readonly onDidReceiveRuntimeMessageError: Event<ILanguageRuntimeMessageError>;
	readonly onDidReceiveRuntimeMessagePrompt: Event<ILanguageRuntimeMessagePrompt>;
	readonly onDidReceiveRuntimeMessageState: Event<ILanguageRuntimeMessageState>;
	readonly onDidReceiveRuntimeMessageUpdateOutput: Event<ILanguageRuntimeMessageUpdateOutput>;
	readonly onDidReceiveRuntimeClientEvent: Event<IRuntimeClientEvent>;
	readonly onDidReceiveRuntimeMessagePromptConfig: Event<void>;
	readonly onDidReceiveRuntimeMessageIPyWidget: Event<ILanguageRuntimeMessageIPyWidget>;
	getRuntimeState(): RuntimeState;
	get lastUsed(): number;
	clientInstances: IRuntimeClientInstance<any, any>[];
	openResource(resource: URI | string): Promise<boolean>;
	execute(code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void;
	isCodeFragmentComplete(code: string): Promise<RuntimeCodeFragmentStatus>;
	createClient<T, U>(type: RuntimeClientType, params: any, metadata?: any, id?: string): Promise<IRuntimeClientInstance<T, U>>;
	listClients(type?: RuntimeClientType): Promise<Array<IRuntimeClientInstance<any, any>>>;
	replyToPrompt(id: string, value: string): void;
	setWorkingDirectory(directory: string): Promise<void>;
	start(): Promise<ILanguageRuntimeInfo>;
	interrupt(): void;
	restart(workingDirectory?: string): Promise<void>;
	shutdown(exitReason?: RuntimeExitReason): Promise<void>;
	forceQuit(): Promise<void>;
	showOutput(channel?: LanguageRuntimeSessionChannel): void;
	listOutputChannels(): Promise<LanguageRuntimeSessionChannel[]>;
	showProfile(): Promise<void>;
	getLabel(): string;
	updateSessionName(sessionName: string): void;
}

export interface ILanguageRuntimeSessionManager {
	managesRuntime(runtime: ILanguageRuntimeMetadata): Promise<boolean>;
	createSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionMetadata: IRuntimeSessionMetadata): Promise<ILanguageRuntimeSession>;
	validateSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionId: string): Promise<boolean>;
	restoreSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionMetadata: IRuntimeSessionMetadata, sessionName: string): Promise<ILanguageRuntimeSession>;
	validateMetadata(metadata: ILanguageRuntimeMetadata): Promise<ILanguageRuntimeMetadata>;
}

export interface INotebookSessionUriChangedEvent {
	readonly sessionId: string;
	readonly oldUri: URI;
	readonly newUri: URI;
}

export interface ActiveRuntimeSession extends IDisposable {
	readonly session: ILanguageRuntimeSession;
	state: RuntimeState;
	readonly workingDirectory: string;
	readonly uiClient: UiClientInstance | undefined;
	register<T extends IDisposable>(disposable: T): T;
	startUiClient(): Promise<string>;
	readonly onDidReceiveRuntimeEvent: Event<ILanguageRuntimeGlobalEvent>;
	readonly onUiClientStarted: Event<UiClientInstance>;
}

export interface IRuntimeSessionService {
	readonly _serviceBrand: undefined;
	readonly onWillStartSession: Event<IRuntimeSessionWillStartEvent>;
	readonly onDidStartRuntime: Event<ILanguageRuntimeSession>;
	readonly onDidFailStartRuntime: Event<ILanguageRuntimeSession>;
	readonly onDidChangeRuntimeState: Event<ILanguageRuntimeSessionStateEvent>;
	readonly onDidReceiveRuntimeEvent: Event<ILanguageRuntimeGlobalEvent>;
	readonly onDidChangeForegroundSession: Event<ILanguageRuntimeSession | undefined>;
	readonly onDidDeleteRuntimeSession: Event<string>;
	readonly onDidUpdateNotebookSessionUri: Event<INotebookSessionUriChangedEvent>;
	readonly onDidUpdateSessionName: Event<ILanguageRuntimeSession>;
	readonly activeSessions: ILanguageRuntimeSession[];
	registerSessionManager(manager: ILanguageRuntimeSessionManager): IDisposable;
	getSession(sessionId: string): ILanguageRuntimeSession | undefined;
	getActiveSession(sessionId: string): ActiveRuntimeSession | undefined;
	getConsoleSessionForRuntime(runtimeId: string): ILanguageRuntimeSession | undefined;
	getConsoleSessionForLanguage(languageId: string): ILanguageRuntimeSession | undefined;
	getNotebookSessionForNotebookUri(notebookUri: URI): ILanguageRuntimeSession | undefined;
	getActiveSessions(): ActiveRuntimeSession[];
	hasStartingOrRunningConsole(languageId?: string | undefined): boolean;
	foregroundSession: ILanguageRuntimeSession | undefined;
	startNewRuntimeSession(runtimeId: string, sessionName: string, sessionMode: LanguageRuntimeSessionMode, notebookUri: URI | undefined, source: string, startMode: RuntimeStartMode, activate: boolean): Promise<string>;
	validateRuntimeSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionId: string): Promise<boolean>;
	restoreRuntimeSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionMetadata: IRuntimeSessionMetadata, sessionName: string, activate: boolean): Promise<void>;
	autoStartRuntime(metadata: ILanguageRuntimeMetadata, source: string, activate: boolean): Promise<string>;
	selectRuntime(runtimeId: string, source: string, notebookUri?: URI): Promise<void>;
	deleteSession(sessionId: string): Promise<void>;
	focusSession(sessionId: string): void;
	restartSession(sessionId: string, source: string, interrupt?: boolean): Promise<void>;
	interruptSession(sessionId: string): Promise<void>;
	updateSessionName(sessionId: string, name: string): void;
	shutdownNotebookSession(notebookUri: URI, exitReason: RuntimeExitReason, source: string): Promise<void>;
	updateNotebookSessionUri(oldUri: URI, newUri: URI): string | undefined;
	updateActiveLanguages(): void;
	readonly onDidStartUiClient: Event<{ sessionId: string; uiClient: UiClientInstance }>;
	watchUiClient(sessionId: string, handler: (uiClient: UiClientInstance) => void): IDisposable;
}

export { RuntimeClientType };
export type { IRuntimeClientInstance };






