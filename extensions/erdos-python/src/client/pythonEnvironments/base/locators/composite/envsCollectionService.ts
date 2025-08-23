// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Event, EventEmitter } from 'vscode';
import '../../../../common/extensions';
import { createDeferred, Deferred } from '../../../../common/utils/async';
import { StopWatch } from '../../../../common/utils/stopWatch';
import { traceError, traceInfo, traceVerbose } from '../../../../logging';
import { sendTelemetryEvent } from '../../../../telemetry';
import { EventName } from '../../../../telemetry/constants';
import { normalizePath } from '../../../common/externalDependencies';
import { PythonEnvInfo, PythonEnvKind } from '../../info';
import { getEnvPath } from '../../info/env';
import {
    GetRefreshEnvironmentsOptions,
    IDiscoveryAPI,
    IResolvingLocator,
    isProgressEvent,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonLocatorQuery,
    TriggerRefreshOptions,
} from '../../locator';
import { getQueryFilter } from '../../locatorUtils';
import { PythonEnvCollectionChangedEvent, PythonEnvsWatcher } from '../../watcher';
import { IEnvsCollectionCache } from './envsCollectionCache';

/**
 * A service which maintains the collection of known environments.
 */
export class EnvsCollectionService extends PythonEnvsWatcher<PythonEnvCollectionChangedEvent> implements IDiscoveryAPI {
    /** Keeps track of ongoing refreshes for various queries. */
    private refreshesPerQuery = new Map<PythonLocatorQuery | undefined, Deferred<void>>();

    /** Keeps track of scheduled refreshes other than the ongoing one for various queries. */
    private scheduledRefreshesPerQuery = new Map<PythonLocatorQuery | undefined, Promise<void>>();

    /** Keeps track of promises which resolves when a stage has been reached */
    private progressPromises = new Map<ProgressReportStage, Deferred<void>>();

    /** Keeps track of whether a refresh has been triggered for various queries. */
    private hasRefreshFinishedForQuery = new Map<PythonLocatorQuery | undefined, boolean>();

    private readonly progress = new EventEmitter<ProgressNotificationEvent>();

    public refreshState = ProgressReportStage.discoveryFinished;

    public get onProgress(): Event<ProgressNotificationEvent> {
        return this.progress.event;
    }

    public getRefreshPromise(options?: GetRefreshEnvironmentsOptions): Promise<void> | undefined {
        const stage = options?.stage ?? ProgressReportStage.discoveryFinished;
        return this.progressPromises.get(stage)?.promise;
    }

    constructor(
        private readonly cache: IEnvsCollectionCache,
        private readonly locator: IResolvingLocator,
        private readonly usingNativeLocator: boolean,
    ) {
        super();
        this.locator.onChanged((event) => {
            const query: PythonLocatorQuery | undefined = event.providerId
                ? { providerId: event.providerId, envPath: event.envPath }
                : undefined; // We can also form a query based on the event, but skip that for simplicity.
            let scheduledRefresh = this.scheduledRefreshesPerQuery.get(query);
            // If there is no refresh scheduled for the query, start a new one.
            if (!scheduledRefresh) {
                scheduledRefresh = this.scheduleNewRefresh(query);
            }
            scheduledRefresh.then(() => {
                // Once refresh of cache is complete, notify changes.
                this.fire(event);
            });
        });
        this.cache.onChanged((e) => {
            this.fire(e);
        });
        this.onProgress((event) => {
            this.refreshState = event.stage;
            // Resolve progress promise indicating the stage has been reached.
            this.progressPromises.get(event.stage)?.resolve();
            this.progressPromises.delete(event.stage);
        });
    }

    public async resolveEnv(path: string): Promise<PythonEnvInfo | undefined> {
        path = normalizePath(path);
        // Note cache may have incomplete info when a refresh is happening.
        // This API is supposed to return complete info by definition, so
        // only use cache if it has complete info on an environment.
        const cachedEnv = await this.cache.getLatestInfo(path);
        if (cachedEnv) {
            return cachedEnv;
        }
        const resolved = await this.locator.resolveEnv(path).catch((ex) => {
            traceError(`Failed to resolve ${path}`, ex);
            return undefined;
        });
        traceVerbose(`Resolved ${path} using downstream locator`);
        if (resolved) {
            this.cache.addEnv(resolved, true);
        }
        return resolved;
    }

    public getEnvs(query?: PythonLocatorQuery): PythonEnvInfo[] {
        const cachedEnvs = this.cache.getAllEnvs();
        return query ? cachedEnvs.filter(getQueryFilter(query)) : cachedEnvs;
    }

    public triggerRefresh(query?: PythonLocatorQuery, options?: TriggerRefreshOptions): Promise<void> {
        let refreshPromise = this.getRefreshPromiseForQuery(query);
        if (!refreshPromise) {
            if (options?.ifNotTriggerredAlready && this.hasRefreshFinished(query)) {
                // Do not trigger another refresh if a refresh has previously finished.
                return Promise.resolve();
            }
            const stopWatch = new StopWatch();
            traceInfo(`Starting Environment refresh`);
            refreshPromise = this.startRefresh(query).then(() => {
                this.sendTelemetry(query, stopWatch);
                traceInfo(`Environment refresh took ${stopWatch.elapsedTime} milliseconds`);
            });
        }
        return refreshPromise;
    }

    private startRefresh(query: PythonLocatorQuery | undefined): Promise<void> {
        this.createProgressStates(query);
        const promise = this.addEnvsToCacheForQuery(query);
        return promise
            .then(async () => {
                this.resolveProgressStates(query);
            })
            .catch((ex) => {
                this.rejectProgressStates(query, ex);
            });
    }

    private async addEnvsToCacheForQuery(query: PythonLocatorQuery | undefined) {
        const iterator = this.locator.iterEnvs(query);
        const seen: PythonEnvInfo[] = [];
        const state = {
            done: false,
            pending: 0,
        };
        const updatesDone = createDeferred<void>();
        const stopWatch = new StopWatch();
        if (iterator.onUpdated !== undefined) {
            const listener = iterator.onUpdated(async (event) => {
                if (isProgressEvent(event)) {
                    switch (event.stage) {
                        case ProgressReportStage.discoveryFinished:
                            state.done = true;
                            listener.dispose();
                            traceInfo(`Environments refresh finished (event): ${stopWatch.elapsedTime} milliseconds`);
                            break;
                        case ProgressReportStage.allPathsDiscovered:
                            if (!query) {
                                traceInfo(
                                    `Environments refresh paths discovered (event): ${stopWatch.elapsedTime} milliseconds`,
                                );
                                // Only mark as all paths discovered when querying for all envs.
                                this.progress.fire(event);
                            }
                            break;
                        default:
                            this.progress.fire(event);
                    }
                } else if (event.index !== undefined) {
                    state.pending += 1;
                    this.cache.updateEnv(seen[event.index], event.update);
                    if (event.update) {
                        seen[event.index] = event.update;
                    }
                    state.pending -= 1;
                }
                if (state.done && state.pending === 0) {
                    updatesDone.resolve();
                }
            });
        } else {
            this.progress.fire({ stage: ProgressReportStage.discoveryStarted });
            updatesDone.resolve();
        }

        for await (const env of iterator) {
            seen.push(env);
            this.cache.addEnv(env);
        }
        traceInfo(`Environments refresh paths discovered: ${stopWatch.elapsedTime} milliseconds`);
        await updatesDone.promise;
        // If query for all envs is done, `seen` should contain the list of all envs.
        await this.cache.validateCache(seen, query === undefined);
        this.cache.flush().ignoreErrors();
    }

    /**
     * See if we already have a refresh promise for the query going on and return it.
     */
    private getRefreshPromiseForQuery(query?: PythonLocatorQuery) {
        // Even if no refresh is running for this exact query, there might be other
        // refreshes running for a superset of this query. For eg. the `undefined` query
        // is a superset for every other query, only consider that for simplicity.
        return this.refreshesPerQuery.get(query)?.promise ?? this.refreshesPerQuery.get(undefined)?.promise;
    }

    private hasRefreshFinished(query?: PythonLocatorQuery) {
        return this.hasRefreshFinishedForQuery.get(query) ?? this.hasRefreshFinishedForQuery.get(undefined);
    }

    /**
     * Ensure we trigger a fresh refresh for the query after the current refresh (if any) is done.
     */
    private async scheduleNewRefresh(query?: PythonLocatorQuery): Promise<void> {
        const refreshPromise = this.getRefreshPromiseForQuery(query);
        let nextRefreshPromise: Promise<void>;
        if (!refreshPromise) {
            nextRefreshPromise = this.startRefresh(query);
        } else {
            nextRefreshPromise = refreshPromise.then(() => {
                // No more scheduled refreshes for this query as we're about to start the scheduled one.
                this.scheduledRefreshesPerQuery.delete(query);
                this.startRefresh(query);
            });
            this.scheduledRefreshesPerQuery.set(query, nextRefreshPromise);
        }
        return nextRefreshPromise;
    }

    private createProgressStates(query: PythonLocatorQuery | undefined) {
        this.refreshesPerQuery.set(query, createDeferred<void>());
        Object.values(ProgressReportStage).forEach((stage) => {
            this.progressPromises.set(stage, createDeferred<void>());
        });
        if (ProgressReportStage.allPathsDiscovered && query) {
            // Only mark as all paths discovered when querying for all envs.
            this.progressPromises.delete(ProgressReportStage.allPathsDiscovered);
        }
    }

    private rejectProgressStates(query: PythonLocatorQuery | undefined, ex: Error) {
        this.refreshesPerQuery.get(query)?.reject(ex);
        this.refreshesPerQuery.delete(query);
        Object.values(ProgressReportStage).forEach((stage) => {
            this.progressPromises.get(stage)?.reject(ex);
            this.progressPromises.delete(stage);
        });
    }

    private resolveProgressStates(query: PythonLocatorQuery | undefined) {
        this.refreshesPerQuery.get(query)?.resolve();
        this.refreshesPerQuery.delete(query);
        // Refreshes per stage are resolved using progress events instead.
        const isRefreshComplete = Array.from(this.refreshesPerQuery.values()).every((d) => d.completed);
        if (isRefreshComplete) {
            this.progress.fire({ stage: ProgressReportStage.discoveryFinished });
        }
    }

    private sendTelemetry(query: PythonLocatorQuery | undefined, stopWatch: StopWatch) {
        if (!query && !this.hasRefreshFinished(query)) {
            const envs = this.cache.getAllEnvs();
            const environmentsWithoutPython = envs.filter(
                (e) => getEnvPath(e.executable.filename, e.location).pathType === 'envFolderPath',
            ).length;
            const activeStateEnvs = envs.filter((e) => e.kind === PythonEnvKind.ActiveState).length;
            const condaEnvs = envs.filter((e) => e.kind === PythonEnvKind.Conda).length;
            const customEnvs = envs.filter((e) => e.kind === PythonEnvKind.Custom).length;
            const hatchEnvs = envs.filter((e) => e.kind === PythonEnvKind.Hatch).length;
            const microsoftStoreEnvs = envs.filter((e) => e.kind === PythonEnvKind.MicrosoftStore).length;
            const otherGlobalEnvs = envs.filter((e) => e.kind === PythonEnvKind.OtherGlobal).length;
            const otherVirtualEnvs = envs.filter((e) => e.kind === PythonEnvKind.OtherVirtual).length;
            const pipEnvEnvs = envs.filter((e) => e.kind === PythonEnvKind.Pipenv).length;
            const poetryEnvs = envs.filter((e) => e.kind === PythonEnvKind.Poetry).length;
            const pyenvEnvs = envs.filter((e) => e.kind === PythonEnvKind.Pyenv).length;
            const systemEnvs = envs.filter((e) => e.kind === PythonEnvKind.System).length;
            const unknownEnvs = envs.filter((e) => e.kind === PythonEnvKind.Unknown).length;
            const venvEnvs = envs.filter((e) => e.kind === PythonEnvKind.Venv).length;
            const virtualEnvEnvs = envs.filter((e) => e.kind === PythonEnvKind.VirtualEnv).length;
            const virtualEnvWrapperEnvs = envs.filter((e) => e.kind === PythonEnvKind.VirtualEnvWrapper).length;

            // Intent is to capture time taken for discovery of all envs to complete the first time.
            sendTelemetryEvent(EventName.PYTHON_INTERPRETER_DISCOVERY, stopWatch.elapsedTime, {
                interpreters: this.cache.getAllEnvs().length,
                usingNativeLocator: this.usingNativeLocator,
                environmentsWithoutPython,
                activeStateEnvs,
                condaEnvs,
                customEnvs,
                hatchEnvs,
                microsoftStoreEnvs,
                otherGlobalEnvs,
                otherVirtualEnvs,
                pipEnvEnvs,
                poetryEnvs,
                pyenvEnvs,
                systemEnvs,
                unknownEnvs,
                venvEnvs,
                virtualEnvEnvs,
                virtualEnvWrapperEnvs,
            });
        }
        this.hasRefreshFinishedForQuery.set(query, true);
    }
}
