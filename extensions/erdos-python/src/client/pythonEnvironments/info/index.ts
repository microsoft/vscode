// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Architecture } from '../../common/utils/platform';
import { PythonEnvType } from '../base/info';
import { PythonVersion } from './pythonVersion';

/**
 * The supported Python environment types.
 */
export enum EnvironmentType {
    Unknown = 'Unknown',
    Conda = 'Conda',
    VirtualEnv = 'VirtualEnv',
    Pipenv = 'PipEnv',
    Pyenv = 'Pyenv',
    Venv = 'Venv',
    MicrosoftStore = 'MicrosoftStore',
    Poetry = 'Poetry',
    Hatch = 'Hatch',
    Pixi = 'Pixi',
    VirtualEnvWrapper = 'VirtualEnvWrapper',
    ActiveState = 'ActiveState',
    Global = 'Global',
    System = 'System',
}
/**
 * These envs are only created for a specific workspace, which we're able to detect.
 */
export const workspaceVirtualEnvTypes = [EnvironmentType.Poetry, EnvironmentType.Pipenv, EnvironmentType.Pixi];

export const virtualEnvTypes = [
    ...workspaceVirtualEnvTypes,
    EnvironmentType.Hatch, // This is also a workspace virtual env, but we're not treating it as such as of today.
    EnvironmentType.Venv,
    EnvironmentType.VirtualEnvWrapper,
    EnvironmentType.Conda,
    EnvironmentType.VirtualEnv,
];

/**
 * The IModuleInstaller implementations.
 */
export enum ModuleInstallerType {
    Unknown = 'Unknown',
    Conda = 'Conda',
    Pip = 'Pip',
    Poetry = 'Poetry',
    Pipenv = 'Pipenv',
    Pixi = 'Pixi',
}

/**
 * Details about a Python runtime.
 *
 * @prop path - the location of the executable file
 * @prop version - the runtime version
 * @prop sysVersion - the raw value of `sys.version`
 * @prop architecture - of the host CPU (e.g. `x86`)
 * @prop sysPrefix - the environment's install root (`sys.prefix`)
 * @prop pipEnvWorkspaceFolder - the pipenv root, if applicable
 */
export type InterpreterInformation = {
    path: string;
    version?: PythonVersion;
    sysVersion?: string;
    architecture: Architecture;
    sysPrefix: string;
    pipEnvWorkspaceFolder?: string;
    implementation?: string;
};

/**
 * Details about a Python environment.
 *
 * @prop companyDisplayName - the user-facing name of the distro publisher
 * @prop displayName - the user-facing name for the environment
 * @prop envType - the kind of Python environment
 * @prop envName - the environment's name, if applicable (else `envPath` is set)
 * @prop envPath - the environment's root dir, if applicable (else `envName`)
 * @prop cachedEntry - whether or not the info came from a cache
 * @prop type - the type of Python environment, if applicable
 */
// Note that "cachedEntry" is specific to the caching machinery
// and doesn't really belong here.
export type PythonEnvironment = InterpreterInformation & {
    id?: string;
    companyDisplayName?: string;
    displayName?: string;
    detailedDisplayName?: string;
    envType: EnvironmentType;
    envName?: string;
    envPath?: string;
    cachedEntry?: boolean;
    type?: PythonEnvType;
};

/**
 * Convert the Python environment type to a user-facing name.
 */
export function getEnvironmentTypeName(environmentType: EnvironmentType): string {
    switch (environmentType) {
        case EnvironmentType.Conda: {
            return 'conda';
        }
        case EnvironmentType.Pipenv: {
            return 'Pipenv';
        }
        case EnvironmentType.Pyenv: {
            return 'pyenv';
        }
        case EnvironmentType.Venv: {
            return 'venv';
        }
        case EnvironmentType.VirtualEnv: {
            return 'virtualenv';
        }
        case EnvironmentType.MicrosoftStore: {
            return 'Microsoft Store';
        }
        case EnvironmentType.Poetry: {
            return 'Poetry';
        }
        case EnvironmentType.Hatch: {
            return 'Hatch';
        }
        case EnvironmentType.Pixi: {
            return 'pixi';
        }
        case EnvironmentType.VirtualEnvWrapper: {
            return 'virtualenvwrapper';
        }
        case EnvironmentType.ActiveState: {
            return 'ActiveState';
        }
        default: {
            return '';
        }
    }
}
