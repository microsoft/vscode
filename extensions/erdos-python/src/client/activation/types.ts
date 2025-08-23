// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Event } from 'vscode';
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient/node';
import type { IDisposable, ILogOutputChannel, Resource } from '../common/types';
import { StopWatch } from '../common/utils/stopWatch';
import { PythonEnvironment } from '../pythonEnvironments/info';

export const IExtensionActivationManager = Symbol('IExtensionActivationManager');
/**
 * Responsible for activation of extension.
 */
export interface IExtensionActivationManager extends IDisposable {
    // Method invoked when extension activates (invoked once).
    activate(startupStopWatch: StopWatch): Promise<void>;
    /**
     * Method invoked when a workspace is loaded.
     * This is where we place initialization scripts for each workspace.
     * (e.g. if we need to run code for each workspace, then this is where that happens).
     */
    activateWorkspace(resource: Resource): Promise<void>;
}

export const IExtensionActivationService = Symbol('IExtensionActivationService');
/**
 * Classes implementing this interface will have their `activate` methods
 * invoked for every workspace folder (in multi-root workspace folders) during the activation of the extension.
 * This is a great hook for extension activation code, i.e. you don't need to modify
 * the `extension.ts` file to invoke some code when extension gets activated.
 */
export interface IExtensionActivationService {
    supportedWorkspaceTypes: { untrustedWorkspace: boolean; virtualWorkspace: boolean };
    activate(resource: Resource, startupStopWatch?: StopWatch): Promise<void>;
}

export enum LanguageServerType {
    Jedi = 'Jedi',
    JediLSP = 'JediLSP',
    Microsoft = 'Microsoft',
    Node = 'Pylance',
    None = 'None',
}

export const ILanguageServerActivator = Symbol('ILanguageServerActivator');
export interface ILanguageServerActivator {
    start(resource: Resource, interpreter: PythonEnvironment | undefined): Promise<void>;
    activate(): void;
    deactivate(): void;
}

export const ILanguageClientFactory = Symbol('ILanguageClientFactory');
export interface ILanguageClientFactory {
    createLanguageClient(
        resource: Resource,
        interpreter: PythonEnvironment | undefined,
        clientOptions: LanguageClientOptions,
        env?: NodeJS.ProcessEnv,
    ): Promise<LanguageClient>;
}
export const ILanguageServerAnalysisOptions = Symbol('ILanguageServerAnalysisOptions');
export interface ILanguageServerAnalysisOptions extends IDisposable {
    readonly onDidChange: Event<void>;
    initialize(resource: Resource, interpreter: PythonEnvironment | undefined): Promise<void>;
    getAnalysisOptions(): Promise<LanguageClientOptions>;
}
export const ILanguageServerManager = Symbol('ILanguageServerManager');
export interface ILanguageServerManager extends IDisposable {
    start(resource: Resource, interpreter: PythonEnvironment | undefined): Promise<void>;
    connect(): void;
    disconnect(): void;
}

export const ILanguageServerProxy = Symbol('ILanguageServerProxy');
export interface ILanguageServerProxy extends IDisposable {
    start(
        resource: Resource,
        interpreter: PythonEnvironment | undefined,
        options: LanguageClientOptions,
    ): Promise<void>;
    stop(): Promise<void>;
    /**
     * Sends a request to LS so as to load other extensions.
     * This is used as a plugin loader mechanism.
     * Anyone (such as intellicode) wanting to interact with LS, needs to send this request to LS.
     */
    loadExtension(args?: unknown): void;
}

export const ILanguageServerOutputChannel = Symbol('ILanguageServerOutputChannel');
export interface ILanguageServerOutputChannel {
    /**
     * Creates output channel if necessary and returns it
     */
    readonly channel: ILogOutputChannel;
}

export const IExtensionSingleActivationService = Symbol('IExtensionSingleActivationService');
/**
 * Classes implementing this interface will have their `activate` methods
 * invoked during the activation of the extension.
 * This is a great hook for extension activation code, i.e. you don't need to modify
 * the `extension.ts` file to invoke some code when extension gets activated.
 */
export interface IExtensionSingleActivationService {
    supportedWorkspaceTypes: { untrustedWorkspace: boolean; virtualWorkspace: boolean };
    activate(): Promise<void>;
}
