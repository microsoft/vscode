/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ILanguageRuntimeInfo, ILanguageRuntimeMetadata, RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus, RuntimeErrorBehavior, RuntimeState, ILanguageRuntimeMessage, ILanguageRuntimeExit, RuntimeExitReason, LanguageRuntimeSessionMode } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { createProxyIdentifier, IRPCProtocol, SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { MainContext, ExtHostQuickOpenShape } from '../extHost.protocol.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorContext } from '../../../services/frontendMethods/common/editorContext.js';
import { RuntimeClientType, LanguageRuntimeSessionChannel } from './extHostTypes.erdos.js';
import { EnvironmentVariableAction, LanguageRuntimeDynState, RuntimeSessionMetadata } from 'erdos';

import { PlotRenderSettings } from '../../../services/erdosPlots/common/erdosPlots.js';

import { ILanguageRuntimeCodeExecutedEvent } from '../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';

if (Object.values(MainContext)[0].nid !== 1) {
	console.error('MainContext was initialized out of order!');
}

export interface RuntimeInitialState {
	handle: number;
	dynState: LanguageRuntimeDynState;
}

export interface MainThreadLanguageRuntimeShape extends IDisposable {
	$registerLanguageRuntime(metadata: ILanguageRuntimeMetadata): void;
	$selectLanguageRuntime(runtimeId: string): Promise<void>;
	$startLanguageRuntime(runtimeId: string, sessionName: string, sessionMode: LanguageRuntimeSessionMode, notebookUri: URI | undefined): Promise<string>;
	$completeLanguageRuntimeDiscovery(): void;
	$unregisterLanguageRuntime(runtimeId: string): void;
	$executeCode(languageId: string, extensionId: string, code: string, focus: boolean, allowIncomplete?: boolean, mode?: RuntimeCodeExecutionMode, errorBehavior?: RuntimeErrorBehavior, executionId?: string): Promise<string>;
	$getPreferredRuntime(languageId: string): Promise<ILanguageRuntimeMetadata | undefined>;
	$getRegisteredRuntimes(): Promise<ILanguageRuntimeMetadata[]>;
	$getActiveSessions(): Promise<RuntimeSessionMetadata[]>;
	$getForegroundSession(): Promise<string | undefined>;
	$getNotebookSession(notebookUri: URI): Promise<string | undefined>;
	$restartSession(handle: number): Promise<void>;
	$interruptSession(handle: number): Promise<void>;
	$focusSession(handle: number): void;

	$emitLanguageRuntimeMessage(handle: number, handled: boolean, message: SerializableObjectWithBuffers<ILanguageRuntimeMessage>): void;
	$emitLanguageRuntimeState(handle: number, clock: number, state: RuntimeState): void;
	$emitLanguageRuntimeExit(handle: number, exit: ILanguageRuntimeExit): void;
}

export interface ExtHostLanguageRuntimeShape {
	$isHostForLanguageRuntime(runtimeMetadata: ILanguageRuntimeMetadata): Promise<boolean>;
	$createLanguageRuntimeSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionMetadata: RuntimeSessionMetadata): Promise<RuntimeInitialState>;
	$restoreLanguageRuntimeSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionMetadata: RuntimeSessionMetadata, sessionName: string): Promise<RuntimeInitialState>;
	$validateLanguageRuntimeMetadata(metadata: ILanguageRuntimeMetadata): Promise<ILanguageRuntimeMetadata>;
	$validateLanguageRuntimeSession(metadata: ILanguageRuntimeMetadata, sessionId: string): Promise<boolean>;
	$disposeLanguageRuntime(handle: number): Promise<void>;
	$startLanguageRuntime(handle: number): Promise<ILanguageRuntimeInfo>;
	$openResource(handle: number, resource: URI | string): Promise<boolean>;
	$executeCode(handle: number, code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior, executionId?: string): void;
	$isCodeFragmentComplete(handle: number, code: string): Promise<RuntimeCodeFragmentStatus>;
	$createClient(handle: number, id: string, type: RuntimeClientType, params: any, metadata?: any): Promise<void>;
	$listClients(handle: number, type?: RuntimeClientType): Promise<Record<string, string>>;
	$removeClient(handle: number, id: string): void;
	$sendClientMessage(handle: number, client_id: string, message_id: string, message: any): void;
	$replyToPrompt(handle: number, id: string, response: string): void;
	$setWorkingDirectory(handle: number, directory: string): Promise<void>;
	$interruptLanguageRuntime(handle: number): Promise<void>;
	$restartSession(handle: number, workingDirectory?: string): Promise<void>;
	$shutdownLanguageRuntime(handle: number, exitReason: RuntimeExitReason): Promise<void>;
	$forceQuitLanguageRuntime(handle: number): Promise<void>;
	$showOutputLanguageRuntime(handle: number, channel?: LanguageRuntimeSessionChannel): void;
	$listOutputChannelsLanguageRuntime(handle: number): Promise<LanguageRuntimeSessionChannel[]>;
	$updateSessionNameLanguageRuntime(handle: number, sessionName: string): void;
	$showProfileLanguageRuntime(handle: number): void;
	$discoverLanguageRuntimes(disabledLanguageIds: string[]): void;
	$recommendWorkspaceRuntimes(disabledLanguageIds: string[]): Promise<ILanguageRuntimeMetadata[]>;
	$notifyForegroundSessionChanged(sessionId: string | undefined): void;
	$notifyCodeExecuted(event: ILanguageRuntimeCodeExecutedEvent): void;
}

export interface MainThreadModalDialogsShape extends IDisposable {
	$showSimpleModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): Promise<boolean>;
	$showSimpleModalDialogMessage(title: string, message: string, okButtonTitle?: string): Promise<null>;
}

export interface ExtHostModalDialogsShape { }

export interface MainThreadContextKeyServiceShape {
	$evaluateWhenClause(whenClause: string): Promise<boolean>;
}

export interface ExtHostContextKeyServiceShape { }

export interface MainThreadConsoleServiceShape {
	$getConsoleWidth(): Promise<number>;
	$getSessionIdForLanguage(languageId: string): Promise<string | undefined>;
	$tryPasteText(sessionId: string, text: string): void;
}

export interface ExtHostConsoleServiceShape {
	$onDidChangeConsoleWidth(newWidth: number): void;
	$addConsole(sessionId: string): void;
	$removeConsole(sessionId: string): void;
}

export interface MainThreadMethodsShape { }

export interface ExtHostMethodsShape {
	lastActiveEditorContext(): Promise<IEditorContext | null>;
	showDialog(title: string, message: string): Promise<null>;
	showQuestion(title: string, message: string, okButtonTitle: string, cancelButtonTitle: string): Promise<boolean>;
}

export interface MainThreadEnvironmentShape extends IDisposable {
	$getEnvironmentContributions(): Promise<Record<string, EnvironmentVariableAction[]>>;
}

export interface ExtHostEnvironmentShape { }

export interface MainThreadPlotsServiceShape {
	$getPlotsRenderSettings(): Promise<PlotRenderSettings>;
}

export interface ExtHostPlotsServiceShape {
	$onDidChangePlotsRenderSettings(settings: PlotRenderSettings): void;
}

export interface IMainErdosContext extends IRPCProtocol {
}

export const ExtHostErdosContext = {
	ExtHostLanguageRuntime: createProxyIdentifier<ExtHostLanguageRuntimeShape>('ExtHostLanguageRuntime'),
	ExtHostModalDialogs: createProxyIdentifier<ExtHostModalDialogsShape>('ExtHostModalDialogs'),
	ExtHostConsoleService: createProxyIdentifier<ExtHostConsoleServiceShape>('ExtHostConsoleService'),
	ExtHostContextKeyService: createProxyIdentifier<ExtHostContextKeyServiceShape>('ExtHostContextKeyService'),
	ExtHostMethods: createProxyIdentifier<ExtHostMethodsShape>('ExtHostMethods'),
	ExtHostEnvironment: createProxyIdentifier<ExtHostEnvironmentShape>('ExtHostEnvironment'),

	ExtHostQuickOpen: createProxyIdentifier<ExtHostQuickOpenShape>('ExtHostQuickOpen'),
	ExtHostPlotsService: createProxyIdentifier<ExtHostPlotsServiceShape>('ExtHostPlotsService'),
};

export const MainErdosContext = {
	MainThreadLanguageRuntime: createProxyIdentifier<MainThreadLanguageRuntimeShape>('MainThreadLanguageRuntime'),
	MainThreadModalDialogs: createProxyIdentifier<MainThreadModalDialogsShape>('MainThreadModalDialogs'),
	MainThreadConsoleService: createProxyIdentifier<MainThreadConsoleServiceShape>('MainThreadConsoleService'),
	MainThreadEnvironment: createProxyIdentifier<MainThreadEnvironmentShape>('MainThreadEnvironment'),
	MainThreadContextKeyService: createProxyIdentifier<MainThreadContextKeyServiceShape>('MainThreadContextKeyService'),
	MainThreadMethods: createProxyIdentifier<MainThreadMethodsShape>('MainThreadMethods'),

	MainThreadPlotsService: createProxyIdentifier<MainThreadPlotsServiceShape>('MainThreadPlotsService'),
};