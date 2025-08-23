// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IDisposable } from '../../../../common/types';
import { createDeferred, Deferred } from '../../../../common/utils/async';
import { Disposables } from '../../../../common/utils/resourceLifecycle';
import { traceError, traceWarn } from '../../../../logging';
import { arePathsSame, isVirtualWorkspace } from '../../../common/externalDependencies';
import { getEnvPath } from '../../info/env';
import { BasicEnvInfo, IPythonEnvsIterator, Locator, PythonLocatorQuery } from '../../locator';

/**
 * A base locator class that manages the lifecycle of resources.
 *
 * The resources are not initialized until needed.
 *
 * It is critical that each subclass properly add its resources
 * to the list:
 *
 *   this.disposables.push(someResource);
 *
 * Otherwise it will leak (and we have no leak detection).
 */
export abstract class LazyResourceBasedLocator extends Locator<BasicEnvInfo> implements IDisposable {
    protected readonly disposables = new Disposables();

    // This will be set only once we have to create necessary resources
    // and resolves once those resources are ready.
    private resourcesReady?: Deferred<void>;

    private watchersReady?: Deferred<void>;

    /**
     * This can be used to initialize resources when subclasses are created.
     */
    protected async activate(): Promise<void> {
        await this.ensureResourcesReady();
        // There is not need to wait for the watchers to get started.
        try {
            this.ensureWatchersReady();
        } catch (ex) {
            traceWarn(`Failed to ensure watchers are ready for locator ${this.constructor.name}`, ex);
        }
    }

    public async dispose(): Promise<void> {
        await this.disposables.dispose();
    }

    public async *iterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<BasicEnvInfo> {
        await this.activate();
        const iterator = this.doIterEnvs(query);
        if (query?.envPath) {
            let result = await iterator.next();
            while (!result.done) {
                const currEnv = result.value;
                const { path } = getEnvPath(currEnv.executablePath, currEnv.envPath);
                if (arePathsSame(path, query.envPath)) {
                    yield currEnv;
                    break;
                }
                result = await iterator.next();
            }
        } else {
            yield* iterator;
        }
    }

    /**
     * The subclass implementation of iterEnvs().
     */
    protected abstract doIterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<BasicEnvInfo>;

    /**
     * This is where subclasses get their resources ready.
     *
     * It is only called once resources are needed.
     *
     * Each subclass is responsible to add its resources to the list
     * (otherwise it leaks):
     *
     *   this.disposables.push(someResource);
     *
     * Not all locators have resources other than watchers so a default
     * implementation is provided.
     */
    // eslint-disable-next-line class-methods-use-this
    protected async initResources(): Promise<void> {
        // No resources!
    }

    /**
     * This is where subclasses get their watchers ready.
     *
     * It is only called with the first `iterEnvs()` call,
     * after `initResources()` has been called.
     *
     * Each subclass is responsible to add its resources to the list
     * (otherwise it leaks):
     *
     *   this.disposables.push(someResource);
     *
     * Not all locators have watchers to init so a default
     * implementation is provided.
     */
    // eslint-disable-next-line class-methods-use-this
    protected async initWatchers(): Promise<void> {
        // No watchers!
    }

    protected async ensureResourcesReady(): Promise<void> {
        if (this.resourcesReady !== undefined) {
            await this.resourcesReady.promise;
            return;
        }
        this.resourcesReady = createDeferred<void>();
        await this.initResources().catch((ex) => {
            traceError(ex);
            this.resourcesReady?.reject(ex);
        });
        this.resourcesReady.resolve();
    }

    private async ensureWatchersReady(): Promise<void> {
        if (this.watchersReady !== undefined) {
            await this.watchersReady.promise;
            return;
        }
        this.watchersReady = createDeferred<void>();

        // Don't create any file watchers in a virtual workspace.
        if (!isVirtualWorkspace()) {
            await this.initWatchers().catch((ex) => {
                traceError(ex);
                this.watchersReady?.reject(ex);
            });
        }
        this.watchersReady.resolve();
    }
}
