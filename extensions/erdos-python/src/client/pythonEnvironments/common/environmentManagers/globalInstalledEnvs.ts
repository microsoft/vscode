// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { getSearchPathEntries } from '../../../common/utils/exec';
import { getOSType, OSType } from '../../../common/utils/platform';
import { isParentPath } from '../externalDependencies';
import { commonPosixBinPaths } from '../posixUtils';
import { isPyenvShimDir } from './pyenv';
import { ADDITIONAL_POSIX_BIN_PATHS } from '../posixUtils';

/**
 * Checks if the given interpreter belongs to known globally installed types. If an global
 * executable is discoverable, we consider it as global type.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean} : Returns true if the interpreter belongs to a venv environment.
 */
export async function isGloballyInstalledEnv(executablePath: string): Promise<boolean> {
    // Identifying this type is not important, as the extension treats `Global` and `Unknown`
    // types the same way. This is only required for telemetry. As windows registry is known
    // to be slow, we do not want to unnecessarily block on that by default, hence skip this
    // step.
    // if (getOSType() === OSType.Windows) {
    //     if (await isFoundInWindowsRegistry(executablePath)) {
    //         return true;
    //     }
    // }
    return (await isFoundInPathEnvVar(executablePath)) || isAdditionalGlobalBinPath(executablePath);
}

async function isFoundInPathEnvVar(executablePath: string): Promise<boolean> {
    let searchPathEntries: string[] = [];
    if (getOSType() === OSType.Windows) {
        searchPathEntries = getSearchPathEntries();
    } else {
        searchPathEntries = await commonPosixBinPaths();
    }
    // Filter out pyenv shims. They are not actual python binaries, they are used to launch
    // the binaries specified in .python-version file in the cwd. We should not be reporting
    // those binaries as environments.
    searchPathEntries = searchPathEntries.filter((dirname) => !isPyenvShimDir(dirname));
    for (const searchPath of searchPathEntries) {
        if (isParentPath(executablePath, searchPath)) {
            return true;
        }
    }
    return false;
}

export function isAdditionalGlobalBinPath(executablePath: string): boolean {
    if (getOSType() === OSType.Windows) {
        return false;
    }
    const searchPathEntries = ADDITIONAL_POSIX_BIN_PATHS;
    for (const searchPath of searchPathEntries) {
        if (isParentPath(executablePath, searchPath)) {
            return true;
        }
    }
    return false;
}
