/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'erdos' {
    import * as vscode from 'vscode';

    export interface LanguageRuntimeMetadata {
        runtimeId: string;
        runtimeName: string;
        runtimeShortName: string;
        runtimePath: string;
        runtimeVersion: string;
        runtimeSource: string;
        languageId: string;
        languageName: string;
        languageVersion: string;
        base64EncodedIconSvg: string;
        startupBehavior: LanguageRuntimeStartupBehavior;
        sessionLocation: LanguageRuntimeSessionLocation;
        extraRuntimeData: any;
    }

    export interface RuntimeSessionMetadata {
        sessionId: string;
        sessionMode: LanguageRuntimeSessionMode;
        notebookUri?: vscode.Uri;
        workingDirectory?: string;
    }

    export interface LanguageRuntimeDynState {
        sessionName: string;
        inputPrompt: string;
        continuationPrompt: string;
    }

    export interface LanguageRuntimeSession extends vscode.Disposable {
        runtimeMetadata: LanguageRuntimeMetadata;
        metadata: RuntimeSessionMetadata;
        dynState: LanguageRuntimeDynState;
        onDidReceiveRuntimeMessage: vscode.Event<LanguageRuntimeMessage>;
        onDidChangeRuntimeState: vscode.Event<RuntimeState>;
        onDidEndSession: vscode.Event<LanguageRuntimeExit>;
        execute(code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void;
        callMethod(method: string, ...args: any[]): Thenable<any>;
        isCodeFragmentComplete(code: string): Thenable<RuntimeCodeFragmentStatus>;
        createClient(id: string, type: RuntimeClientType, params: any, metadata?: any): Thenable<void>;
        listClients(type?: RuntimeClientType): Thenable<Record<string, string>>;
        removeClient(id: string): void;
        sendClientMessage(clientId: string, messageId: string, message: any): void;
        replyToPrompt(id: string, reply: string): void;
        setWorkingDirectory(dir: string): Promise<void>;
        start(): Promise<LanguageRuntimeInfo>;
        interrupt(): Promise<void>;
        restart(workingDirectory?: string): Promise<void>;
        shutdown(exitReason?: RuntimeExitReason): Promise<void>;
        forceQuit(): Promise<void>;
        showOutput(channel?: LanguageRuntimeSessionChannel): void;
        listOutputChannels(): LanguageRuntimeSessionChannel[];
        updateSessionName(sessionName: string): void;
    }

    export interface LanguageRuntimeManager {
        onDidDiscoverRuntime: vscode.Event<LanguageRuntimeMetadata>;
        discoverAllRuntimes(): AsyncGenerator<LanguageRuntimeMetadata>;
        recommendedWorkspaceRuntime(): Promise<LanguageRuntimeMetadata | undefined>;
        registerLanguageRuntime(runtime: LanguageRuntimeMetadata): void;
        createSession(runtimeMetadata: LanguageRuntimeMetadata, sessionMetadata: RuntimeSessionMetadata): Promise<LanguageRuntimeSession>;
        restoreSession(runtimeMetadata: LanguageRuntimeMetadata, sessionMetadata: RuntimeSessionMetadata, sessionName: string): Promise<LanguageRuntimeSession>;
        validateMetadata(metadata: LanguageRuntimeMetadata): Promise<LanguageRuntimeMetadata>;
        validateSession(sessionId: string): Promise<boolean>;
    }

    export interface LanguageRuntimeInfo {
        banner: string;
    }

    export interface LanguageRuntimeMessage {
        id: string;
        parent_id: string;
        when: string;
        type: LanguageRuntimeMessageType;
    }

    export interface LanguageRuntimeStream extends LanguageRuntimeMessage {
        name: LanguageRuntimeStreamName;
        text: string;
    }

    export interface LanguageRuntimeState extends LanguageRuntimeMessage {
        state: RuntimeOnlineState;
    }

    export interface LanguageRuntimeCommMessage extends LanguageRuntimeMessage {
        comm_id: string;
        data: any;
    }

    export interface LanguageRuntimeMessageIPyWidget extends LanguageRuntimeMessage {
        original_message: LanguageRuntimeMessage;
    }

    export interface LanguageRuntimeExit {
        exit_code: number;
        reason: RuntimeExitReason;
    }

    export interface RuntimeMethodError {
        message: string;
        code: string;
    }

    export interface HelpTopicProvider {
        provideHelpTopic(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<string | undefined>;
    }

    export interface StatementRange {
        range: vscode.Range;
    }

    export interface StatementRangeProvider {
        provideStatementRange(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<StatementRange | undefined>;
    }

    export enum LanguageRuntimeStartupBehavior {
        Immediate = 'immediate',
        Implicit = 'implicit',
        Explicit = 'explicit',
    }

    export enum LanguageRuntimeSessionLocation {
        Machine = 'machine',
        Workspace = 'workspace',
    }

    export enum LanguageRuntimeSessionMode {
        Console = 'console',
        Notebook = 'notebook',
    }

    export enum RuntimeState {
        Uninitialized = 'uninitialized',
        Starting = 'starting',
        Ready = 'ready',
        Idle = 'idle',
        Busy = 'busy',
        Exited = 'exited',
    }

    export enum RuntimeOnlineState {
        Idle = 'idle',
        Busy = 'busy',
    }

    export enum RuntimeCodeExecutionMode {
        Interactive = 'interactive',
        Silent = 'silent',
    }

    export enum RuntimeErrorBehavior {
        Continue = 'continue',
        Stop = 'stop',
    }

    export enum RuntimeCodeFragmentStatus {
        Complete = 'complete',
        Incomplete = 'incomplete',
        Invalid = 'invalid',
    }

    export enum RuntimeClientType {
        Variables = 'variables',
        Plot = 'plot',
        Help = 'help',
    }

    export enum LanguageRuntimeMessageType {
        Stream = 'stream',
        State = 'state',
        CommData = 'comm_data',
        CommOpen = 'comm_open',
        CommClosed = 'comm_closed',
        IPyWidget = 'ipywidget',
    }

    export enum LanguageRuntimeStreamName {
        Stdout = 'stdout',
        Stderr = 'stderr',
    }

    export enum LanguageRuntimeSessionChannel {
        Output = 'output',
        LSP = 'lsp',
    }

    export enum RuntimeExitReason {
        Shutdown = 'shutdown',
        Error = 'error',
        Unknown = 'unknown',
    }

    export namespace runtime {
        export function registerLanguageRuntimeManager(language: string, manager: LanguageRuntimeManager): vscode.Disposable;
        export function selectLanguageRuntime(runtimeId: string): Promise<void>;
        export function getActiveSessions(): Promise<LanguageRuntimeSession[]>;
        export function getForegroundSession(): Promise<LanguageRuntimeSession | undefined>;
        export const onDidChangeForegroundSession: vscode.Event<string | undefined>;
    }

    export namespace window {
        export function getConsoleWidth(): Promise<number>;
        export const onDidChangeConsoleWidth: vscode.Event<number>;
    }

    export namespace languages {
        export function registerStatementRangeProvider(selector: vscode.DocumentSelector, provider: StatementRangeProvider): vscode.Disposable;
        export function registerHelpTopicProvider(selector: vscode.DocumentSelector, provider: HelpTopicProvider): vscode.Disposable;
    }
}
