// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Socket } from 'net';
import {
    CancellationToken,
    ConfigurationChangeEvent,
    ConfigurationTarget,
    Disposable,
    DocumentSymbolProvider,
    Event,
    Extension,
    ExtensionContext,
    Memento,
    LogOutputChannel,
    Uri,
} from 'vscode';
import { LanguageServerType } from '../activation/types';
import type { InstallOptions, InterpreterUri, ModuleInstallFlags } from './installer/types';
import { EnvironmentVariables } from './variables/types';
import { ITestingSettings } from '../testing/configuration/types';

export interface IDisposable {
    dispose(): void | undefined | Promise<void>;
}

export const ILogOutputChannel = Symbol('ILogOutputChannel');
export interface ILogOutputChannel extends LogOutputChannel {}
export const IDocumentSymbolProvider = Symbol('IDocumentSymbolProvider');
export interface IDocumentSymbolProvider extends DocumentSymbolProvider {}
export const IsWindows = Symbol('IS_WINDOWS');
export const IDisposableRegistry = Symbol('IDisposableRegistry');
export type IDisposableRegistry = IDisposable[];
export const IMemento = Symbol('IGlobalMemento');
export const GLOBAL_MEMENTO = Symbol('IGlobalMemento');
export const WORKSPACE_MEMENTO = Symbol('IWorkspaceMemento');

export type Resource = Uri | undefined;
export interface IPersistentState<T> {
    /**
     * Storage is exposed in this type to make sure folks always use persistent state
     * factory to access any type of storage as all storages are tracked there.
     */
    readonly storage: Memento;
    readonly value: T;
    updateValue(value: T): Promise<void>;
}

export type ReadWrite<T> = {
    -readonly [P in keyof T]: T[P];
};

export const IPersistentStateFactory = Symbol('IPersistentStateFactory');

export interface IPersistentStateFactory {
    createGlobalPersistentState<T>(key: string, defaultValue?: T, expiryDurationMs?: number): IPersistentState<T>;
    createWorkspacePersistentState<T>(key: string, defaultValue?: T, expiryDurationMs?: number): IPersistentState<T>;
}

export type ExecutionInfo = {
    execPath?: string;
    moduleName?: string;
    args: string[];
    product?: Product;
    useShell?: boolean;
};

export enum InstallerResponse {
    Installed,
    Disabled,
    Ignore,
}

export enum ProductInstallStatus {
    Installed,
    NotInstalled,
    NeedsUpgrade,
}

export enum ProductType {
    TestFramework = 'TestFramework',
    DataScience = 'DataScience',
    Python = 'Python',
}

export enum Product {
    pytest = 1,
    unittest = 12,
    ipykernel = 19,
    tensorboard = 24,
    torchProfilerInstallName = 25,
    torchProfilerImportName = 26,
    pip = 27,
    ensurepip = 28,
    python = 29,
    sqlite3 = 102,
}

export const IInstaller = Symbol('IInstaller');

export interface IInstaller {
    promptToInstall(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
        message?: string,
    ): Promise<InstallerResponse>;
    install(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
    ): Promise<InstallerResponse>;
    isInstalled(product: Product, resource?: InterpreterUri): Promise<boolean>;
    isProductVersionCompatible(
        product: Product,
        semVerRequirement: string,
        resource?: InterpreterUri,
    ): Promise<ProductInstallStatus>;
    translateProductToModuleName(product: Product): string;
}

// TODO: Drop IPathUtils in favor of IFileSystemPathUtils.
// See https://github.com/microsoft/vscode-python/issues/8542.
export const IPathUtils = Symbol('IPathUtils');
export interface IPathUtils {
    readonly delimiter: string;
    readonly home: string;
    /**
     * The platform-specific file separator. '\\' or '/'.
     * @type {string}
     * @memberof IPathUtils
     */
    readonly separator: string;
    getPathVariableName(): 'Path' | 'PATH';
    basename(pathValue: string, ext?: string): string;
    getDisplayName(pathValue: string, cwd?: string): string;
}

export const IRandom = Symbol('IRandom');
export interface IRandom {
    getRandomInt(min?: number, max?: number): number;
}

export const ICurrentProcess = Symbol('ICurrentProcess');
export interface ICurrentProcess {
    readonly env: EnvironmentVariables;
    readonly argv: string[];
    readonly stdout: NodeJS.WriteStream;
    readonly stdin: NodeJS.ReadStream;
    readonly execPath: string;
    // eslint-disable-next-line @typescript-eslint/ban-types
    on(event: string | symbol, listener: Function): this;
}

export interface IPythonSettings {
    readonly interpreter: IInterpreterSettings;
    readonly pythonPath: string;
    readonly venvPath: string;
    readonly venvFolders: string[];
    readonly activeStateToolPath: string;
    readonly condaPath: string;
    readonly pipenvPath: string;
    readonly poetryPath: string;
    readonly pixiToolPath: string;
    readonly devOptions: string[];
    readonly testing: ITestingSettings;
    readonly autoComplete: IAutoCompleteSettings;
    readonly terminal: ITerminalSettings;
    readonly envFile: string;
    readonly globalModuleInstallation: boolean;
    readonly experiments: IExperiments;
    readonly languageServer: LanguageServerType;
    readonly languageServerIsDefault: boolean;
    readonly languageServerDebug: boolean;
    readonly languageServerLogLevel: string;
    readonly quietMode: boolean;
    readonly interpretersInclude: string[];
    readonly interpretersExclude: string[];
    readonly enableAutoReload: boolean;
    readonly defaultInterpreterPath: string;
    readonly REPL: IREPLSettings;
    register(): void;
}

export interface IInterpreterSettings {
    infoVisibility: 'never' | 'onPythonRelated' | 'always';
}

export interface ITerminalSettings {
    readonly executeInFileDir: boolean;
    readonly focusAfterLaunch: boolean;
    readonly launchArgs: string[];
    readonly activateEnvironment: boolean;
    readonly activateEnvInCurrentTerminal: boolean;
    readonly shellIntegration: {
        enabled: boolean;
    };
}

export interface IREPLSettings {
    readonly enableREPLSmartSend: boolean;
    readonly sendToNativeREPL: boolean;
}

export interface IExperiments {
    /**
     * Return `true` if experiments are enabled, else `false`.
     */
    readonly enabled: boolean;
    /**
     * Experiments user requested to opt into manually
     */
    readonly optInto: string[];
    /**
     * Experiments user requested to opt out from manually
     */
    readonly optOutFrom: string[];
}

export interface IAutoCompleteSettings {
    readonly extraPaths: string[];
}

export const IConfigurationService = Symbol('IConfigurationService');
export interface IConfigurationService {
    readonly onDidChange: Event<ConfigurationChangeEvent | undefined>;
    getSettings(resource?: Uri): IPythonSettings;
    isTestExecution(): boolean;
    updateSetting(setting: string, value?: unknown, resource?: Uri, configTarget?: ConfigurationTarget): Promise<void>;
    updateSectionSetting(
        section: string,
        setting: string,
        value?: unknown,
        resource?: Uri,
        configTarget?: ConfigurationTarget,
    ): Promise<void>;
}

/**
 * Carries various tool execution path settings. For eg. pipenvPath, condaPath, pytestPath etc. These can be
 * potentially used in discovery, autoselection, activation, installers, execution etc. And so should be a
 * common interface to all the components.
 */
export const IToolExecutionPath = Symbol('IToolExecutionPath');
export interface IToolExecutionPath {
    readonly executable: string;
}
export enum ToolExecutionPath {
    pipenv = 'pipenv',
    // Gradually populate this list with tools as they come up.
}

export const ISocketServer = Symbol('ISocketServer');
export interface ISocketServer extends Disposable {
    readonly client: Promise<Socket>;
    Start(options?: { port?: number; host?: string }): Promise<number>;
}

export type DownloadOptions = {
    /**
     * Prefix for progress messages displayed.
     *
     * @type {('Downloading ... ' | string)}
     */
    progressMessagePrefix: 'Downloading ... ' | string;
    /**
     * Extension of file that'll be created when downloading the file.
     *
     * @type {('tmp' | string)}
     */
    extension: 'tmp' | string;
};

export const IExtensionContext = Symbol('ExtensionContext');
export interface IExtensionContext extends ExtensionContext {}

export const IExtensions = Symbol('IExtensions');
export interface IExtensions {
    /**
     * All extensions currently known to the system.
     */

    readonly all: readonly Extension<unknown>[];

    /**
     * An event which fires when `extensions.all` changes. This can happen when extensions are
     * installed, uninstalled, enabled or disabled.
     */
    readonly onDidChange: Event<void>;

    /**
     * Get an extension by its full identifier in the form of: `publisher.name`.
     *
     * @param extensionId An extension identifier.
     * @return An extension or `undefined`.
     */

    getExtension(extensionId: string): Extension<unknown> | undefined;

    /**
     * Get an extension its full identifier in the form of: `publisher.name`.
     *
     * @param extensionId An extension identifier.
     * @return An extension or `undefined`.
     */
    getExtension<T>(extensionId: string): Extension<T> | undefined;

    /**
     * Determines which extension called into our extension code based on call stacks.
     */
    determineExtensionFromCallStack(): Promise<{ extensionId: string; displayName: string }>;
}

export const IBrowserService = Symbol('IBrowserService');
export interface IBrowserService {
    launch(url: string): void;
}

/**
 * Stores hash formats
 */
export interface IHashFormat {
    number: number; // If hash format is a number
    string: string; // If hash format is a string
}

/**
 * Experiment service leveraging VS Code's experiment framework.
 */
export const IExperimentService = Symbol('IExperimentService');
export interface IExperimentService {
    activate(): Promise<void>;
    inExperiment(experimentName: string): Promise<boolean>;
    inExperimentSync(experimentName: string): boolean;
    getExperimentValue<T extends boolean | number | string>(experimentName: string): Promise<T | undefined>;
}

export type InterpreterConfigurationScope = { uri: Resource; configTarget: ConfigurationTarget };
export type InspectInterpreterSettingType = {
    globalValue?: string;
    workspaceValue?: string;
    workspaceFolderValue?: string;
};

/**
 * Interface used to access current Interpreter Path
 */
export const IInterpreterPathService = Symbol('IInterpreterPathService');
export interface IInterpreterPathService {
    onDidChange: Event<InterpreterConfigurationScope>;
    get(resource: Resource): string;
    inspect(resource: Resource): InspectInterpreterSettingType;
    update(resource: Resource, configTarget: ConfigurationTarget, value: string | undefined): Promise<void>;
    copyOldInterpreterStorageValuesToNew(resource: Resource): Promise<void>;
}

export type DefaultLSType = LanguageServerType.Jedi | LanguageServerType.Node;

/**
 * Interface used to retrieve the default language server.
 *
 * Note: This is added to get around a problem that the config service is not `async`.
 * Adding experiment check there would mean touching the entire extension. For simplicity
 * this is a solution.
 */
export const IDefaultLanguageServer = Symbol('IDefaultLanguageServer');

export interface IDefaultLanguageServer {
    readonly defaultLSType: DefaultLSType;
}
