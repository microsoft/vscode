// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as path from 'path';
import { convertFileType, DirEntry, FileType, getFileFilter, getFileType } from '../../common/utils/filesystem';
import { getOSType, OSType } from '../../common/utils/platform';
import { traceError, traceVerbose } from '../../logging';
import { PythonVersion, UNKNOWN_PYTHON_VERSION } from '../base/info';
import { comparePythonVersionSpecificity } from '../base/info/env';
import { parseVersion } from '../base/info/pythonVersion';
import { getPythonVersionFromConda } from './environmentManagers/conda';
import { getPythonVersionFromPyvenvCfg } from './environmentManagers/simplevirtualenvs';
import { isFile, normCasePath } from './externalDependencies';
import * as posix from './posixUtils';
import * as windows from './windowsUtils';

const matchStandardPythonBinFilename =
    getOSType() === OSType.Windows ? windows.matchPythonBinFilename : posix.matchPythonBinFilename;
type FileFilterFunc = (filename: string) => boolean;

/**
 * Returns `true` if path provided is likely a python executable than a folder path.
 */
export async function isPythonExecutable(filePath: string): Promise<boolean> {
    const isMatch = matchStandardPythonBinFilename(filePath);
    if (isMatch && getOSType() === OSType.Windows) {
        // On Windows it's fair to assume a path ending with `.exe` denotes a file.
        return true;
    }
    if (await isFile(filePath)) {
        return true;
    }
    return false;
}

/**
 * Searches recursively under the given `root` directory for python interpreters.
 * @param root : Directory where the search begins.
 * @param recurseLevels : Number of levels to search for from the root directory.
 * @param filter : Callback that identifies directories to ignore.
 */
export async function* findInterpretersInDir(
    root: string,
    recurseLevel?: number,
    filterSubDir?: FileFilterFunc,
    ignoreErrors = true,
): AsyncIterableIterator<DirEntry> {
    // "checkBin" is a local variable rather than global
    // so we can stub out getOSType() during unit testing.
    const checkBin = getOSType() === OSType.Windows ? windows.matchPythonBinFilename : posix.matchPythonBinFilename;
    const cfg = {
        ignoreErrors,
        filterSubDir,
        filterFile: checkBin,
        // Make no-recursion the default for backward compatibility.
        maxDepth: recurseLevel || 0,
    };
    // We use an initial depth of 1.
    for await (const entry of walkSubTree(root, 1, cfg)) {
        const { filename, filetype } = entry;
        if (filetype === FileType.File || filetype === FileType.SymbolicLink) {
            if (matchFile(filename, checkBin, ignoreErrors)) {
                yield entry;
            }
        }
        // We ignore all other file types.
    }
}

/**
 * Find all Python executables in the given directory.
 */
export async function* iterPythonExecutablesInDir(
    dirname: string,
    opts: {
        ignoreErrors: boolean;
    } = { ignoreErrors: true },
): AsyncIterableIterator<DirEntry> {
    const readDirOpts = {
        ...opts,
        filterFile: matchStandardPythonBinFilename,
    };
    const entries = await readDirEntries(dirname, readDirOpts);
    for (const entry of entries) {
        const { filetype } = entry;
        if (filetype === FileType.File || filetype === FileType.SymbolicLink) {
            yield entry;
        }
        // We ignore all other file types.
    }
}

// This function helps simplify the recursion case.
async function* walkSubTree(
    subRoot: string,
    // "currentDepth" is the depth of the current level of recursion.
    currentDepth: number,
    cfg: {
        filterSubDir: FileFilterFunc | undefined;
        maxDepth: number;
        ignoreErrors: boolean;
    },
): AsyncIterableIterator<DirEntry> {
    const entries = await readDirEntries(subRoot, cfg);
    for (const entry of entries) {
        yield entry;

        const { filename, filetype } = entry;
        if (filetype === FileType.Directory) {
            if (cfg.maxDepth < 0 || currentDepth <= cfg.maxDepth) {
                if (matchFile(filename, cfg.filterSubDir, cfg.ignoreErrors)) {
                    yield* walkSubTree(filename, currentDepth + 1, cfg);
                }
            }
        }
    }
}

async function readDirEntries(
    dirname: string,
    opts: {
        filterFilename?: FileFilterFunc;
        ignoreErrors: boolean;
    } = { ignoreErrors: true },
): Promise<DirEntry[]> {
    const ignoreErrors = opts.ignoreErrors || false;
    if (opts.filterFilename && getOSType() === OSType.Windows) {
        // Since `readdir()` using "withFileTypes" is not efficient
        // on Windows, we take advantage of the filter.
        let basenames: string[];
        try {
            basenames = await fs.promises.readdir(dirname);
        } catch (err) {
            const exception = err as NodeJS.ErrnoException;
            // Treat a missing directory as empty.
            if (exception.code === 'ENOENT') {
                return [];
            }
            if (ignoreErrors) {
                traceError(`readdir() failed for "${dirname}" (${err})`);
                return [];
            }
            throw err; // re-throw
        }
        const filenames = basenames
            .map((b) => path.join(dirname, b))
            .filter((f) => matchFile(f, opts.filterFilename, ignoreErrors));
        return Promise.all(
            filenames.map(async (filename) => {
                const filetype = (await getFileType(filename, opts)) || FileType.Unknown;
                return { filename, filetype };
            }),
        );
    }

    let raw: fs.Dirent[];
    try {
        raw = await fs.promises.readdir(dirname, { withFileTypes: true });
    } catch (err) {
        const exception = err as NodeJS.ErrnoException;
        // Treat a missing directory as empty.
        if (exception.code === 'ENOENT') {
            return [];
        }
        if (ignoreErrors) {
            traceError(`readdir() failed for "${dirname}" (${err})`);
            return [];
        }
        throw err; // re-throw
    }
    // (FYI)
    // Normally we would have to do an extra (expensive) `fs.lstat()`
    // here for each file to determine its file type.  However, we
    // avoid this by using the "withFileTypes" option to `readdir()`
    // above.  On non-Windows the file type of each entry is preserved
    // for free.  Unfortunately, on Windows it actually does an
    // `lstat()` under the hood, so it isn't a win.  Regardless,
    // if we needed more information than just the file type
    // then we would be forced to incur the extra cost
    // of `lstat()` anyway.
    const entries = raw.map((entry) => {
        const filename = path.join(dirname, entry.name);
        const filetype = convertFileType(entry);
        return { filename, filetype };
    });
    if (opts.filterFilename) {
        return entries.filter((e) => matchFile(e.filename, opts.filterFilename, ignoreErrors));
    }
    return entries;
}

function matchFile(
    filename: string,
    filterFile: FileFilterFunc | undefined,
    // If "ignoreErrors" is true then we treat a failed filter
    // as though it returned `false`.
    ignoreErrors = true,
): boolean {
    if (filterFile === undefined) {
        return true;
    }
    try {
        return filterFile(filename);
    } catch (err) {
        if (ignoreErrors) {
            traceError(`filter failed for "${filename}" (${err})`);
            return false;
        }
        throw err; // re-throw
    }
}

/**
 * Looks for files in the same directory which might have version in their name.
 * @param interpreterPath
 */
async function getPythonVersionFromNearByFiles(interpreterPath: string): Promise<PythonVersion> {
    const root = path.dirname(interpreterPath);
    let version = UNKNOWN_PYTHON_VERSION;
    for await (const entry of findInterpretersInDir(root)) {
        const { filename } = entry;
        try {
            const curVersion = parseVersion(path.basename(filename));
            if (comparePythonVersionSpecificity(curVersion, version) > 0) {
                version = curVersion;
            }
        } catch (ex) {
            // Ignore any parse errors
        }
    }
    return version;
}

/**
 * This function does the best effort of finding version of python without running the
 * python binary.
 * @param interpreterPath Absolute path to the interpreter.
 * @param hint Any string that might contain version info.
 */
export async function getPythonVersionFromPath(interpreterPath: string, hint?: string): Promise<PythonVersion> {
    let versionA;
    try {
        versionA = hint ? parseVersion(hint) : UNKNOWN_PYTHON_VERSION;
    } catch (ex) {
        versionA = UNKNOWN_PYTHON_VERSION;
    }
    const versionB = interpreterPath ? await getPythonVersionFromNearByFiles(interpreterPath) : UNKNOWN_PYTHON_VERSION;
    traceVerbose('Best effort version B for', interpreterPath, JSON.stringify(versionB));
    const versionC = interpreterPath ? await getPythonVersionFromPyvenvCfg(interpreterPath) : UNKNOWN_PYTHON_VERSION;
    traceVerbose('Best effort version C for', interpreterPath, JSON.stringify(versionC));
    const versionD = interpreterPath ? await getPythonVersionFromConda(interpreterPath) : UNKNOWN_PYTHON_VERSION;
    traceVerbose('Best effort version D for', interpreterPath, JSON.stringify(versionD));

    let version = UNKNOWN_PYTHON_VERSION;
    for (const v of [versionA, versionB, versionC, versionD]) {
        version = comparePythonVersionSpecificity(version, v) > 0 ? version : v;
    }
    return version;
}

/**
 * Decide if the file is meets the given criteria for a Python executable.
 */
async function checkPythonExecutable(
    executable: string | DirEntry,
    opts: {
        matchFilename?: (f: string) => boolean;
        filterFile?: (f: string | DirEntry) => Promise<boolean>;
    },
): Promise<boolean> {
    const matchFilename = opts.matchFilename || matchStandardPythonBinFilename;
    const filename = typeof executable === 'string' ? executable : executable.filename;

    if (!matchFilename(filename)) {
        return false;
    }

    // This should occur after we match file names. This is to avoid doing potential
    // `lstat` calls on too many files which can slow things down.
    if (opts.filterFile && !(await opts.filterFile(executable))) {
        return false;
    }

    // For some use cases it would also be a good idea to verify that
    // the file is executable.  That is a relatively expensive operation
    // (a stat on linux and actually executing the file on Windows), so
    // at best it should be an optional check.  If we went down this
    // route then it would be worth supporting `fs.Stats` as a type
    // for the "executable" arg.
    //
    // Regardless, currently there is no code that would use such
    // an option, so for now we don't bother supporting it.

    return true;
}

const filterGlobalExecutable = getFileFilter({ ignoreFileType: FileType.SymbolicLink })!;

/**
 * Decide if the file is a typical Python executable.
 *
 * This is a best effort operation with a focus on the common cases
 * and on efficiency.  The filename must be basic (python/python.exe).
 * For global envs, symlinks are ignored.
 */
export async function looksLikeBasicGlobalPython(executable: string | DirEntry): Promise<boolean> {
    // "matchBasic" is a local variable rather than global
    // so we can stub out getOSType() during unit testing.
    const matchBasic =
        getOSType() === OSType.Windows ? windows.matchBasicPythonBinFilename : posix.matchBasicPythonBinFilename;

    // We could be more permissive here by using matchPythonBinFilename().
    // Originally one key motivation for the "basic" check was to avoid
    // symlinks (which often look like python3.exe, etc., particularly
    // on Windows).  However, the symbolic link check here eliminates
    // that rationale to an extent.
    // (See: https://github.com/microsoft/vscode-python/issues/15447)
    const matchFilename = matchBasic;
    const filterFile = filterGlobalExecutable;
    return checkPythonExecutable(executable, { matchFilename, filterFile });
}

/**
 * Decide if the file is a typical Python executable.
 *
 * This is a best effort operation with a focus on the common cases
 * and on efficiency.  The filename must be basic (python/python.exe).
 * For global envs, symlinks are ignored.
 */
export async function looksLikeBasicVirtualPython(executable: string | DirEntry): Promise<boolean> {
    // "matchBasic" is a local variable rather than global
    // so we can stub out getOSType() during unit testing.
    const matchBasic =
        getOSType() === OSType.Windows ? windows.matchBasicPythonBinFilename : posix.matchBasicPythonBinFilename;

    // With virtual environments, we match only the simplest name
    // (e.g. `python`) and we do not ignore symlinks.
    const matchFilename = matchBasic;
    const filterFile = undefined;
    return checkPythonExecutable(executable, { matchFilename, filterFile });
}

/**
 * This function looks specifically for 'python' or 'python.exe' binary in the sub folders of a given
 * environment directory.
 * @param envDir Absolute path to the environment directory
 */
export async function getInterpreterPathFromDir(
    envDir: string,
    opts: {
        global?: boolean;
        ignoreErrors?: boolean;
    } = {},
): Promise<string | undefined> {
    const recurseLevel = 2;

    // Ignore any folders or files that not directly python binary related.
    function filterDir(dirname: string): boolean {
        const lower = path.basename(dirname).toLowerCase();
        return ['bin', 'scripts'].includes(lower);
    }

    // Search in the sub-directories for python binary
    const matchExecutable = opts.global ? looksLikeBasicGlobalPython : looksLikeBasicVirtualPython;
    const executables = findInterpretersInDir(envDir, recurseLevel, filterDir, opts.ignoreErrors);
    for await (const entry of executables) {
        if (await matchExecutable(entry)) {
            return entry.filename;
        }
    }
    return undefined;
}

/**
 * Gets the root environment directory based on the absolute path to the python
 *  interpreter binary.
 * @param interpreterPath Absolute path to the python interpreter
 */
export function getEnvironmentDirFromPath(interpreterPath: string): string {
    const skipDirs = ['bin', 'scripts'];

    // env <--- Return this directory if it is not 'bin' or 'scripts'
    // |__ python  <--- interpreterPath
    const dir = path.basename(path.dirname(interpreterPath));
    if (!skipDirs.map((e) => normCasePath(e)).includes(normCasePath(dir))) {
        return path.dirname(interpreterPath);
    }

    // This is the best next guess.
    // env <--- Return this directory if it is not 'bin' or 'scripts'
    // |__ bin or Scripts
    //     |__ python  <--- interpreterPath
    return path.dirname(path.dirname(interpreterPath));
}
