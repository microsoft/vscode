// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import '../../../../common/extensions';
import { PythonEnvKind } from '../../info';
import { BasicEnvInfo, IPythonEnvsIterator } from '../../locator';
import { Conda, getCondaEnvironmentsTxt } from '../../../common/environmentManagers/conda';
import { traceError, traceInfo, traceVerbose } from '../../../../logging';
import { FSWatchingLocator } from './fsWatchingLocator';
import { StopWatch } from '../../../../common/utils/stopWatch';

export class CondaEnvironmentLocator extends FSWatchingLocator {
    public readonly providerId: string = 'conda-envs';

    public constructor() {
        super(
            () => getCondaEnvironmentsTxt(),
            async () => PythonEnvKind.Conda,
            { isFile: true },
        );
    }

    // eslint-disable-next-line class-methods-use-this
    public async *doIterEnvs(_: unknown): IPythonEnvsIterator<BasicEnvInfo> {
        const stopWatch = new StopWatch();
        traceInfo('Searching for conda environments');
        const conda = await Conda.getConda();
        if (conda === undefined) {
            traceVerbose(`Couldn't locate the conda binary.`);
            return;
        }
        traceVerbose(`Searching for conda environments using ${conda.command}`);

        const envs = await conda.getEnvList();
        for (const env of envs) {
            try {
                traceVerbose(`Looking into conda env for executable: ${JSON.stringify(env)}`);
                const executablePath = await conda.getInterpreterPathForEnvironment(env);
                traceVerbose(`Found conda executable: ${executablePath}`);
                yield { kind: PythonEnvKind.Conda, executablePath, envPath: env.prefix };
            } catch (ex) {
                traceError(`Failed to process conda env: ${JSON.stringify(env)}`, ex);
            }
        }
        traceInfo(`Finished searching for conda environments: ${stopWatch.elapsedTime} milliseconds`);
    }
}
