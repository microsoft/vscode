// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Event, Terminal, TextEditor, Uri } from 'vscode';
import { IDisposable, Resource } from '../common/types';
import { ReplType } from '../repl/types';

export const ICodeExecutionService = Symbol('ICodeExecutionService');

export interface ICodeExecutionService {
    execute(code: string, resource?: Uri): Promise<void>;
    executeFile(file: Uri, options?: { newTerminalPerFile: boolean }): Promise<void>;
    initializeRepl(resource?: Uri): Promise<void>;
}

export const ICodeExecutionHelper = Symbol('ICodeExecutionHelper');

export interface ICodeExecutionHelper {
    normalizeLines(code: string, replType: ReplType, wholeFileContent?: string, resource?: Uri): Promise<string>;
    getFileToExecute(): Promise<Uri | undefined>;
    saveFileIfDirty(file: Uri): Promise<Resource>;
    getSelectedTextToExecute(textEditor: TextEditor): Promise<string | undefined>;
}

export const ICodeExecutionManager = Symbol('ICodeExecutionManager');

export interface ICodeExecutionManager {
    registerCommands(): void;
}

export const ITerminalAutoActivation = Symbol('ITerminalAutoActivation');
export interface ITerminalAutoActivation extends IDisposable {
    register(): void;
    disableAutoActivation(terminal: Terminal): void;
}

export const ITerminalEnvVarCollectionService = Symbol('ITerminalEnvVarCollectionService');
export interface ITerminalEnvVarCollectionService {
    /**
     * Returns true if we know with high certainity the terminal prompt is set correctly for a particular resource.
     */
    isTerminalPromptSetCorrectly(resource?: Resource): boolean;
}

export const IShellIntegrationDetectionService = Symbol('IShellIntegrationDetectionService');
export interface IShellIntegrationDetectionService {
    onDidChangeStatus: Event<void>;
    isWorking(): Promise<boolean>;
}

export const ITerminalDeactivateService = Symbol('ITerminalDeactivateService');
export interface ITerminalDeactivateService {
    initializeScriptParams(shell: string): Promise<void>;
    getScriptLocation(shell: string, resource: Resource): Promise<string | undefined>;
}

export const IPythonStartupEnvVarService = Symbol('IPythonStartupEnvVarService');
export interface IPythonStartupEnvVarService {
    register(): void;
}
