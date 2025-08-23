// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { cloneDeep, isEqual } from 'lodash';
import * as path from 'path';
import { Uri } from 'vscode';
import { getArchitectureDisplayName } from '../../../common/platform/registry';
import { Architecture } from '../../../common/utils/platform';
import { arePathsSame, isParentPath, normCasePath } from '../../common/externalDependencies';
import { getKindDisplayName } from './envKind';
import { areIdenticalVersion, areSimilarVersions, getVersionDisplayString, isVersionEmpty } from './pythonVersion';

import {
    EnvPathType,
    globallyInstalledEnvKinds,
    PythonEnvInfo,
    PythonEnvKind,
    PythonEnvSource,
    PythonEnvType,
    PythonReleaseLevel,
    PythonVersion,
    virtualEnvKinds,
} from '.';
import { BasicEnvInfo } from '../locator';

/**
 * Create a new info object with all values empty.
 *
 * @param init - if provided, these values are applied to the new object
 */
export function buildEnvInfo(init?: {
    kind?: PythonEnvKind;
    executable?: string;
    name?: string;
    location?: string;
    version?: PythonVersion;
    org?: string;
    arch?: Architecture;
    fileInfo?: { ctime: number; mtime: number };
    source?: PythonEnvSource[];
    display?: string;
    sysPrefix?: string;
    searchLocation?: Uri;
    type?: PythonEnvType;
    /**
     * Command used to run Python in this environment.
     * E.g. `conda run -n envName python` or `python.exe`
     */
    pythonRunCommand?: string[];
    identifiedUsingNativeLocator?: boolean;
}): PythonEnvInfo {
    const env: PythonEnvInfo = {
        name: init?.name ?? '',
        location: '',
        kind: PythonEnvKind.Unknown,
        executable: {
            filename: '',
            sysPrefix: init?.sysPrefix ?? '',
            ctime: init?.fileInfo?.ctime ?? -1,
            mtime: init?.fileInfo?.mtime ?? -1,
        },
        searchLocation: undefined,
        display: init?.display,
        version: {
            major: -1,
            minor: -1,
            micro: -1,
            release: {
                level: PythonReleaseLevel.Final,
                serial: 0,
            },
        },
        arch: init?.arch ?? Architecture.Unknown,
        distro: {
            org: init?.org ?? '',
        },
        source: init?.source ?? [],
        pythonRunCommand: init?.pythonRunCommand,
        identifiedUsingNativeLocator: init?.identifiedUsingNativeLocator,
    };
    if (init !== undefined) {
        updateEnv(env, init);
    }
    env.id = getEnvID(env.executable.filename, env.location);
    return env;
}

export function areEnvsDeepEqual(env1: PythonEnvInfo, env2: PythonEnvInfo): boolean {
    const env1Clone = cloneDeep(env1);
    const env2Clone = cloneDeep(env2);
    // Cannot compare searchLocation as they are Uri objects.
    delete env1Clone.searchLocation;
    delete env2Clone.searchLocation;
    env1Clone.source = env1Clone.source.sort();
    env2Clone.source = env2Clone.source.sort();
    const searchLocation1 = env1.searchLocation?.fsPath ?? '';
    const searchLocation2 = env2.searchLocation?.fsPath ?? '';
    const searchLocation1Scheme = env1.searchLocation?.scheme ?? '';
    const searchLocation2Scheme = env2.searchLocation?.scheme ?? '';
    return (
        isEqual(env1Clone, env2Clone) &&
        arePathsSame(searchLocation1, searchLocation2) &&
        searchLocation1Scheme === searchLocation2Scheme
    );
}

/**
 * Return a deep copy of the given env info.
 *
 * @param updates - if provided, these values are applied to the copy
 */
export function copyEnvInfo(
    env: PythonEnvInfo,
    updates?: {
        kind?: PythonEnvKind;
    },
): PythonEnvInfo {
    // We don't care whether or not extra/hidden properties
    // get preserved, so we do the easy thing here.
    const copied = cloneDeep(env);
    if (updates !== undefined) {
        updateEnv(copied, updates);
    }
    return copied;
}

function updateEnv(
    env: PythonEnvInfo,
    updates: {
        kind?: PythonEnvKind;
        executable?: string;
        location?: string;
        version?: PythonVersion;
        searchLocation?: Uri;
        type?: PythonEnvType;
    },
): void {
    if (updates.kind !== undefined) {
        env.kind = updates.kind;
    }
    if (updates.executable !== undefined) {
        env.executable.filename = updates.executable;
    }
    if (updates.location !== undefined) {
        env.location = updates.location;
    }
    if (updates.version !== undefined) {
        env.version = updates.version;
    }
    if (updates.searchLocation !== undefined) {
        env.searchLocation = updates.searchLocation;
    }
    if (updates.type !== undefined) {
        env.type = updates.type;
    }
}

/**
 * Convert the env info to a user-facing representation.
 *
 * The format is `Python <Version> <bitness> (<env name>: <env type>)`
 * E.g. `Python 3.5.1 32-bit (myenv2: virtualenv)`
 */
export function setEnvDisplayString(env: PythonEnvInfo): void {
    env.display = buildEnvDisplayString(env);
    env.detailedDisplayName = buildEnvDisplayString(env, true);
}

function buildEnvDisplayString(env: PythonEnvInfo, getAllDetails = false): string {
    // main parts
    const shouldDisplayKind = getAllDetails || globallyInstalledEnvKinds.includes(env.kind);
    const shouldDisplayArch = !virtualEnvKinds.includes(env.kind);
    const displayNameParts: string[] = ['Python'];
    if (env.version && !isVersionEmpty(env.version)) {
        displayNameParts.push(getVersionDisplayString(env.version));
    }
    if (shouldDisplayArch) {
        const archName = getArchitectureDisplayName(env.arch);
        if (archName !== '') {
            displayNameParts.push(archName);
        }
    }

    // Note that currently we do not use env.distro in the display name.

    // "suffix"
    const envSuffixParts: string[] = [];
    if (env.name && env.name !== '') {
        envSuffixParts.push(`'${env.name}'`);
    } else if (env.location && env.location !== '') {
        if (env.kind === PythonEnvKind.Conda) {
            const condaEnvName = path.basename(env.location);
            envSuffixParts.push(`'${condaEnvName}'`);
        }
    }
    if (shouldDisplayKind) {
        const kindName = getKindDisplayName(env.kind);
        if (kindName !== '') {
            envSuffixParts.push(kindName);
        }
    }
    const envSuffix = envSuffixParts.length === 0 ? '' : `(${envSuffixParts.join(': ')})`;

    // Pull it all together.
    return `${displayNameParts.join(' ')} ${envSuffix}`.trim();
}

/**
 * For the given data, build a normalized partial info object.
 *
 * If insufficient data is provided to generate a minimal object, such
 * that it is not identifiable, then `undefined` is returned.
 */
function getMinimalPartialInfo(env: string | PythonEnvInfo | BasicEnvInfo): Partial<PythonEnvInfo> | undefined {
    if (typeof env === 'string') {
        if (env === '') {
            return undefined;
        }
        return {
            id: '',
            executable: {
                filename: env,
                sysPrefix: '',
                ctime: -1,
                mtime: -1,
            },
        };
    }
    if ('executablePath' in env) {
        return {
            id: '',
            executable: {
                filename: env.executablePath,
                sysPrefix: '',
                ctime: -1,
                mtime: -1,
            },
            location: env.envPath,
            kind: env.kind,
            source: env.source,
        };
    }
    return env;
}

/**
 * Returns path to environment folder or path to interpreter that uniquely identifies an environment.
 */
export function getEnvPath(interpreterPath: string, envFolderPath?: string): EnvPathType {
    let envPath: EnvPathType = { path: interpreterPath, pathType: 'interpreterPath' };
    if (envFolderPath && !isParentPath(interpreterPath, envFolderPath)) {
        // Executable is not inside the environment folder, env folder is the ID.
        envPath = { path: envFolderPath, pathType: 'envFolderPath' };
    }
    return envPath;
}

/**
 * Gets general unique identifier for most environments.
 */
export function getEnvID(interpreterPath: string, envFolderPath?: string): string {
    return normCasePath(getEnvPath(interpreterPath, envFolderPath).path);
}

/**
 * Checks if two environments are same.
 * @param {string | PythonEnvInfo} left: environment to compare.
 * @param {string | PythonEnvInfo} right: environment to compare.
 * @param {boolean} allowPartialMatch: allow partial matches of properties when comparing.
 *
 * Remarks: The current comparison assumes that if the path to the executables are the same
 * then it is the same environment. Additionally, if the paths are not same but executables
 * are in the same directory and the version of python is the same than we can assume it
 * to be same environment. This later case is needed for comparing microsoft store python,
 * where multiple versions of python executables are all put in the same directory.
 */
export function areSameEnv(
    left: string | PythonEnvInfo | BasicEnvInfo,
    right: string | PythonEnvInfo | BasicEnvInfo,
    allowPartialMatch = true,
): boolean | undefined {
    const leftInfo = getMinimalPartialInfo(left);
    const rightInfo = getMinimalPartialInfo(right);
    if (leftInfo === undefined || rightInfo === undefined) {
        return undefined;
    }
    if (
        (leftInfo.executable?.filename && !rightInfo.executable?.filename) ||
        (!leftInfo.executable?.filename && rightInfo.executable?.filename)
    ) {
        return false;
    }
    if (leftInfo.id && leftInfo.id === rightInfo.id) {
        // In case IDs are available, use it.
        return true;
    }

    const leftFilename = leftInfo.executable!.filename;
    const rightFilename = rightInfo.executable!.filename;

    if (getEnvID(leftFilename, leftInfo.location) === getEnvID(rightFilename, rightInfo.location)) {
        // Otherwise use ID function to get the ID. Note ID returned by function may itself change if executable of
        // an environment changes, for eg. when conda installs python into the env. So only use it as a fallback if
        // ID is not available.
        return true;
    }

    if (allowPartialMatch) {
        const isSameDirectory =
            leftFilename !== 'python' &&
            rightFilename !== 'python' &&
            arePathsSame(path.dirname(leftFilename), path.dirname(rightFilename));
        if (isSameDirectory) {
            const leftVersion = typeof left === 'string' ? undefined : leftInfo.version;
            const rightVersion = typeof right === 'string' ? undefined : rightInfo.version;
            if (leftVersion && rightVersion) {
                if (areIdenticalVersion(leftVersion, rightVersion) || areSimilarVersions(leftVersion, rightVersion)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Returns a heuristic value on how much information is available in the given version object.
 * @param {PythonVersion} version version object to generate heuristic from.
 * @returns A heuristic value indicating the amount of info available in the object
 * weighted by most important to least important fields.
 * Wn > Wn-1 + Wn-2 + ... W0
 */
function getPythonVersionSpecificity(version: PythonVersion): number {
    let infoLevel = 0;
    if (version.major > 0) {
        infoLevel += 20; // W4
    }

    if (version.minor >= 0) {
        infoLevel += 10; // W3
    }

    if (version.micro >= 0) {
        infoLevel += 5; // W2
    }

    if (version.release?.level) {
        infoLevel += 3; // W1
    }

    if (version.release?.serial || version.sysVersion) {
        infoLevel += 1; // W0
    }

    return infoLevel;
}

/**
 * Compares two python versions, based on the amount of data each object has. If versionA has
 * less information then the returned value is negative. If it is same then 0. If versionA has
 * more information then positive.
 */
export function comparePythonVersionSpecificity(versionA: PythonVersion, versionB: PythonVersion): number {
    return Math.sign(getPythonVersionSpecificity(versionA) - getPythonVersionSpecificity(versionB));
}
