// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Terminal, Uri } from 'vscode';
import { getEnvExtApi, getEnvironment } from './api.internal';
import { EnvironmentType, PythonEnvironment as PythonEnvironmentLegacy } from '../pythonEnvironments/info';
import { PythonEnvironment, PythonTerminalCreateOptions } from './types';
import { Architecture } from '../common/utils/platform';
import { parseVersion } from '../pythonEnvironments/base/info/pythonVersion';
import { PythonEnvType } from '../pythonEnvironments/base/info';
import { traceError } from '../logging';
import { reportActiveInterpreterChanged } from '../environmentApi';
import { getWorkspaceFolder, getWorkspaceFolders } from '../common/vscodeApis/workspaceApis';

function toEnvironmentType(pythonEnv: PythonEnvironment): EnvironmentType {
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('system')) {
        return EnvironmentType.System;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('venv')) {
        return EnvironmentType.Venv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('virtualenv')) {
        return EnvironmentType.VirtualEnv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('conda')) {
        return EnvironmentType.Conda;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('pipenv')) {
        return EnvironmentType.Pipenv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('poetry')) {
        return EnvironmentType.Poetry;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('pyenv')) {
        return EnvironmentType.Pyenv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('hatch')) {
        return EnvironmentType.Hatch;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('pixi')) {
        return EnvironmentType.Pixi;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('virtualenvwrapper')) {
        return EnvironmentType.VirtualEnvWrapper;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('activestate')) {
        return EnvironmentType.ActiveState;
    }
    return EnvironmentType.Unknown;
}

function getEnvType(kind: EnvironmentType): PythonEnvType | undefined {
    switch (kind) {
        case EnvironmentType.Pipenv:
        case EnvironmentType.VirtualEnv:
        case EnvironmentType.Pyenv:
        case EnvironmentType.Venv:
        case EnvironmentType.Poetry:
        case EnvironmentType.Hatch:
        case EnvironmentType.Pixi:
        case EnvironmentType.VirtualEnvWrapper:
        case EnvironmentType.ActiveState:
            return PythonEnvType.Virtual;

        case EnvironmentType.Conda:
            return PythonEnvType.Conda;

        case EnvironmentType.MicrosoftStore:
        case EnvironmentType.Global:
        case EnvironmentType.System:
        default:
            return undefined;
    }
}

function toLegacyType(env: PythonEnvironment): PythonEnvironmentLegacy {
    const ver = parseVersion(env.version);
    const envType = toEnvironmentType(env);
    return {
        id: env.environmentPath.fsPath,
        displayName: env.displayName,
        detailedDisplayName: env.name,
        envType,
        envPath: env.sysPrefix,
        type: getEnvType(envType),
        path: env.environmentPath.fsPath,
        version: {
            raw: env.version,
            major: ver.major,
            minor: ver.minor,
            patch: ver.micro,
            build: [],
            prerelease: [],
        },
        sysVersion: env.version,
        architecture: Architecture.x64,
        sysPrefix: env.sysPrefix,
    };
}

const previousEnvMap = new Map<string, PythonEnvironment | undefined>();
export async function getActiveInterpreterLegacy(resource?: Uri): Promise<PythonEnvironmentLegacy | undefined> {
    const api = await getEnvExtApi();
    const uri = resource ? api.getPythonProject(resource)?.uri : undefined;

    const pythonEnv = await getEnvironment(resource);
    const oldEnv = previousEnvMap.get(uri?.fsPath || '');
    const newEnv = pythonEnv ? toLegacyType(pythonEnv) : undefined;

    const folders = getWorkspaceFolders() ?? [];
    const shouldReport =
        (folders.length === 0 && resource === undefined) || (folders.length > 0 && resource !== undefined);
    if (shouldReport && newEnv && oldEnv?.envId.id !== pythonEnv?.envId.id) {
        reportActiveInterpreterChanged({
            resource: getWorkspaceFolder(resource),
            path: newEnv.path,
        });
        previousEnvMap.set(uri?.fsPath || '', pythonEnv);
    }
    return pythonEnv ? toLegacyType(pythonEnv) : undefined;
}

export async function setInterpreterLegacy(pythonPath: string, uri: Uri | undefined): Promise<void> {
    const api = await getEnvExtApi();
    const pythonEnv = await api.resolveEnvironment(Uri.file(pythonPath));
    if (!pythonEnv) {
        traceError(`EnvExt: Failed to resolve environment for ${pythonPath}`);
        return;
    }
    await api.setEnvironment(uri, pythonEnv);
}

export async function resetInterpreterLegacy(uri: Uri | undefined): Promise<void> {
    const api = await getEnvExtApi();
    await api.setEnvironment(uri, undefined);
}

export async function ensureTerminalLegacy(
    resource: Uri | undefined,
    options?: PythonTerminalCreateOptions,
): Promise<Terminal> {
    const api = await getEnvExtApi();
    const pythonEnv = await api.getEnvironment(resource);
    const project = resource ? api.getPythonProject(resource) : undefined;

    if (pythonEnv && project) {
        const fixedOptions = options ? { ...options } : { cwd: project.uri };
        const terminal = await api.createTerminal(pythonEnv, fixedOptions);
        return terminal;
    }
    throw new Error('Invalid arguments to create terminal');
}
