// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';
import { FileChangeType, watchLocationForPattern } from '../../../../common/platform/fileSystemWatcher';
import { sleep } from '../../../../common/utils/async';
import { traceVerbose, traceWarn } from '../../../../logging';
import { getEnvironmentDirFromPath } from '../../../common/commonUtils';
import {
    PythonEnvStructure,
    resolvePythonExeGlobs,
    watchLocationForPythonBinaries,
} from '../../../common/pythonBinariesWatcher';
import { PythonEnvKind } from '../../info';
import { LazyResourceBasedLocator } from '../common/resourceBasedLocator';

export enum FSWatcherKind {
    Global, // Watcher observes a global location such as ~/.envs, %LOCALAPPDATA%/Microsoft/WindowsApps.
    Workspace, // Watchers observes directory in the user's currently open workspace.
}

type DirUnwatchableReason = 'directory does not exist' | 'too many files' | undefined;

/**
 * Determine if the directory is watchable.
 */
function checkDirWatchable(dirname: string): DirUnwatchableReason {
    let names: string[];
    try {
        names = fs.readdirSync(dirname);
    } catch (err) {
        const exception = err as NodeJS.ErrnoException;
        traceVerbose('Reading directory failed', exception);
        if (exception.code === 'ENOENT') {
            // Treat a missing directory as unwatchable since it can lead to CPU load issues:
            // https://github.com/microsoft/vscode-python/issues/18459
            return 'directory does not exist';
        }
        return undefined;
    }
    // The limit here is an educated guess.
    if (names.length > 200) {
        return 'too many files';
    }
    return undefined;
}

type LocationWatchOptions = {
    /**
     * Glob which represents basename of the executable or directory to watch.
     */
    baseGlob?: string;
    /**
     * Time to wait before handling an environment-created event.
     */
    delayOnCreated?: number; // milliseconds
    /**
     * Location affected by the event. If not provided, a default search location is used.
     */
    searchLocation?: string;
    /**
     * The Python env structure to watch.
     */
    envStructure?: PythonEnvStructure;
};

type FileWatchOptions = {
    /**
     * If the provided root is a file instead. In this case the file is directly watched instead for
     * looking for python binaries inside a root.
     */
    isFile: boolean;
};

/**
 * The base for Python envs locators who watch the file system.
 * Most low-level locators should be using this.
 *
 * Subclasses can call `this.emitter.fire()` * to emit events.
 */
export abstract class FSWatchingLocator extends LazyResourceBasedLocator {
    constructor(
        /**
         * Location(s) to watch for python binaries.
         */
        private readonly getRoots: () => Promise<string[]> | string | string[],
        /**
         * Returns the kind of environment specific to locator given the path to executable.
         */
        private readonly getKind: (executable: string) => Promise<PythonEnvKind>,
        private readonly creationOptions: LocationWatchOptions | FileWatchOptions = {},
        private readonly watcherKind: FSWatcherKind = FSWatcherKind.Global,
    ) {
        super();
        this.activate().ignoreErrors();
    }

    protected async initWatchers(): Promise<void> {
        // Enable all workspace watchers.
        if (this.watcherKind === FSWatcherKind.Global && !isWatchingAFile(this.creationOptions)) {
            // Do not allow global location watchers for now.
            return;
        }

        // Start the FS watchers.
        let roots = await this.getRoots();
        if (typeof roots === 'string') {
            roots = [roots];
        }
        const promises = roots.map(async (root) => {
            if (isWatchingAFile(this.creationOptions)) {
                return root;
            }
            // Note that we only check the root dir.  Any directories
            // that might be watched due to a glob are not checked.
            const unwatchable = await checkDirWatchable(root);
            if (unwatchable) {
                traceWarn(`Dir "${root}" is not watchable (${unwatchable})`);
                return undefined;
            }
            return root;
        });
        const watchableRoots = (await Promise.all(promises)).filter((root) => !!root) as string[];
        watchableRoots.forEach((root) => this.startWatchers(root));
    }

    protected fire(args = {}): void {
        this.emitter.fire({ ...args, providerId: this.providerId });
    }

    private startWatchers(root: string): void {
        const opts = this.creationOptions;
        if (isWatchingAFile(opts)) {
            traceVerbose('Start watching file for changes', root);
            this.disposables.push(
                watchLocationForPattern(path.dirname(root), path.basename(root), () => {
                    traceVerbose('Detected change in file: ', root, 'initiating a refresh');
                    this.emitter.fire({ providerId: this.providerId });
                }),
            );
            return;
        }
        const callback = async (type: FileChangeType, executable: string) => {
            if (type === FileChangeType.Created) {
                if (opts.delayOnCreated !== undefined) {
                    // Note detecting kind of env depends on the file structure around the
                    // executable, so we need to wait before attempting to detect it.
                    await sleep(opts.delayOnCreated);
                }
            }
            // Fetching kind after deletion normally fails because the file structure around the
            // executable is no longer available, so ignore the errors.
            const kind = await this.getKind(executable).catch(() => undefined);
            // By default, search location particularly for virtual environments is intended as the
            // directory in which the environment was found in. For eg. the default search location
            // for an env containing 'bin' or 'Scripts' directory is:
            //
            // searchLocation <--- Default search location directory
            // |__ env
            //    |__ bin or Scripts
            //        |__ python  <--- executable
            const searchLocation = Uri.file(opts.searchLocation ?? path.dirname(getEnvironmentDirFromPath(executable)));
            traceVerbose('Fired event ', JSON.stringify({ type, kind, searchLocation }), 'from locator');
            this.emitter.fire({ type, kind, searchLocation, providerId: this.providerId, envPath: executable });
        };

        const globs = resolvePythonExeGlobs(
            opts.baseGlob,
            // The structure determines which globs are returned.
            opts.envStructure,
        );
        traceVerbose('Start watching root', root, 'for globs', JSON.stringify(globs));
        const watchers = globs.map((g) => watchLocationForPythonBinaries(root, callback, g));
        this.disposables.push(...watchers);
    }
}

function isWatchingAFile(options: LocationWatchOptions | FileWatchOptions): options is FileWatchOptions {
    return 'isFile' in options && options.isFile;
}
