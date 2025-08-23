// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as path from 'path';
import { uniq } from 'lodash';
import * as fsapi from '../../common/platform/fs-paths';
import { getSearchPathEntries } from '../../common/utils/exec';
import { resolveSymbolicLink } from './externalDependencies';
import { traceError, traceInfo, traceVerbose, traceWarn } from '../../logging';

/**
 * Determine if the given filename looks like the simplest Python executable.
 */
export function matchBasicPythonBinFilename(filename: string): boolean {
    return path.basename(filename) === 'python';
}

/**
 * Checks if a given path matches pattern for standard non-windows python binary.
 * @param {string} interpreterPath : Path to python interpreter.
 * @returns {boolean} : Returns true if the path matches pattern for non-windows python binary.
 */
export function matchPythonBinFilename(filename: string): boolean {
    /**
     * This Reg-ex matches following file names:
     * python
     * python3
     * python38
     * python3.8
     */
    const posixPythonBinPattern = /^python(\d+(\.\d+)?)?$/;

    return posixPythonBinPattern.test(path.basename(filename));
}

export async function commonPosixBinPaths(): Promise<string[]> {
    const searchPaths = getSearchPathEntries();

    const paths: string[] = Array.from(
        new Set(
            [
                '/bin',
                '/etc',
                '/lib',
                '/lib/x86_64-linux-gnu',
                '/lib64',
                '/sbin',
                '/snap/bin',
                '/usr/bin',
                '/usr/games',
                '/usr/include',
                '/usr/lib',
                '/usr/lib/x86_64-linux-gnu',
                '/usr/lib64',
                '/usr/libexec',
                '/usr/local',
                '/usr/local/bin',
                '/usr/local/etc',
                '/usr/local/games',
                '/usr/local/lib',
                '/usr/local/sbin',
                '/usr/sbin',
                '/usr/share',
                '~/.local/bin',
            ].concat(searchPaths),
        ),
    );

    const exists = await Promise.all(paths.map((p) => fsapi.pathExists(p)));
    return paths.filter((_, index) => exists[index]);
}

/**
 * Finds python interpreter binaries or symlinks in a given directory.
 * @param searchDir : Directory to search in
 * @returns : Paths to python binaries found in the search directory.
 */
async function findPythonBinariesInDir(searchDir: string) {
    return (await fs.promises.readdir(searchDir, { withFileTypes: true }))
        .filter((dirent: fs.Dirent) => !dirent.isDirectory())
        .map((dirent: fs.Dirent) => path.join(searchDir, dirent.name))
        .filter(matchPythonBinFilename);
}

/**
 * Pick the shortest versions of the paths. The paths could be
 * the binary itself or its symlink, whichever path is shorter.
 *
 * E.g:
 * /usr/bin/python -> /System/Library/Frameworks/Python.framework/Versions/3.7/lib/python3.7
 * /usr/bin/python3 -> /System/Library/Frameworks/Python.framework/Versions/3.7/lib/python3.7
 * /usr/bin/python3.7 -> /System/Library/Frameworks/Python.framework/Versions/3.7/lib/python3.7
 *
 * Of the 4 possible paths to same binary (3 symlinks and 1 binary path),
 * the code below will pick '/usr/bin/python'.
 */
function pickShortestPath(pythonPaths: string[]) {
    let shortestLen = pythonPaths[0].length;
    let shortestPath = pythonPaths[0];
    for (const p of pythonPaths) {
        if (p.length <= shortestLen) {
            shortestLen = p.length;
            shortestPath = p;
        }
    }
    return shortestPath;
}

/**
 * Finds python binaries in given directories. This function additionally reduces the
 * found binaries to unique set be resolving symlinks, and returns the shortest paths
 * to the said unique binaries.
 * @param searchDirs : Directories to search for python binaries
 * @returns : Unique paths to python interpreters found in the search dirs.
 */
export async function getPythonBinFromPosixPaths(searchDirs: string[]): Promise<string[]> {
    const binToLinkMap = new Map<string, string[]>();
    for (const searchDir of searchDirs) {
        const paths = await findPythonBinariesInDir(searchDir).catch((ex) => {
            traceWarn('Looking for python binaries within', searchDir, 'failed with', ex);
            return [];
        });

        for (const filepath of paths) {
            // Ensure that we have a collection of unique global binaries by
            // resolving all symlinks to the target binaries.
            try {
                traceVerbose(`Attempting to resolve symbolic link: ${filepath}`);
                const resolvedBin = await resolveSymbolicLink(filepath);
                if (binToLinkMap.has(resolvedBin)) {
                    binToLinkMap.get(resolvedBin)?.push(filepath);
                } else {
                    binToLinkMap.set(resolvedBin, [filepath]);
                }
                traceInfo(`Found: ${filepath} --> ${resolvedBin}`);
            } catch (ex) {
                traceError('Failed to resolve symbolic link: ', ex);
            }
        }
    }

    // Pick the shortest versions of the paths. The paths could be
    // the binary itself or its symlink, whichever path is shorter.
    //
    // E.g:
    // /usr/bin/python -> /System/Library/Frameworks/Python.framework/Versions/3.7/lib/python3.7
    // /usr/bin/python3 -> /System/Library/Frameworks/Python.framework/Versions/3.7/lib/python3.7
    // /usr/bin/python3.7 -> /System/Library/Frameworks/Python.framework/Versions/3.7/lib/python3.7
    //
    // Of the 4 possible paths to same binary (3 symlinks and 1 binary path),
    // the code below will pick '/usr/bin/python'.
    const keys = Array.from(binToLinkMap.keys());
    const pythonPaths = keys.map((key) => pickShortestPath([key, ...(binToLinkMap.get(key) ?? [])]));
    return uniq(pythonPaths);
}
