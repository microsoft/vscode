// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { getEnvironmentVariable } from '../../../common/utils/platform';
import { traceWarn } from '../../../logging';
import { pathExists } from '../externalDependencies';

/**
 * Gets path to the Windows Apps directory.
 * @returns {string} : Returns path to the Windows Apps directory under
 * `%LOCALAPPDATA%/Microsoft/WindowsApps`.
 */
export function getMicrosoftStoreAppsRoot(): string {
    const localAppData = getEnvironmentVariable('LOCALAPPDATA') || '';
    return path.join(localAppData, 'Microsoft', 'WindowsApps');
}
/**
 * Checks if a given path is under the forbidden microsoft store directory.
 * @param {string} absPath : Absolute path to a file or directory.
 * @returns {boolean} : Returns true if `interpreterPath` is under
 * `%ProgramFiles%/WindowsApps`.
 */
function isForbiddenStorePath(absPath: string): boolean {
    const programFilesStorePath = path
        .join(getEnvironmentVariable('ProgramFiles') || 'Program Files', 'WindowsApps')
        .normalize()
        .toUpperCase();
    return path.normalize(absPath).toUpperCase().includes(programFilesStorePath);
}
/**
 * Checks if a given directory is any one of the possible microsoft store directories, or
 * its sub-directory.
 * @param {string} dirPath : Absolute path to a directory.
 *
 * Remarks:
 * These locations are tested:
 * 1. %LOCALAPPDATA%/Microsoft/WindowsApps
 * 2. %ProgramFiles%/WindowsApps
 */

export function isMicrosoftStoreDir(dirPath: string): boolean {
    const storeRootPath = path.normalize(getMicrosoftStoreAppsRoot()).toUpperCase();
    return path.normalize(dirPath).toUpperCase().includes(storeRootPath) || isForbiddenStorePath(dirPath);
}
/**
 * Checks if store python is installed.
 * @param {string} interpreterPath : Absolute path to a interpreter.
 * Remarks:
 * If store python was never installed then the store apps directory will not
 * have idle.exe or pip.exe. We can use this as a way to identify the python.exe
 * found in the store apps directory is a real python or a store install shortcut.
 */
export async function isStorePythonInstalled(interpreterPath?: string): Promise<boolean> {
    let results = await Promise.all([
        pathExists(path.join(getMicrosoftStoreAppsRoot(), 'idle.exe')),
        pathExists(path.join(getMicrosoftStoreAppsRoot(), 'pip.exe')),
    ]);

    if (results.includes(true)) {
        return true;
    }

    if (interpreterPath) {
        results = await Promise.all([
            pathExists(path.join(path.dirname(interpreterPath), 'idle.exe')),
            pathExists(path.join(path.dirname(interpreterPath), 'pip.exe')),
        ]);
        return results.includes(true);
    }
    return false;
}
/**
 * Checks if the given interpreter belongs to Microsoft Store Python environment.
 * @param interpreterPath: Absolute path to any python interpreter.
 *
 * Remarks:
 * 1. Checking if the path includes `Microsoft\WindowsApps`, `Program Files\WindowsApps`, is
 * NOT enough. In WSL, `/mnt/c/users/user/AppData/Local/Microsoft/WindowsApps` is available as a search
 * path. It is possible to get a false positive for that path. So the comparison should check if the
 * absolute path to 'WindowsApps' directory is present in the given interpreter path. The WSL path to
 * 'WindowsApps' is not a valid path to access, Microsoft Store Python.
 *
 * 2. 'startsWith' comparison may not be right, user can provide '\\?\C:\users\' style long paths in windows.
 *
 * 3. A limitation of the checks here is that they don't handle 8.3 style windows paths.
 * For example,
 *     `C:\Users\USER\AppData\Local\MICROS~1\WINDOW~1\PYTHON~2.EXE`
 * is the shortened form of
 *     `C:\Users\USER\AppData\Local\Microsoft\WindowsApps\python3.7.exe`
 *
 * The correct way to compare these would be to always convert given paths to long path (or to short path).
 * For either approach to work correctly you need actual file to exist, and accessible from the user's
 * account.
 *
 * To convert to short path without using N-API in node would be to use this command. This is very expensive:
 * `> cmd /c for %A in ("C:\Users\USER\AppData\Local\Microsoft\WindowsApps\python3.7.exe") do @echo %~sA`
 * The above command will print out this:
 * `C:\Users\USER\AppData\Local\MICROS~1\WINDOW~1\PYTHON~2.EXE`
 *
 * If we go down the N-API route, use node-ffi and either call GetShortPathNameW or GetLongPathNameW from,
 * Kernel32 to convert between the two path variants.
 *
 */

export async function isMicrosoftStoreEnvironment(interpreterPath: string): Promise<boolean> {
    if (await isStorePythonInstalled(interpreterPath)) {
        const pythonPathToCompare = path.normalize(interpreterPath).toUpperCase();
        const localAppDataStorePath = path.normalize(getMicrosoftStoreAppsRoot()).toUpperCase();
        if (pythonPathToCompare.includes(localAppDataStorePath)) {
            return true;
        }

        // Program Files store path is a forbidden path. Only admins and system has access this path.
        // We should never have to look at this path or even execute python from this path.
        if (isForbiddenStorePath(pythonPathToCompare)) {
            traceWarn('isMicrosoftStoreEnvironment called with Program Files store path.');
            return true;
        }
    }
    return false;
}
