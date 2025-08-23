// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable max-classes-per-file */

import { Event } from 'vscode';
import * as path from 'path';
import { IDisposable } from '../../../../common/types';
import { getSearchPathEntries } from '../../../../common/utils/exec';
import { Disposables } from '../../../../common/utils/resourceLifecycle';
import { isPyenvShimDir } from '../../../common/environmentManagers/pyenv';
import { isMicrosoftStoreDir } from '../../../common/environmentManagers/microsoftStoreEnv';
import { PythonEnvKind, PythonEnvSource } from '../../info';
import { BasicEnvInfo, ILocator, IPythonEnvsIterator, PythonLocatorQuery } from '../../locator';
import { Locators } from '../../locators';
import { getEnvs } from '../../locatorUtils';
import { PythonEnvsChangedEvent } from '../../watcher';
import { DirFilesLocator } from './filesLocator';
import { traceInfo } from '../../../../logging';
import { inExperiment, pathExists } from '../../../common/externalDependencies';
import { DiscoveryUsingWorkers } from '../../../../common/experiments/groups';
import { iterPythonExecutablesInDir, looksLikeBasicGlobalPython } from '../../../common/commonUtils';
import { StopWatch } from '../../../../common/utils/stopWatch';

/**
 * A locator for Windows locators found under the $PATH env var.
 *
 * Note that we assume $PATH won't change, so we don't need to watch
 * it for changes.
 */
export class WindowsPathEnvVarLocator implements ILocator<BasicEnvInfo>, IDisposable {
    public readonly providerId: string = 'windows-path-env-var-locator';

    public readonly onChanged: Event<PythonEnvsChangedEvent>;

    private readonly locators: Locators<BasicEnvInfo>;

    private readonly disposables = new Disposables();

    constructor() {
        const inExp = inExperiment(DiscoveryUsingWorkers.experiment);
        const dirLocators: (ILocator<BasicEnvInfo> & IDisposable)[] = getSearchPathEntries()
            .filter(
                (dirname) =>
                    // Filter out following directories:
                    // 1. Microsoft Store app directories: We have a store app locator that handles this. The
                    //    python.exe available in these directories might not be python. It can be a store
                    //    install shortcut that takes you to microsoft store.
                    //
                    // 2. Filter out pyenv shims: They are not actual python binaries, they are used to launch
                    //    the binaries specified in .python-version file in the cwd. We should not be reporting
                    //    those binaries as environments.
                    !isMicrosoftStoreDir(dirname) && !isPyenvShimDir(dirname),
            )
            // Build a locator for each directory.
            .map((dirname) => getDirFilesLocator(dirname, PythonEnvKind.System, [PythonEnvSource.PathEnvVar], inExp));
        this.disposables.push(...dirLocators);
        this.locators = new Locators(dirLocators);
        this.onChanged = this.locators.onChanged;
    }

    public async dispose(): Promise<void> {
        this.locators.dispose();
        await this.disposables.dispose();
    }

    public iterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<BasicEnvInfo> {
        // Note that we do no filtering here, including to check if files
        // are valid executables.  That is left to callers (e.g. composite
        // locators).
        async function* iterator(it: IPythonEnvsIterator<BasicEnvInfo>) {
            const stopWatch = new StopWatch();
            traceInfo(`Searching windows known paths locator`);
            for await (const env of it) {
                yield env;
            }
            traceInfo(`Finished searching windows known paths locator: ${stopWatch.elapsedTime} milliseconds`);
        }
        return iterator(this.locators.iterEnvs(query));
    }
}

async function* oldGetExecutables(dirname: string): AsyncIterableIterator<string> {
    for await (const entry of iterPythonExecutablesInDir(dirname)) {
        if (await looksLikeBasicGlobalPython(entry)) {
            yield entry.filename;
        }
    }
}

async function* getExecutables(dirname: string): AsyncIterableIterator<string> {
    const executable = path.join(dirname, 'python.exe');
    if (await pathExists(executable)) {
        yield executable;
    }
}

function getDirFilesLocator(
    // These are passed through to DirFilesLocator.
    dirname: string,
    kind: PythonEnvKind,
    source?: PythonEnvSource[],
    inExp?: boolean,
): ILocator<BasicEnvInfo> & IDisposable {
    // For now we do not bother using a locator that watches for changes
    // in the directory.  If we did then we would use
    // `DirFilesWatchingLocator`, but only if not \\windows\system32 and
    // the `isDirWatchable()` (from fsWatchingLocator.ts) returns true.
    const executableFunc = inExp ? getExecutables : oldGetExecutables;
    const locator = new DirFilesLocator(dirname, kind, executableFunc, source);
    const dispose = async () => undefined;

    // Really we should be checking for symlinks or something more
    // sophisticated.  Also, this should be done in ReducingLocator
    // rather than in each low-level locator.  In the meantime we
    // take a naive approach.
    async function* iterEnvs(query: PythonLocatorQuery): IPythonEnvsIterator<BasicEnvInfo> {
        yield* await getEnvs(locator.iterEnvs(query)).then((res) => res);
    }
    return {
        providerId: locator.providerId,
        iterEnvs,
        dispose,
        onChanged: locator.onChanged,
    };
}
