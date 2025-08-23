// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as path from 'path';
import { getOSType, getUserHomeDir, OSType } from '../../../common/utils/platform';
import {
    getPythonSetting,
    isParentPath,
    pathExists,
    pathExistsSync,
    readFile,
    shellExecute,
} from '../externalDependencies';
import { getEnvironmentDirFromPath } from '../commonUtils';
import { isVirtualenvEnvironment } from './simplevirtualenvs';
import { StopWatch } from '../../../common/utils/stopWatch';
import { cache } from '../../../common/utils/decorators';
import { isTestExecution } from '../../../common/constants';
import { traceError, traceVerbose } from '../../../logging';
import { splitLines } from '../../../common/stringUtils';

/**
 * Global virtual env dir for a project is named as:
 *
 * <sanitized_project_name>-<project_cwd_hash>-py<major>.<micro>
 *
 * Implementation details behind <sanitized_project_name> and <project_cwd_hash> are too
 * much to rely upon, so for our purposes the best we can do is the following regex.
 */
const globalPoetryEnvDirRegex = /^(.+)-(.+)-py(\d).(\d){1,2}$/;

/**
 * Checks if the given interpreter belongs to a global poetry environment.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean} : Returns true if the interpreter belongs to a venv environment.
 */
async function isGlobalPoetryEnvironment(interpreterPath: string): Promise<boolean> {
    const envDir = getEnvironmentDirFromPath(interpreterPath);
    return globalPoetryEnvDirRegex.test(path.basename(envDir)) ? isVirtualenvEnvironment(interpreterPath) : false;
}
/**
 * Local poetry environments are created by the `virtualenvs.in-project` setting , which always names the environment
 * folder '.venv': https://python-poetry.org/docs/configuration/#virtualenvsin-project-boolean
 */
export const localPoetryEnvDirName = '.venv';

/**
 * Checks if the given interpreter belongs to a local poetry environment, i.e environment is located inside the project.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean} : Returns true if the interpreter belongs to a venv environment.
 */
async function isLocalPoetryEnvironment(interpreterPath: string): Promise<boolean> {
    // This is the layout we wish to verify.
    // project
    // |__ pyproject.toml  <--- check if this exists
    // |__ .venv    <--- check if name of the folder is '.venv'
    //     |__ Scripts/bin
    //         |__ python  <--- interpreterPath
    const envDir = getEnvironmentDirFromPath(interpreterPath);
    if (path.basename(envDir) !== localPoetryEnvDirName) {
        return false;
    }
    const project = path.dirname(envDir);
    if (!(await hasValidPyprojectToml(project))) {
        return false;
    }
    // The assumption is that we need to be able to run poetry CLI for an environment in order to mark it as poetry.
    // For that we can either further verify,
    // - 'pyproject.toml' is valid toml
    // - 'pyproject.toml' has a poetry section which contains the necessary fields
    // - Poetry configuration allows local virtual environments
    // ... possibly more
    // Or we can try running poetry to find the related environment instead. Launching poetry binaries although
    // reliable, can be expensive. So report the best effort type instead, i.e this is likely a poetry env.
    return true;
}

/**
 * Checks if the given interpreter belongs to a poetry environment.
 * @param {string} interpreterPath: Absolute path to the python interpreter.
 * @returns {boolean} : Returns true if the interpreter belongs to a venv environment.
 */
export async function isPoetryEnvironment(interpreterPath: string): Promise<boolean> {
    if (await isGlobalPoetryEnvironment(interpreterPath)) {
        return true;
    }
    if (await isLocalPoetryEnvironment(interpreterPath)) {
        return true;
    }
    return false;
}

const POETRY_TIMEOUT = 50000;

/** Wraps the "poetry" utility, and exposes its functionality.
 */
export class Poetry {
    /**
     * Locating poetry binary can be expensive, since it potentially involves spawning or
     * trying to spawn processes; so we only do it once per session.
     */
    private static poetryPromise: Map<string, Promise<Poetry | undefined>> = new Map<
        string,
        Promise<Poetry | undefined>
    >();

    /**
     * Creates a Poetry service corresponding to the corresponding "poetry" command.
     *
     * @param command - Command used to run poetry. This has the same meaning as the
     * first argument of spawn() - i.e. it can be a full path, or just a binary name.
     * @param cwd - The working directory to use as cwd when running poetry.
     */
    constructor(public readonly command: string, private cwd: string) {
        this.fixCwd();
    }

    /**
     * Returns a Poetry instance corresponding to the binary which can be used to run commands for the cwd.
     *
     * Poetry commands can be slow and so can be bottleneck to overall discovery time. So trigger command
     * execution as soon as possible. To do that we need to ensure the operations before the command are
     * performed synchronously.
     */
    public static async getPoetry(cwd: string): Promise<Poetry | undefined> {
        // Following check should be performed synchronously so we trigger poetry execution as soon as possible.
        if (!(await hasValidPyprojectToml(cwd))) {
            // This check is not expensive and may change during a session, so we need not cache it.
            return undefined;
        }
        if (Poetry.poetryPromise.get(cwd) === undefined || isTestExecution()) {
            Poetry.poetryPromise.set(cwd, Poetry.locate(cwd));
        }
        return Poetry.poetryPromise.get(cwd);
    }

    private static async locate(cwd: string): Promise<Poetry | undefined> {
        // First thing this method awaits on should be poetry command execution, hence perform all operations
        // before that synchronously.

        traceVerbose(`Getting poetry for cwd ${cwd}`);
        // Produce a list of candidate binaries to be probed by exec'ing them.
        function* getCandidates() {
            try {
                const customPoetryPath = getPythonSetting<string>('poetryPath');
                if (customPoetryPath && customPoetryPath !== 'poetry') {
                    // If user has specified a custom poetry path, use it first.
                    yield customPoetryPath;
                }
            } catch (ex) {
                traceError(`Failed to get poetry setting`, ex);
            }
            // Check unqualified filename, in case it's on PATH.
            yield 'poetry';
            const home = getUserHomeDir();
            if (home) {
                const defaultPoetryPath = path.join(home, '.poetry', 'bin', 'poetry');
                if (pathExistsSync(defaultPoetryPath)) {
                    yield defaultPoetryPath;
                }
            }
        }

        // Probe the candidates, and pick the first one that exists and does what we need.
        for (const poetryPath of getCandidates()) {
            traceVerbose(`Probing poetry binary for ${cwd}: ${poetryPath}`);
            const poetry = new Poetry(poetryPath, cwd);
            const virtualenvs = await poetry.getEnvList();
            if (virtualenvs !== undefined) {
                traceVerbose(`Found poetry via filesystem probing for ${cwd}: ${poetryPath}`);
                return poetry;
            }
            traceVerbose(`Failed to find poetry for ${cwd}: ${poetryPath}`);
        }

        // Didn't find anything.
        traceVerbose(`No poetry binary found for ${cwd}`);
        return undefined;
    }

    /**
     * Retrieves list of Python environments known to this poetry for this working directory.
     * Returns `undefined` if we failed to spawn because the binary doesn't exist or isn't on PATH,
     * or the current user doesn't have execute permissions for it, or this poetry couldn't handle
     * command line arguments that we passed (indicating an old version that we do not support, or
     * poetry has not been setup properly for the cwd).
     *
     * Corresponds to "poetry env list --full-path". Swallows errors if any.
     */
    public async getEnvList(): Promise<string[] | undefined> {
        return this.getEnvListCached(this.cwd);
    }

    /**
     * Method created to facilitate caching. The caching decorator uses function arguments as cache key,
     * so pass in cwd on which we need to cache.
     */
    @cache(30_000, true, 10_000)
    private async getEnvListCached(_cwd: string): Promise<string[] | undefined> {
        const result = await this.safeShellExecute(`${this.command} env list --full-path`);
        if (!result) {
            return undefined;
        }
        /**
         * We expect stdout to contain something like:
         *
         * <full-path>\poetry_2-tutorial-project-6hnqYwvD-py3.7
         * <full-path>\poetry_2-tutorial-project-6hnqYwvD-py3.8
         * <full-path>\poetry_2-tutorial-project-6hnqYwvD-py3.9 (Activated)
         *
         * So we'll need to remove the string "(Activated)" after splitting lines to get the full path.
         */
        const activated = '(Activated)';
        const res = await Promise.all(
            splitLines(result.stdout).map(async (line) => {
                if (line.endsWith(activated)) {
                    line = line.slice(0, -activated.length);
                }
                const folder = line.trim();
                return (await pathExists(folder)) ? folder : undefined;
            }),
        );
        return res.filter((r) => r !== undefined).map((r) => r!);
    }

    /**
     * Retrieves interpreter path of the currently activated virtual environment for this working directory.
     * Corresponds to "poetry env info -p". Swallows errors if any.
     */
    public async getActiveEnvPath(): Promise<string | undefined> {
        return this.getActiveEnvPathCached(this.cwd);
    }

    /**
     * Method created to facilitate caching. The caching decorator uses function arguments as cache key,
     * so pass in cwd on which we need to cache.
     */
    @cache(20_000, true, 10_000)
    private async getActiveEnvPathCached(_cwd: string): Promise<string | undefined> {
        const result = await this.safeShellExecute(`${this.command} env info -p`, true);
        if (!result) {
            return undefined;
        }
        return result.stdout.trim();
    }

    /**
     * Retrieves `virtualenvs.path` setting for this working directory. `virtualenvs.path` setting defines where virtual
     * environments are created for the directory. Corresponds to "poetry config virtualenvs.path". Swallows errors if any.
     */
    public async getVirtualenvsPathSetting(): Promise<string | undefined> {
        const result = await this.safeShellExecute(`${this.command} config virtualenvs.path`);
        if (!result) {
            return undefined;
        }
        return result.stdout.trim();
    }

    /**
     * Due to an upstream poetry issue on Windows https://github.com/python-poetry/poetry/issues/3829,
     * 'poetry env list' does not handle case-insensitive paths as cwd, which are valid on Windows.
     * So we need to pass the case-exact path as cwd.
     * It has been observed that only the drive letter in `cwd` is lowercased here. Unfortunately,
     * there's no good way to get case of the drive letter correctly without using Win32 APIs:
     * https://stackoverflow.com/questions/33086985/how-to-obtain-case-exact-path-of-a-file-in-node-js-on-windows
     * So we do it manually.
     */
    private fixCwd(): void {
        if (getOSType() === OSType.Windows) {
            if (/^[a-z]:/.test(this.cwd)) {
                // Replace first character by the upper case version of the character.
                const a = this.cwd.split(':');
                a[0] = a[0].toUpperCase();
                this.cwd = a.join(':');
            }
        }
    }

    private async safeShellExecute(command: string, logVerbose = false) {
        // It has been observed that commands related to conda or poetry binary take upto 10-15 seconds unlike
        // python binaries. So have a large timeout.
        const stopWatch = new StopWatch();
        const result = await shellExecute(command, {
            cwd: this.cwd,
            throwOnStdErr: true,
            timeout: POETRY_TIMEOUT,
        }).catch((ex) => {
            if (logVerbose) {
                traceVerbose(ex);
            } else {
                traceError(ex);
            }
            return undefined;
        });
        traceVerbose(`Time taken to run ${command} in ms`, stopWatch.elapsedTime);
        return result;
    }
}

/**
 * Returns true if interpreter path belongs to a poetry environment which is associated with a particular folder,
 * false otherwise.
 * @param interpreterPath Absolute path to any python interpreter.
 * @param folder Absolute path to the folder.
 * @param poetryPath Poetry command to use to calculate the result.
 */
export async function isPoetryEnvironmentRelatedToFolder(
    interpreterPath: string,
    folder: string,
    poetryPath?: string,
): Promise<boolean> {
    const poetry = poetryPath ? new Poetry(poetryPath, folder) : await Poetry.getPoetry(folder);
    const pathToEnv = await poetry?.getActiveEnvPath();
    if (!pathToEnv) {
        return false;
    }
    return isParentPath(interpreterPath, pathToEnv);
}

/**
 * Does best effort to verify whether a folder has been setup for poetry, by looking for "valid" pyproject.toml file.
 * Note "valid" is best effort here, i.e we only verify the minimal features.
 *
 * @param folder Folder to look for pyproject.toml file in.
 */
async function hasValidPyprojectToml(folder: string): Promise<boolean> {
    const pyprojectToml = path.join(folder, 'pyproject.toml');
    if (!pathExistsSync(pyprojectToml)) {
        return false;
    }
    const content = await readFile(pyprojectToml);
    if (!content.includes('[tool.poetry]')) {
        return false;
    }
    // It may still be the case that.
    // - pyproject.toml is not a valid toml file
    // - Some fields are not setup properly for poetry or are missing
    // ... possibly more
    // But we only wish to verify the minimal features.
    return true;
}
