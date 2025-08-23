// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { LanguageServerType } from '../activation/types';
import { Resource } from '../common/types';
import { PythonEnvironment } from '../pythonEnvironments/info';

export const ILanguageServerWatcher = Symbol('ILanguageServerWatcher');
/**
 * The language server watcher serves as a singleton that watches for changes to the language server setting,
 * and instantiates the relevant language server extension manager.
 */
export interface ILanguageServerWatcher {
    readonly languageServerExtensionManager: ILanguageServerExtensionManager | undefined;
    readonly languageServerType: LanguageServerType;
    startLanguageServer(languageServerType: LanguageServerType, resource?: Resource): Promise<void>;
    restartLanguageServers(): Promise<void>;
    get(resource: Resource, interpreter?: PythonEnvironment): Promise<ILanguageServerExtensionManager>;
}

/**
 * `ILanguageServerExtensionManager` implementations act as wrappers for anything related to their specific language server extension.
 * They are responsible for starting and stopping the language server provided by their LS extension.
 * They also extend the `ILanguageServer` interface via `ILanguageServerCapabilities` to continue supporting the Jupyter integration.
 */
export interface ILanguageServerExtensionManager {
    startLanguageServer(resource: Resource, interpreter?: PythonEnvironment): Promise<void>;
    stopLanguageServer(): Promise<void>;
    canStartLanguageServer(interpreter: PythonEnvironment | undefined): boolean;
    languageServerNotAvailable(): Promise<void>;
    dispose(): void;
}
