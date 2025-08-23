// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as minimatch from 'minimatch';
import * as path from 'path';
import * as fsapi from '../../../../common/platform/fs-paths';
import { PythonEnvKind } from '../../info';
import { IPythonEnvsIterator, BasicEnvInfo } from '../../locator';
import { FSWatchingLocator } from './fsWatchingLocator';
import { PythonEnvStructure } from '../../../common/pythonBinariesWatcher';
import {
    isStorePythonInstalled,
    getMicrosoftStoreAppsRoot,
} from '../../../common/environmentManagers/microsoftStoreEnv';
import { traceInfo } from '../../../../logging';
import { StopWatch } from '../../../../common/utils/stopWatch';

/**
 * This is a glob pattern which matches following file names:
 * python3.8.exe
 * python3.9.exe
 * python3.10.exe
 * This pattern does not match:
 * python.exe
 * python2.7.exe
 * python3.exe
 * python38.exe
 */
const pythonExeGlob = 'python3.{[0-9],[0-9][0-9]}.exe';

/**
 * Checks if a given path ends with python3.*.exe. Not all python executables are matched as
 * we do not want to return duplicate executables.
 * @param {string} interpreterPath : Path to python interpreter.
 * @returns {boolean} : Returns true if the path matches pattern for windows python executable.
 */
function isMicrosoftStorePythonExePattern(interpreterPath: string): boolean {
    return minimatch.default(path.basename(interpreterPath), pythonExeGlob, { nocase: true });
}

/**
 * Gets paths to the Python executable under Microsoft Store apps.
 * @returns: Returns python*.exe for the microsoft store app root directory.
 *
 * Remarks: We don't need to find the path to the interpreter under the specific application
 * directory. Such as:
 * `%LOCALAPPDATA%/Microsoft/WindowsApps/PythonSoftwareFoundation.Python.3.7_qbz5n2kfra8p0`
 * The same python executable is also available at:
 * `%LOCALAPPDATA%/Microsoft/WindowsApps`
 * It would be a duplicate.
 *
 * All python executable under `%LOCALAPPDATA%/Microsoft/WindowsApps` or the sub-directories
 * are 'reparse points' that point to the real executable at `%PROGRAMFILES%/WindowsApps`.
 * However, that directory is off limits to users. So no need to populate interpreters from
 * that location.
 */
export async function getMicrosoftStorePythonExes(): Promise<string[]> {
    if (await isStorePythonInstalled()) {
        const windowsAppsRoot = getMicrosoftStoreAppsRoot();

        // Collect python*.exe directly under %LOCALAPPDATA%/Microsoft/WindowsApps
        const files = await fsapi.readdir(windowsAppsRoot);
        return files
            .map((filename: string) => path.join(windowsAppsRoot, filename))
            .filter(isMicrosoftStorePythonExePattern);
    }
    return [];
}

export class MicrosoftStoreLocator extends FSWatchingLocator {
    public readonly providerId: string = 'microsoft-store';

    private readonly kind: PythonEnvKind = PythonEnvKind.MicrosoftStore;

    constructor() {
        // We have to watch the directory instead of the executable here because
        // FS events are not triggered for `*.exe` in the WindowsApps folder. The
        // .exe files here are reparse points and not real files. Watching the
        // PythonSoftwareFoundation directory will trigger both for new install
        // and update case. Update is handled by deleting and recreating the
        // PythonSoftwareFoundation directory.
        super(getMicrosoftStoreAppsRoot, async () => this.kind, {
            baseGlob: pythonExeGlob,
            searchLocation: getMicrosoftStoreAppsRoot(),
            envStructure: PythonEnvStructure.Flat,
        });
    }

    protected doIterEnvs(): IPythonEnvsIterator<BasicEnvInfo> {
        const iterator = async function* (kind: PythonEnvKind) {
            const stopWatch = new StopWatch();
            traceInfo('Searching for windows store envs');
            const exes = await getMicrosoftStorePythonExes();
            yield* exes.map(async (executablePath: string) => ({
                kind,
                executablePath,
            }));
            traceInfo(`Finished searching for windows store envs: ${stopWatch.elapsedTime} milliseconds`);
        };
        return iterator(this.kind);
    }
}
