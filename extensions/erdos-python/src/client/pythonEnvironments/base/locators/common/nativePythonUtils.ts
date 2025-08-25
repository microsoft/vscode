// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { LogOutputChannel } from 'vscode';
import { PythonEnvKind } from '../../info';
import { traceError } from '../../../../logging';

export enum NativePythonEnvironmentKind {
    Conda = 'Conda',
    Pixi = 'Pixi',
    Homebrew = 'Homebrew',
    Pyenv = 'Pyenv',
    GlobalPaths = 'GlobalPaths',
    PyenvVirtualEnv = 'PyenvVirtualEnv',
    Pipenv = 'Pipenv',
    Poetry = 'Poetry',
    Uv = 'Uv',
    Custom = 'Custom',
    MacPythonOrg = 'MacPythonOrg',
    MacCommandLineTools = 'MacCommandLineTools',
    LinuxGlobal = 'LinuxGlobal',
    MacXCode = 'MacXCode',
    Venv = 'Venv',
    VirtualEnv = 'VirtualEnv',
    VirtualEnvWrapper = 'VirtualEnvWrapper',
    WindowsStore = 'WindowsStore',
    WindowsRegistry = 'WindowsRegistry',
}

const mapping = new Map<NativePythonEnvironmentKind, PythonEnvKind>([
    [NativePythonEnvironmentKind.Conda, PythonEnvKind.Conda],
    [NativePythonEnvironmentKind.Pixi, PythonEnvKind.Pixi],
    [NativePythonEnvironmentKind.GlobalPaths, PythonEnvKind.OtherGlobal],
    [NativePythonEnvironmentKind.Pyenv, PythonEnvKind.Pyenv],
    [NativePythonEnvironmentKind.PyenvVirtualEnv, PythonEnvKind.Pyenv],
    [NativePythonEnvironmentKind.Pipenv, PythonEnvKind.Pipenv],
    [NativePythonEnvironmentKind.Poetry, PythonEnvKind.Poetry],
    [NativePythonEnvironmentKind.VirtualEnv, PythonEnvKind.VirtualEnv],
    [NativePythonEnvironmentKind.VirtualEnvWrapper, PythonEnvKind.VirtualEnvWrapper],
    [NativePythonEnvironmentKind.Venv, PythonEnvKind.Venv],
    [NativePythonEnvironmentKind.WindowsRegistry, PythonEnvKind.System],
    [NativePythonEnvironmentKind.WindowsStore, PythonEnvKind.MicrosoftStore],
    [NativePythonEnvironmentKind.Homebrew, PythonEnvKind.System],
    [NativePythonEnvironmentKind.LinuxGlobal, PythonEnvKind.System],
    [NativePythonEnvironmentKind.MacCommandLineTools, PythonEnvKind.System],
    [NativePythonEnvironmentKind.MacPythonOrg, PythonEnvKind.System],
    [NativePythonEnvironmentKind.MacXCode, PythonEnvKind.System],
    [NativePythonEnvironmentKind.Custom, PythonEnvKind.Custom],
]);

export function categoryToKind(category?: NativePythonEnvironmentKind, logger?: LogOutputChannel): PythonEnvKind {
    if (!category) {
        return PythonEnvKind.Unknown;
    }
    const kind = mapping.get(category);
    if (kind) {
        return kind;
    }

    if (logger) {
        logger.error(`Unknown Python Environment category '${category}' from Native Locator.`);
    } else {
        traceError(`Unknown Python Environment category '${category}' from Native Locator.`);
    }
    return PythonEnvKind.Unknown;
}
