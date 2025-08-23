// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { DiagnosticSeverity, Uri } from 'vscode';
import { Resource } from '../../common/types';
import { PythonPathSource } from '../../debugger/extension/types';
import { DiagnosticCodes } from './constants';

export enum DiagnosticScope {
    Global = 'Global',
    WorkspaceFolder = 'WorkspaceFolder',
}

export interface IDiagnostic {
    readonly code: DiagnosticCodes;
    readonly message: string;
    readonly severity: DiagnosticSeverity;
    readonly scope: DiagnosticScope;
    readonly resource: Resource;
    readonly invokeHandler: 'always' | 'default';
    readonly shouldShowPrompt?: boolean;
}

export const IDiagnosticsService = Symbol('IDiagnosticsService');

export interface IDiagnosticsService {
    readonly runInBackground: boolean;
    readonly runInUntrustedWorkspace: boolean;
    diagnose(resource: Resource): Promise<IDiagnostic[]>;
    canHandle(diagnostic: IDiagnostic): Promise<boolean>;
    handle(diagnostics: IDiagnostic[]): Promise<void>;
}

export const IDiagnosticFilterService = Symbol('IDiagnosticFilterService');

export interface IDiagnosticFilterService {
    shouldIgnoreDiagnostic(code: string): Promise<boolean>;
    ignoreDiagnostic(code: string, scope: DiagnosticScope): Promise<void>;
}

export const IDiagnosticHandlerService = Symbol('IDiagnosticHandlerService');

export interface IDiagnosticHandlerService<T> {
    handle(diagnostic: IDiagnostic, options?: T): Promise<void>;
}

export interface IDiagnosticCommand {
    readonly diagnostic: IDiagnostic;
    invoke(): Promise<void>;
}

export type IDiagnosticMessageOnCloseHandler = (response?: string) => void;

export const IInvalidPythonPathInSettings = Symbol('IInvalidPythonPathInSettings');

export interface IInvalidPythonPathInSettings extends IDiagnosticsService {
    validateInterpreterPathInSettings(resource: Resource): Promise<boolean>;
}

export const IInvalidPythonPathInDebuggerService = Symbol('IInvalidPythonPathInDebuggerService');

export interface IInvalidPythonPathInDebuggerService extends IDiagnosticsService {
    validatePythonPath(pythonPath?: string, pythonPathSource?: PythonPathSource, resource?: Uri): Promise<boolean>;
}
