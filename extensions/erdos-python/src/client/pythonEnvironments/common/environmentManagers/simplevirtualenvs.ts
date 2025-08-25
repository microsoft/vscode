// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as fsapi from '../../../common/platform/fs-paths';
import '../../../common/extensions';
import { splitLines } from '../../../common/stringUtils';
import { getEnvironmentVariable, getOSType, getUserHomeDir, OSType } from '../../../common/utils/platform';
import { PythonVersion, UNKNOWN_PYTHON_VERSION } from '../../base/info';
import { comparePythonVersionSpecificity } from '../../base/info/env';
import { parseBasicVersion, parseRelease, parseVersion } from '../../base/info/pythonVersion';
import { isParentPath, pathExists, readFile } from '../externalDependencies';

export function getPyvenvConfigPathsFrom(interpreterPath: string): string[] {
    const pyvenvConfigFile = 'pyvenv.cfg';

    // Check if the pyvenv.cfg file is in the parent directory relative to the interpreter.
    // env
    // |__ pyvenv.cfg  <--- check if this file exists
    // |__ bin or Scripts
    //     |__ python  <--- interpreterPath
    const venvPath1 = path.join(path.dirname(path.dirname(interpreterPath)), pyvenvConfigFile);

    // Check if the pyvenv.cfg file is in the directory as the interpreter.
    // env
    // |__ pyvenv.cfg  <--- check if this file exists
    // |__ python  <--- interpreterPath
    const venvPath2 = path.join(path.dirname(interpreterPath), pyvenvConfigFile);

    // The paths are ordered in the most common to least common
    return [venvPath1, venvPath2];
}

/**
 * Checks if the given interpreter is a virtual environment.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean} : Returns true if the interpreter belongs to a venv environment.
 */
export async function isVirtualEnvironment(interpreterPath: string): Promise<boolean> {
    return isVenvEnvironment(interpreterPath);
}

/**
 * Checks if the given interpreter belongs to a venv based environment.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean} : Returns true if the interpreter belongs to a venv environment.
 */
export async function isVenvEnvironment(interpreterPath: string): Promise<boolean> {
    const venvPaths = getPyvenvConfigPathsFrom(interpreterPath);

    // We don't need to test all at once, testing each one here
    for (const venvPath of venvPaths) {
        if (await pathExists(venvPath)) {
            return true;
        }
    }
    return false;
}

/**
 * Checks if the given interpreter belongs to a virtualenv based environment.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean} : Returns true if the interpreter belongs to a virtualenv environment.
 */
export async function isVirtualenvEnvironment(interpreterPath: string): Promise<boolean> {
    // Check if there are any activate.* files in the same directory as the interpreter.
    //
    // env
    // |__ activate, activate.*  <--- check if any of these files exist
    // |__ python  <--- interpreterPath
    const directory = path.dirname(interpreterPath);
    const files = await fsapi.readdir(directory);
    const regex = /^activate(\.([A-z]|\d)+)?$/i;

    return files.find((file) => regex.test(file)) !== undefined;
}

async function getDefaultVirtualenvwrapperDir(): Promise<string> {
    const homeDir = getUserHomeDir() || '';

    // In Windows, the default path for WORKON_HOME is %USERPROFILE%\Envs.
    // If 'Envs' is not available we should default to '.virtualenvs'. Since that
    // is also valid for windows.
    if (getOSType() === OSType.Windows) {
        // ~/Envs with uppercase 'E' is the default home dir for
        // virtualEnvWrapper.
        const envs = path.join(homeDir, 'Envs');
        if (await pathExists(envs)) {
            return envs;
        }
    }
    return path.join(homeDir, '.virtualenvs');
}

function getWorkOnHome(): Promise<string> {
    // The WORKON_HOME variable contains the path to the root directory of all virtualenvwrapper environments.
    // If the interpreter path belongs to one of them then it is a virtualenvwrapper type of environment.
    const workOnHome = getEnvironmentVariable('WORKON_HOME');
    if (workOnHome) {
        return Promise.resolve(workOnHome);
    }
    return getDefaultVirtualenvwrapperDir();
}

/**
 * Checks if the given interpreter belongs to a virtualenvWrapper based environment.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean}: Returns true if the interpreter belongs to a virtualenvWrapper environment.
 */
export async function isVirtualenvwrapperEnvironment(interpreterPath: string): Promise<boolean> {
    const workOnHomeDir = await getWorkOnHome();

    // For environment to be a virtualenvwrapper based it has to follow these two rules:
    // 1. It should be in a sub-directory under the WORKON_HOME
    // 2. It should be a valid virtualenv environment
    return (
        (await pathExists(workOnHomeDir)) &&
        isParentPath(interpreterPath, workOnHomeDir) &&
        isVirtualenvEnvironment(interpreterPath)
    );
}

/**
 * Extracts version information from pyvenv.cfg near a given interpreter.
 * @param interpreterPath Absolute path to the interpreter
 *
 * Remarks: This function looks for pyvenv.cfg usually in the same or parent directory.
 * Reads the pyvenv.cfg and finds the line that looks like 'version = 3.9.0`. Gets the
 * version string from that lines and parses it.
 */
export async function getPythonVersionFromPyvenvCfg(interpreterPath: string): Promise<PythonVersion> {
    const configPaths = getPyvenvConfigPathsFrom(interpreterPath);
    let version = UNKNOWN_PYTHON_VERSION;

    // We want to check each of those locations in the order. There is no need to look at
    // all of them in parallel.
    for (const configPath of configPaths) {
        if (await pathExists(configPath)) {
            try {
                const lines = splitLines(await readFile(configPath));

                const pythonVersions = lines
                    .map((line) => {
                        const parts = line.split('=');
                        if (parts.length === 2) {
                            const name = parts[0].toLowerCase().trim();
                            const value = parts[1].trim();
                            if (name === 'version') {
                                try {
                                    return parseVersion(value);
                                } catch (ex) {
                                    return undefined;
                                }
                            } else if (name === 'version_info') {
                                try {
                                    return parseVersionInfo(value);
                                } catch (ex) {
                                    return undefined;
                                }
                            }
                        }
                        return undefined;
                    })
                    .filter((v) => v !== undefined)
                    .map((v) => v!);

                if (pythonVersions.length > 0) {
                    for (const v of pythonVersions) {
                        if (comparePythonVersionSpecificity(v, version) > 0) {
                            version = v;
                        }
                    }
                }
            } catch (ex) {
                // There is only ome pyvenv.cfg. If we found it but failed to parse it
                // then just return here. No need to look for versions any further.
                return UNKNOWN_PYTHON_VERSION;
            }
        }
    }

    return version;
}

/**
 * Convert the given string into the corresponding Python version object.
 * Example:
 *   3.9.0.final.0
 *   3.9.0.alpha.1
 *   3.9.0.beta.2
 *   3.9.0.candidate.1
 *
 * Does not parse:
 *   3.9.0
 *   3.9.0a1
 *   3.9.0b2
 *   3.9.0rc1
 */
function parseVersionInfo(versionInfoStr: string): PythonVersion {
    let version: PythonVersion;
    let after: string;
    try {
        [version, after] = parseBasicVersion(versionInfoStr);
    } catch {
        // XXX Use getEmptyVersion().
        return UNKNOWN_PYTHON_VERSION;
    }
    if (version.micro !== -1 && after.startsWith('.')) {
        [version.release] = parseRelease(after);
    }
    return version;
}
