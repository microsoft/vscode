// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import { Event, Uri } from 'vscode';
import { createDeferred, flattenIterator, iterable, mapToIterator } from '../../../client/common/utils/async';
import { getArchitecture } from '../../../client/common/utils/platform';
import { getVersionString } from '../../../client/common/utils/version';
import {
    PythonDistroInfo,
    PythonEnvInfo,
    PythonEnvKind,
    PythonEnvSource,
    PythonExecutableInfo,
} from '../../../client/pythonEnvironments/base/info';
import { buildEnvInfo } from '../../../client/pythonEnvironments/base/info/env';
import { getEmptyVersion, parseVersion } from '../../../client/pythonEnvironments/base/info/pythonVersion';
import {
    BasicEnvInfo,
    IPythonEnvsIterator,
    isProgressEvent,
    Locator,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonEnvUpdatedEvent,
    PythonLocatorQuery,
} from '../../../client/pythonEnvironments/base/locator';
import { PythonEnvsChangedEvent } from '../../../client/pythonEnvironments/base/watcher';
import { noop } from '../../core';

export function createLocatedEnv(
    locationStr: string,
    versionStr: string,
    kind = PythonEnvKind.Unknown,
    exec: string | PythonExecutableInfo = 'python',
    distro: PythonDistroInfo = { org: '' },
    searchLocation?: Uri,
): PythonEnvInfo {
    const location =
        locationStr === ''
            ? '' // an empty location
            : path.normalize(locationStr);
    let executable: string | undefined;
    if (typeof exec === 'string') {
        const normalizedExecutable = path.normalize(exec);
        executable =
            location === '' || path.isAbsolute(normalizedExecutable)
                ? normalizedExecutable
                : path.join(location, 'bin', normalizedExecutable);
    }
    const version =
        versionStr === ''
            ? getEmptyVersion() // an empty version
            : parseVersion(versionStr);
    const env = buildEnvInfo({
        kind,
        executable,
        location,
        version,
        searchLocation,
    });
    env.arch = getArchitecture();
    env.distro = distro;
    if (typeof exec !== 'string') {
        env.executable = exec;
    }
    return env;
}

export function createBasicEnv(
    kind: PythonEnvKind,
    executablePath: string,
    source?: PythonEnvSource[],
    envPath?: string,
): BasicEnvInfo {
    const basicEnv = { executablePath, kind, source, envPath };
    if (!source) {
        delete basicEnv.source;
    }
    if (!envPath) {
        delete basicEnv.envPath;
    }
    return basicEnv;
}

export function createNamedEnv(
    name: string,
    versionStr: string,
    kind?: PythonEnvKind,
    exec: string | PythonExecutableInfo = 'python',
    distro?: PythonDistroInfo,
): PythonEnvInfo {
    const env = createLocatedEnv('', versionStr, kind, exec, distro);
    env.name = name;
    return env;
}

export class SimpleLocator<I = PythonEnvInfo> extends Locator<I> {
    public readonly providerId: string = 'SimpleLocator';

    private deferred = createDeferred<void>();

    constructor(
        private envs: I[],
        public callbacks: {
            resolve?: null | ((env: PythonEnvInfo | string) => Promise<PythonEnvInfo | undefined>);
            before?(): Promise<void>;
            after?(): Promise<void>;
            onUpdated?: Event<PythonEnvUpdatedEvent<I> | ProgressNotificationEvent>;
            beforeEach?(e: I): Promise<void>;
            afterEach?(e: I): Promise<void>;
            onQuery?(query: PythonLocatorQuery | undefined, envs: I[]): Promise<I[]>;
        } = {},
        private options?: { resolveAsString?: boolean },
    ) {
        super();
    }

    public get done(): Promise<void> {
        return this.deferred.promise;
    }

    public fire(event: PythonEnvsChangedEvent): void {
        this.emitter.fire(event);
    }

    public iterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<I> {
        const { deferred } = this;
        const { callbacks } = this;
        let { envs } = this;
        const iterator: IPythonEnvsIterator<I> = (async function* () {
            if (callbacks?.onQuery !== undefined) {
                envs = await callbacks.onQuery(query, envs);
            }
            if (callbacks.before !== undefined) {
                await callbacks.before();
            }
            if (callbacks.beforeEach !== undefined) {
                // The results will likely come in a different order.
                const mapped = mapToIterator(envs, async (env) => {
                    await callbacks.beforeEach!(env);
                    return env;
                });
                for await (const env of iterable(mapped)) {
                    yield env;
                    if (callbacks.afterEach !== undefined) {
                        await callbacks.afterEach(env);
                    }
                }
            } else {
                for (const env of envs) {
                    yield env;
                    if (callbacks.afterEach !== undefined) {
                        await callbacks.afterEach(env);
                    }
                }
            }
            if (callbacks?.after !== undefined) {
                await callbacks.after();
            }
            deferred.resolve();
        })();
        iterator.onUpdated = this.callbacks?.onUpdated;
        return iterator;
    }

    public async resolveEnv(env: string): Promise<PythonEnvInfo | undefined> {
        const envInfo: PythonEnvInfo = createLocatedEnv('', '', undefined, env);
        if (this.callbacks.resolve === undefined) {
            return envInfo;
        }
        if (this.callbacks?.resolve === null) {
            return undefined;
        }
        return this.callbacks.resolve(this.options?.resolveAsString ? env : envInfo);
    }
}

export async function getEnvs<I = PythonEnvInfo>(iterator: IPythonEnvsIterator<I>): Promise<I[]> {
    return flattenIterator(iterator);
}

/**
 * Unroll the given iterator into an array.
 *
 * This includes applying any received updates.
 */
export async function getEnvsWithUpdates<I = PythonEnvInfo>(
    iterator: IPythonEnvsIterator<I>,
    iteratorUpdateCallback: () => void = noop,
): Promise<I[]> {
    const envs: (I | undefined)[] = [];

    const updatesDone = createDeferred<void>();
    if (iterator.onUpdated === undefined) {
        updatesDone.resolve();
    } else {
        const listener = iterator.onUpdated((event) => {
            if (isProgressEvent(event)) {
                if (event.stage !== ProgressReportStage.discoveryFinished) {
                    return;
                }
                updatesDone.resolve();
                listener.dispose();
            } else if (event.index !== undefined) {
                const { index, update } = event;
                // We don't worry about if envs[index] is set already.
                envs[index] = update;
            }
        });
    }

    let itemIndex = 0;
    for await (const env of iterator) {
        // We can't just push because updates might get emitted early.
        if (envs[itemIndex] === undefined) {
            envs[itemIndex] = env;
        }
        itemIndex += 1;
    }
    iteratorUpdateCallback();
    await updatesDone.promise;

    // Do not return invalid environments
    return envs.filter((e) => e !== undefined).map((e) => e!);
}

export function sortedEnvs(envs: PythonEnvInfo[]): PythonEnvInfo[] {
    return envs.sort((env1, env2) => {
        const env1str = `${env1.kind}-${env1.executable.filename}-${getVersionString(env1.version)}`;
        const env2str = `${env2.kind}-${env2.executable.filename}-${getVersionString(env2.version)}`;
        return env1str.localeCompare(env2str);
    });
}

export function assertSameEnvs(envs: PythonEnvInfo[], expected: PythonEnvInfo[]): void {
    expect(sortedEnvs(envs)).to.deep.equal(sortedEnvs(expected));
}
