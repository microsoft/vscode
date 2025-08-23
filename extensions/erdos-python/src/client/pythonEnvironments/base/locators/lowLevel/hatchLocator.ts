'use strict';

import { PythonEnvKind } from '../../info';
import { BasicEnvInfo, IPythonEnvsIterator } from '../../locator';
import { LazyResourceBasedLocator } from '../common/resourceBasedLocator';
import { Hatch } from '../../../common/environmentManagers/hatch';
import { asyncFilter } from '../../../../common/utils/arrayUtils';
import { pathExists } from '../../../common/externalDependencies';
import { traceError, traceVerbose } from '../../../../logging';
import { chain, iterable } from '../../../../common/utils/async';
import { getInterpreterPathFromDir } from '../../../common/commonUtils';

/**
 * Gets all default virtual environment locations to look for in a workspace.
 */
async function getVirtualEnvDirs(root: string): Promise<string[]> {
    const hatch = await Hatch.getHatch(root);
    const envDirs = (await hatch?.getEnvList()) ?? [];
    return asyncFilter(envDirs, pathExists);
}

/**
 * Finds and resolves virtual environments created using Hatch.
 */
export class HatchLocator extends LazyResourceBasedLocator {
    public readonly providerId: string = 'hatch';

    public constructor(private readonly root: string) {
        super();
    }

    protected doIterEnvs(): IPythonEnvsIterator<BasicEnvInfo> {
        async function* iterator(root: string) {
            const envDirs = await getVirtualEnvDirs(root);
            const envGenerators = envDirs.map((envDir) => {
                async function* generator() {
                    traceVerbose(`Searching for Hatch virtual envs in: ${envDir}`);
                    const filename = await getInterpreterPathFromDir(envDir);
                    if (filename !== undefined) {
                        try {
                            yield { executablePath: filename, kind: PythonEnvKind.Hatch };
                            traceVerbose(`Hatch Virtual Environment: [added] ${filename}`);
                        } catch (ex) {
                            traceError(`Failed to process environment: ${filename}`, ex);
                        }
                    }
                }
                return generator();
            });

            yield* iterable(chain(envGenerators));
            traceVerbose(`Finished searching for Hatch envs`);
        }

        return iterator(this.root);
    }
}
