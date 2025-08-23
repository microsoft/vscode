// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { asyncFilter } from '../../../../common/utils/arrayUtils';
import { chain, iterable } from '../../../../common/utils/async';
import { traceError, traceVerbose } from '../../../../logging';
import { getCondaInterpreterPath } from '../../../common/environmentManagers/conda';
import { pathExists } from '../../../common/externalDependencies';
import { PythonEnvKind } from '../../info';
import { IPythonEnvsIterator, BasicEnvInfo } from '../../locator';
import { FSWatcherKind, FSWatchingLocator } from './fsWatchingLocator';
import { getPixi } from '../../../common/environmentManagers/pixi';

/**
 * Returns all virtual environment locations to look for in a workspace.
 */
async function getVirtualEnvDirs(root: string): Promise<string[]> {
    const pixi = await getPixi();
    const envDirs = (await pixi?.getEnvList(root)) ?? [];
    return asyncFilter(envDirs, pathExists);
}

/**
 * Returns all virtual environment locations to look for in a workspace.
 */
function getVirtualEnvRootDirs(root: string): string[] {
    return [path.join(path.join(root, '.pixi'), 'envs')];
}

export class PixiLocator extends FSWatchingLocator {
    public readonly providerId: string = 'pixi';

    public constructor(private readonly root: string) {
        super(
            async () => getVirtualEnvRootDirs(this.root),
            async () => PythonEnvKind.Pixi,
            {
                // Note detecting kind of virtual env depends on the file structure around the
                // executable, so we need to wait before attempting to detect it.
                delayOnCreated: 1000,
            },
            FSWatcherKind.Workspace,
        );
    }

    protected doIterEnvs(): IPythonEnvsIterator<BasicEnvInfo> {
        async function* iterator(root: string) {
            const envDirs = await getVirtualEnvDirs(root);
            const envGenerators = envDirs.map((envDir) => {
                async function* generator() {
                    traceVerbose(`Searching for Pixi virtual envs in: ${envDir}`);
                    const filename = await getCondaInterpreterPath(envDir);
                    if (filename !== undefined) {
                        try {
                            yield {
                                executablePath: filename,
                                kind: PythonEnvKind.Pixi,
                                envPath: envDir,
                            };

                            traceVerbose(`Pixi Virtual Environment: [added] ${filename}`);
                        } catch (ex) {
                            traceError(`Failed to process environment: ${filename}`, ex);
                        }
                    }
                }
                return generator();
            });

            yield* iterable(chain(envGenerators));
            traceVerbose(`Finished searching for Pixi envs`);
        }

        return iterator(this.root);
    }
}
