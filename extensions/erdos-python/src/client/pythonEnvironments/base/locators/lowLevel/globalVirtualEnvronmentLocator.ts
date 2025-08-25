// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { toLower, uniq, uniqBy } from 'lodash';
import * as path from 'path';
import { Uri } from 'vscode';
import { chain, iterable } from '../../../../common/utils/async';
import { getEnvironmentVariable, getOSType, getUserHomeDir, OSType } from '../../../../common/utils/platform';
import { PythonEnvKind } from '../../info';
import { BasicEnvInfo, IPythonEnvsIterator } from '../../locator';
import { FSWatchingLocator } from './fsWatchingLocator';
import { findInterpretersInDir, looksLikeBasicVirtualPython } from '../../../common/commonUtils';
import { pathExists } from '../../../common/externalDependencies';
import { getProjectDir, isPipenvEnvironment } from '../../../common/environmentManagers/pipenv';
import {
    isVenvEnvironment,
    isVirtualenvEnvironment,
    isVirtualenvwrapperEnvironment,
} from '../../../common/environmentManagers/simplevirtualenvs';
import { isUvEnvironment } from '../../../common/environmentManagers/uv';
import '../../../../common/extensions';
import { asyncFilter } from '../../../../common/utils/arrayUtils';
import { traceError, traceInfo, traceVerbose } from '../../../../logging';
import { StopWatch } from '../../../../common/utils/stopWatch';
import { untildify } from '../../../../common/helpers';

const DEFAULT_SEARCH_DEPTH = 2;
/**
 * Gets all default virtual environment locations. This uses WORKON_HOME,
 * and user home directory to find some known locations where global virtual
 * environments are often created.
 */
async function getGlobalVirtualEnvDirs(): Promise<string[]> {
    const venvDirs: string[] = [];

    let workOnHome = getEnvironmentVariable('WORKON_HOME');
    if (workOnHome) {
        workOnHome = untildify(workOnHome);
        if (await pathExists(workOnHome)) {
            venvDirs.push(workOnHome);
        }
    }

    const homeDir = getUserHomeDir();
    if (homeDir && (await pathExists(homeDir))) {
        const subDirs = [
            'envs',
            'Envs',
            '.direnv',
            '.venvs',
            '.virtualenvs',
            path.join('.local', 'share', 'virtualenvs'),
        ];
        const filtered = await asyncFilter(
            subDirs.map((d) => path.join(homeDir, d)),
            pathExists,
        );
        filtered.forEach((d) => venvDirs.push(d));
    }

    return [OSType.Windows, OSType.OSX].includes(getOSType()) ? uniqBy(venvDirs, toLower) : uniq(venvDirs);
}

async function getSearchLocation(env: BasicEnvInfo): Promise<Uri | undefined> {
    if (env.kind === PythonEnvKind.Pipenv) {
        // Pipenv environments are created only for a specific project, so they must only
        // appear if that particular project is being queried.
        const project = await getProjectDir(path.dirname(path.dirname(env.executablePath)));
        if (project) {
            return Uri.file(project);
        }
    }
    return undefined;
}

/**
 * Gets the virtual environment kind for a given interpreter path.
 * This only checks for environments created using venv, virtualenv,
 * and virtualenvwrapper based environments.
 * @param interpreterPath: Absolute path to the interpreter paths.
 */
async function getVirtualEnvKind(interpreterPath: string): Promise<PythonEnvKind> {
    if (await isUvEnvironment(interpreterPath)) {
        return PythonEnvKind.Uv;
    }

    if (await isPipenvEnvironment(interpreterPath)) {
        return PythonEnvKind.Pipenv;
    }

    if (await isVirtualenvwrapperEnvironment(interpreterPath)) {
        return PythonEnvKind.VirtualEnvWrapper;
    }

    if (await isVenvEnvironment(interpreterPath)) {
        return PythonEnvKind.Venv;
    }

    if (await isVirtualenvEnvironment(interpreterPath)) {
        return PythonEnvKind.VirtualEnv;
    }

    return PythonEnvKind.Unknown;
}

/**
 * Finds and resolves virtual environments created in known global locations.
 */
export class GlobalVirtualEnvironmentLocator extends FSWatchingLocator {
    public readonly providerId: string = 'global-virtual-env';

    constructor(private readonly searchDepth?: number) {
        super(getGlobalVirtualEnvDirs, getVirtualEnvKind, {
            // Note detecting kind of virtual env depends on the file structure around the
            // executable, so we need to wait before attempting to detect it. However even
            // if the type detected is incorrect, it doesn't do any practical harm as kinds
            // in this locator are used in the same way (same activation commands etc.)
            delayOnCreated: 1000,
        });
    }

    protected doIterEnvs(): IPythonEnvsIterator<BasicEnvInfo> {
        // Number of levels of sub-directories to recurse when looking for
        // interpreters
        const searchDepth = this.searchDepth ?? DEFAULT_SEARCH_DEPTH;

        async function* iterator() {
            const stopWatch = new StopWatch();
            traceInfo('Searching for global virtual environments');
            const envRootDirs = await getGlobalVirtualEnvDirs();
            const envGenerators = envRootDirs.map((envRootDir) => {
                async function* generator() {
                    traceVerbose(`Searching for global virtual envs in: ${envRootDir}`);

                    const executables = findInterpretersInDir(envRootDir, searchDepth);

                    for await (const entry of executables) {
                        const { filename } = entry;
                        // We only care about python.exe (on windows) and python (on linux/mac)
                        // Other version like python3.exe or python3.8 are often symlinks to
                        // python.exe or python in the same directory in the case of virtual
                        // environments.
                        if (await looksLikeBasicVirtualPython(entry)) {
                            // We should extract the kind here to avoid doing is*Environment()
                            // check multiple times. Those checks are file system heavy and
                            // we can use the kind to determine this anyway.
                            const kind = await getVirtualEnvKind(filename);
                            const searchLocation = await getSearchLocation({ kind, executablePath: filename });
                            try {
                                yield { kind, executablePath: filename, searchLocation };
                                traceVerbose(`Global Virtual Environment: [added] ${filename}`);
                            } catch (ex) {
                                traceError(`Failed to process environment: ${filename}`, ex);
                            }
                        } else {
                            traceVerbose(`Global Virtual Environment: [skipped] ${filename}`);
                        }
                    }
                }
                return generator();
            });

            yield* iterable(chain(envGenerators));
            traceInfo(`Finished searching for global virtual envs: ${stopWatch.elapsedTime} milliseconds`);
        }

        return iterator();
    }
}
