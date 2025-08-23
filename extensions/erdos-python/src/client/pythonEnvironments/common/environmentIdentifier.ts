// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { traceWarn } from '../../logging';
import { PythonEnvKind } from '../base/info';
import { getPrioritizedEnvKinds } from '../base/info/envKind';
import { isCondaEnvironment } from './environmentManagers/conda';
import { isGloballyInstalledEnv } from './environmentManagers/globalInstalledEnvs';
import { isPipenvEnvironment } from './environmentManagers/pipenv';
import { isPoetryEnvironment } from './environmentManagers/poetry';
import { isPyenvEnvironment } from './environmentManagers/pyenv';
import {
    isVenvEnvironment,
    isVirtualenvEnvironment as isVirtualEnvEnvironment,
    isVirtualenvwrapperEnvironment as isVirtualEnvWrapperEnvironment,
} from './environmentManagers/simplevirtualenvs';
import { isMicrosoftStoreEnvironment } from './environmentManagers/microsoftStoreEnv';
import { isActiveStateEnvironment } from './environmentManagers/activestate';
import { isPixiEnvironment } from './environmentManagers/pixi';

const notImplemented = () => Promise.resolve(false);

function getIdentifiers(): Map<PythonEnvKind, (path: string) => Promise<boolean>> {
    const defaultTrue = () => Promise.resolve(true);
    const identifier: Map<PythonEnvKind, (path: string) => Promise<boolean>> = new Map();
    Object.values(PythonEnvKind).forEach((k) => {
        identifier.set(k, notImplemented);
    });

    identifier.set(PythonEnvKind.Conda, isCondaEnvironment);
    identifier.set(PythonEnvKind.MicrosoftStore, isMicrosoftStoreEnvironment);
    identifier.set(PythonEnvKind.Pipenv, isPipenvEnvironment);
    identifier.set(PythonEnvKind.Pyenv, isPyenvEnvironment);
    identifier.set(PythonEnvKind.Poetry, isPoetryEnvironment);
    identifier.set(PythonEnvKind.Pixi, isPixiEnvironment);
    identifier.set(PythonEnvKind.Venv, isVenvEnvironment);
    identifier.set(PythonEnvKind.VirtualEnvWrapper, isVirtualEnvWrapperEnvironment);
    identifier.set(PythonEnvKind.VirtualEnv, isVirtualEnvEnvironment);
    identifier.set(PythonEnvKind.ActiveState, isActiveStateEnvironment);
    identifier.set(PythonEnvKind.Unknown, defaultTrue);
    identifier.set(PythonEnvKind.OtherGlobal, isGloballyInstalledEnv);
    return identifier;
}

export function isIdentifierRegistered(kind: PythonEnvKind): boolean {
    const identifiers = getIdentifiers();
    const identifier = identifiers.get(kind);
    if (identifier === notImplemented) {
        return false;
    }
    return true;
}

/**
 * Returns environment type.
 * @param {string} path : Absolute path to the python interpreter binary or path to environment.
 * @returns {PythonEnvKind}
 */
export async function identifyEnvironment(path: string): Promise<PythonEnvKind> {
    const identifiers = getIdentifiers();
    const prioritizedEnvTypes = getPrioritizedEnvKinds();
    for (const e of prioritizedEnvTypes) {
        const identifier = identifiers.get(e);
        if (
            identifier &&
            (await identifier(path).catch((ex) => {
                traceWarn(`Identifier for ${e} failed to identify ${path}`, ex);
                return false;
            }))
        ) {
            return e;
        }
    }
    return PythonEnvKind.Unknown;
}
