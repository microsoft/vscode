/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { UiClientInstance, IRuntimeClientEvent } from '../../languageRuntime/common/languageRuntimeUiClient.js';
import { ILanguageRuntimeMetadata, LanguageRuntimeSessionMode, ILanguageRuntimeSessionState, RuntimeState, ILanguageRuntimeInfo, ILanguageRuntimeStartupFailure, ILanguageRuntimeExit, ILanguageRuntimeClientCreatedEvent, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageStream, ILanguageRuntimeMessageInput, ILanguageRuntimeMessageError, ILanguageRuntimeMessagePrompt, ILanguageRuntimeMessageState, RuntimeCodeExecutionMode, RuntimeErrorBehavior, RuntimeCodeFragmentStatus, RuntimeExitReason, ILanguageRuntimeMessageResult, ILanguageRuntimeMessageClearOutput, ILanguageRuntimeMessageIPyWidget, ILanguageRuntimeMessageUpdateOutput } from '../../languageRuntime/common/languageRuntimeService.js';
import { RuntimeClientType, IRuntimeClientInstance } from '../../languageRuntime/common/languageRuntimeClientInstance.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ActiveRuntimeSession } from './activeRuntimeSession.js';

export const IRuntimeSessionService =
	createDecorator<IRuntimeSessionService>('runtimeSessionService');

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
	onDidChangeRuntimeState: Event<RuntimeState>;
	onDidCompleteStartup: Event<ILanguageRuntimeInfo>;
	onDidEncounterStartupFailure: Event<ILanguageRuntimeStartupFailure>;
	onDidEndSession: Event<ILanguageRuntimeExit>;
	onDidCreateClientInstance: Event<ILanguageRuntimeClientCreatedEvent>;
	onDidReceiveRuntimeMessageClearOutput: Event<ILanguageRuntimeMessageClearOutput>;
	onDidReceiveRuntimeMessageOutput: Event<ILanguageRuntimeMessageOutput>;
	onDidReceiveRuntimeMessageResult: Event<ILanguageRuntimeMessageResult>;
	onDidReceiveRuntimeMessageStream: Event<ILanguageRuntimeMessageStream>;
	onDidReceiveRuntimeMessageInput: Event<ILanguageRuntimeMessageInput>;
	onDidReceiveRuntimeMessageError: Event<ILanguageRuntimeMessageError>;
	onDidReceiveRuntimeMessagePrompt: Event<ILanguageRuntimeMessagePrompt>;
	onDidReceiveRuntimeMessageState: Event<ILanguageRuntimeMessageState>;
	onDidReceiveRuntimeMessageUpdateOutput: Event<ILanguageRuntimeMessageUpdateOutput>;
	onDidReceiveRuntimeClientEvent: Event<IRuntimeClientEvent>;
	onDidReceiveRuntimeMessagePromptConfig: Event<void>;
	onDidReceiveRuntimeMessageIPyWidget: Event<ILanguageRuntimeMessageIPyWidget>;
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