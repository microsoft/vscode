// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { DebugConfiguration } from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { DebuggerTypeName, PythonDebuggerTypeName } from './constants';

export enum DebugOptions {
    RedirectOutput = 'RedirectOutput',
    Django = 'Django',
    Jinja = 'Jinja',
    Sudo = 'Sudo',
    Pyramid = 'Pyramid',
    FixFilePathCase = 'FixFilePathCase',
    WindowsClient = 'WindowsClient',
    UnixClient = 'UnixClient',
    StopOnEntry = 'StopOnEntry',
    ShowReturnValue = 'ShowReturnValue',
    SubProcess = 'Multiprocess',
}

export enum DebugPurpose {
    DebugTest = 'debug-test',
    DebugInTerminal = 'debug-in-terminal',
}

export type PathMapping = {
    localRoot: string;
    remoteRoot: string;
};
type Connection = {
    host?: string;
    port?: number;
};

export interface IAutomaticCodeReload {
    enable?: boolean;
    exclude?: string[];
    include?: string[];
    pollingInterval?: number;
}

interface ICommonDebugArguments {
    redirectOutput?: boolean;
    django?: boolean;
    gevent?: boolean;
    jinja?: boolean;
    debugStdLib?: boolean;
    justMyCode?: boolean;
    logToFile?: boolean;
    debugOptions?: DebugOptions[];
    port?: number;
    host?: string;
    // Show return values of functions while stepping.
    showReturnValue?: boolean;
    subProcess?: boolean;
    // An absolute path to local directory with source.
    pathMappings?: PathMapping[];
    clientOS?: 'windows' | 'unix';
}

interface IKnownAttachDebugArguments extends ICommonDebugArguments {
    workspaceFolder?: string;
    customDebugger?: boolean;
    // localRoot and remoteRoot are deprecated (replaced by pathMappings).
    localRoot?: string;
    remoteRoot?: string;

    // Internal field used to attach to subprocess using python debug adapter
    subProcessId?: number;

    processId?: number | string;
    connect?: Connection;
    listen?: Connection;
}

interface IKnownLaunchRequestArguments extends ICommonDebugArguments {
    sudo?: boolean;
    pyramid?: boolean;
    workspaceFolder?: string;
    // An absolute path to the program to debug.
    module?: string;
    program?: string;
    python?: string;
    // Automatically stop target after launch. If not specified, target does not stop.
    stopOnEntry?: boolean;
    args?: string[];
    cwd?: string;
    debugOptions?: DebugOptions[];
    env?: Record<string, string | undefined>;
    envFile?: string;
    console?: ConsoleType;

    // The following are all internal properties that are not publicly documented or
    // exposed in launch.json schema for the extension.

    // Python interpreter used by the extension to spawn the debug adapter.
    debugAdapterPython?: string;

    // Debug adapter to use in lieu of the one bundled with the extension.
    // This must be a full path that is executable with "python <debugAdapterPath>";
    // for debugpy, this is ".../src/debugpy/adapter".
    debugAdapterPath?: string;

    // Python interpreter used by the debug adapter to spawn the debug launcher.
    debugLauncherPython?: string;

    // Legacy interpreter setting. Equivalent to setting "python", "debugAdapterPython",
    // and "debugLauncherPython" all at once.
    pythonPath?: string;

    // Configures automatic code reloading.
    autoReload?: IAutomaticCodeReload;

    // Defines where the purpose where the config should be used.
    purpose?: DebugPurpose[];
}

export interface LaunchRequestArguments
    extends DebugProtocol.LaunchRequestArguments,
        IKnownLaunchRequestArguments,
        DebugConfiguration {
    type: typeof DebuggerTypeName | typeof PythonDebuggerTypeName;
}

export interface AttachRequestArguments
    extends DebugProtocol.AttachRequestArguments,
        IKnownAttachDebugArguments,
        DebugConfiguration {
    type: typeof DebuggerTypeName | typeof PythonDebuggerTypeName;
}

export interface DebugConfigurationArguments extends LaunchRequestArguments, AttachRequestArguments {}

export type ConsoleType = 'internalConsole' | 'integratedTerminal' | 'externalTerminal';

export type TriggerType = 'launch' | 'attach' | 'test';
