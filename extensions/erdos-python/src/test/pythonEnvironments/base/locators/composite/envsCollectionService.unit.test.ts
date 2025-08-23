// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { assert, expect } from 'chai';
import { cloneDeep } from 'lodash';
import * as path from 'path';
import * as sinon from 'sinon';
import { EventEmitter, Uri } from 'vscode';
import { FileChangeType } from '../../../../../client/common/platform/fileSystemWatcher';
import { createDeferred, createDeferredFromPromise, sleep } from '../../../../../client/common/utils/async';
import { PythonEnvInfo, PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { areSameEnv, buildEnvInfo } from '../../../../../client/pythonEnvironments/base/info/env';
import {
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonEnvUpdatedEvent,
} from '../../../../../client/pythonEnvironments/base/locator';
import { createCollectionCache } from '../../../../../client/pythonEnvironments/base/locators/composite/envsCollectionCache';
import { EnvsCollectionService } from '../../../../../client/pythonEnvironments/base/locators/composite/envsCollectionService';
import { PythonEnvCollectionChangedEvent } from '../../../../../client/pythonEnvironments/base/watcher';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import { noop } from '../../../../core';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { SimpleLocator } from '../../common';
import { assertEnvEqual, assertEnvsEqual, createFile, deleteFile } from '../envTestUtils';
import { OSType, getOSType } from '../../../../common';
import * as nativeFinder from '../../../../../client/pythonEnvironments/base/locators/common/nativePythonFinder';

class MockNativePythonFinder implements nativeFinder.NativePythonFinder {
    find(_searchPath: string): Promise<nativeFinder.NativeEnvInfo[]> {
        throw new Error('Method not implemented.');
    }

    getCondaInfo(): Promise<nativeFinder.NativeCondaInfo> {
        throw new Error('Method not implemented.');
    }

    resolve(_executable: string): Promise<nativeFinder.NativeEnvInfo> {
        throw new Error('Method not implemented.');
    }

    refresh(): AsyncIterable<nativeFinder.NativeEnvInfo> {
        const envs: nativeFinder.NativeEnvInfo[] = [];
        return (async function* () {
            for (const env of envs) {
                yield env;
            }
        })();
    }

    dispose() {
        /** noop */
    }
}

suite('Python envs locator - Environments Collection', async () => {
    let getNativePythonFinderStub: sinon.SinonStub;
    let collectionService: EnvsCollectionService;
    let storage: PythonEnvInfo[];

    const updatedName = 'updatedName';
    const pathToCondaPython = getOSType() === OSType.Windows ? 'python.exe' : path.join('bin', 'python');
    const condaEnvWithoutPython = createEnv(
        'python',
        undefined,
        undefined,
        path.join(TEST_LAYOUT_ROOT, 'envsWithoutPython', 'condaLackingPython'),
        PythonEnvKind.Conda,
        path.join(TEST_LAYOUT_ROOT, 'envsWithoutPython', 'condaLackingPython', pathToCondaPython),
    );
    const condaEnvWithPython = createEnv(
        path.join(TEST_LAYOUT_ROOT, 'envsWithoutPython', 'condaLackingPython', pathToCondaPython),
        undefined,
        undefined,
        path.join(TEST_LAYOUT_ROOT, 'envsWithoutPython', 'condaLackingPython'),
        PythonEnvKind.Conda,
        path.join(TEST_LAYOUT_ROOT, 'envsWithoutPython', 'condaLackingPython', pathToCondaPython),
    );

    function applyChangeEventToEnvList(envs: PythonEnvInfo[], event: PythonEnvCollectionChangedEvent) {
        const env = event.old ?? event.new;
        let envIndex = -1;
        if (env) {
            envIndex = envs.findIndex((item) => item.executable.filename === env.executable.filename);
        }
        if (event.new) {
            if (envIndex === -1) {
                envs.push(event.new);
            } else {
                envs[envIndex] = event.new;
            }
        }
        if (envIndex !== -1 && event.new === undefined) {
            envs.splice(envIndex, 1);
        }
        return envs;
    }

    function createEnv(
        executable: string,
        searchLocation?: Uri,
        name?: string,
        location?: string,
        kind?: PythonEnvKind,
        id?: string,
    ) {
        const env = buildEnvInfo({ executable, searchLocation, name, location, kind });
        env.id = id ?? env.id;
        env.version.major = 3;
        env.version.minor = 10;
        env.version.micro = 10;
        return env;
    }

    function getLocatorEnvs() {
        const env1 = createEnv(path.join(TEST_LAYOUT_ROOT, 'conda1', 'python.exe'));
        const env2 = createEnv(
            path.join(TEST_LAYOUT_ROOT, 'pipenv', 'project1', '.venv', 'Scripts', 'python.exe'),
            Uri.file(TEST_LAYOUT_ROOT),
        );
        const env3 = createEnv(
            path.join(TEST_LAYOUT_ROOT, 'pyenv2', '.pyenv', 'pyenv-win', 'versions', '3.6.9', 'bin', 'python.exe'),
        );
        const env4 = createEnv(path.join(TEST_LAYOUT_ROOT, 'virtualhome', '.venvs', 'win1', 'python.exe')); // Path is valid but it's an invalid env
        return [env1, env2, env3, env4];
    }

    function getValidCachedEnvs() {
        const cachedEnvForWorkspace = createEnv(
            path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1', 'win1', 'python.exe'),
            Uri.file(path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1')),
        );
        const fakeLocalAppDataPath = path.join(TEST_LAYOUT_ROOT, 'storeApps');
        const envCached1 = createEnv(path.join(fakeLocalAppDataPath, 'Microsoft', 'WindowsApps', 'python.exe'));
        const envCached2 = createEnv(
            path.join(TEST_LAYOUT_ROOT, 'pipenv', 'project1', '.venv', 'Scripts', 'python.exe'),
            Uri.file(TEST_LAYOUT_ROOT),
        );
        const envCached3 = condaEnvWithoutPython;
        return [cachedEnvForWorkspace, envCached1, envCached2, envCached3];
    }

    function getCachedEnvs() {
        const envCached3 = createEnv(path.join(TEST_LAYOUT_ROOT, 'doesNotExist')); // Invalid path, should not be reported.
        return [...getValidCachedEnvs(), envCached3];
    }

    function getExpectedEnvs() {
        const cachedEnvForWorkspace = createEnv(
            path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1', 'win1', 'python.exe'),
            Uri.file(path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1')),
        );
        const env1 = createEnv(path.join(TEST_LAYOUT_ROOT, 'conda1', 'python.exe'), undefined, updatedName);
        const env2 = createEnv(
            path.join(TEST_LAYOUT_ROOT, 'pipenv', 'project1', '.venv', 'Scripts', 'python.exe'),
            Uri.file(TEST_LAYOUT_ROOT),
            updatedName,
        );
        const env3 = createEnv(
            path.join(TEST_LAYOUT_ROOT, 'pyenv2', '.pyenv', 'pyenv-win', 'versions', '3.6.9', 'bin', 'python.exe'),
            undefined,
            updatedName,
        );
        // Do not include cached envs which were not yielded by the locator, unless it belongs to some workspace.
        return [cachedEnvForWorkspace, env1, env2, env3];
    }

    setup(async () => {
        getNativePythonFinderStub = sinon.stub(nativeFinder, 'getNativePythonFinder');
        getNativePythonFinderStub.returns(new MockNativePythonFinder());
        storage = [];
        const parentLocator = new SimpleLocator(getLocatorEnvs());
        const cache = await createCollectionCache({
            get: () => getCachedEnvs(),
            store: async (envs) => {
                storage = envs;
            },
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
    });

    teardown(async () => {
        await deleteFile(condaEnvWithPython.executable.filename); //  Restore to the original state
        sinon.restore();
    });

    test('getEnvs() returns valid envs from cache', () => {
        const envs = collectionService.getEnvs();
        assertEnvsEqual(envs, getValidCachedEnvs());
    });

    test('getEnvs() uses query to filter envs before returning', () => {
        // Only query for environments which are not under any roots
        const envs = collectionService.getEnvs({ searchLocations: { roots: [] } });
        assertEnvsEqual(
            envs,
            getValidCachedEnvs().filter((e) => !e.searchLocation),
        );
    });

    test('If `ifNotTriggerredAlready` option is set and a refresh for query is already triggered, triggerRefresh() does not trigger a refresh', async () => {
        const onUpdated = new EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>();
        const locatedEnvs = getLocatorEnvs();
        let refreshTriggerCount = 0;
        const parentLocator = new SimpleLocator(locatedEnvs, {
            onUpdated: onUpdated.event,
            after: async () => {
                refreshTriggerCount += 1;
                locatedEnvs.forEach((env, index) => {
                    const update = cloneDeep(env);
                    update.name = updatedName;
                    onUpdated.fire({ index, update });
                });
                onUpdated.fire({ index: locatedEnvs.length - 1, update: undefined });
                // It turns out the last env is invalid, ensure it does not appear in the final result.
                onUpdated.fire({ stage: ProgressReportStage.discoveryFinished });
            },
        });
        const cache = await createCollectionCache({
            get: () => getCachedEnvs(),
            store: async (e) => {
                storage = e;
            },
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);

        await collectionService.triggerRefresh(undefined);
        await collectionService.triggerRefresh(undefined, { ifNotTriggerredAlready: true });
        expect(refreshTriggerCount).to.equal(1, 'Refresh should not be triggered in case 1');
        await collectionService.triggerRefresh({ searchLocations: { roots: [] } }, { ifNotTriggerredAlready: true });
        expect(refreshTriggerCount).to.equal(1, 'Refresh should not be triggered in case 2');
        await collectionService.triggerRefresh(undefined);
        expect(refreshTriggerCount).to.equal(2, 'Refresh should be triggered in case 3');
    });

    test('Ensure correct events are fired when collection changes on refresh', async () => {
        const onUpdated = new EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>();
        const locatedEnvs = getLocatorEnvs();
        const cachedEnvs = getCachedEnvs();
        const parentLocator = new SimpleLocator(locatedEnvs, {
            onUpdated: onUpdated.event,
            after: async () => {
                locatedEnvs.forEach((env, index) => {
                    const update = cloneDeep(env);
                    update.name = updatedName;
                    onUpdated.fire({ index, update });
                });
                onUpdated.fire({ index: locatedEnvs.length - 1, update: undefined });
                // It turns out the last env is invalid, ensure it does not appear in the final result.
                onUpdated.fire({ stage: ProgressReportStage.discoveryFinished });
            },
        });
        const cache = await createCollectionCache({
            get: () => cachedEnvs,
            store: async (e) => {
                storage = e;
            },
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);

        const events: PythonEnvCollectionChangedEvent[] = [];
        collectionService.onChanged((e) => {
            events.push(e);
        });

        await collectionService.triggerRefresh();

        let envs = cachedEnvs;
        // Ensure when all the events are applied to the original list in sequence, the final list is as expected.
        events.forEach((e) => {
            envs = applyChangeEventToEnvList(envs, e);
        });
        const expected = getExpectedEnvs();
        assertEnvsEqual(envs, expected);
    });

    test("Ensure update events are not fired if an environment isn't actually updated", async () => {
        const onUpdated = new EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>();
        const locatedEnvs = getLocatorEnvs();
        const cachedEnvs = getCachedEnvs();
        const parentLocator = new SimpleLocator(locatedEnvs, {
            onUpdated: onUpdated.event,
            after: async () => {
                locatedEnvs.forEach((env, index) => {
                    const update = cloneDeep(env);
                    update.name = updatedName;
                    onUpdated.fire({ index, update });
                });
                onUpdated.fire({ index: locatedEnvs.length - 1, update: undefined });
                // It turns out the last env is invalid, ensure it does not appear in the final result.
                onUpdated.fire({ stage: ProgressReportStage.discoveryFinished });
            },
        });
        const cache = await createCollectionCache({
            get: () => cachedEnvs,
            store: async (e) => {
                storage = e;
            },
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);

        let events: PythonEnvCollectionChangedEvent[] = [];
        collectionService.onChanged((e) => {
            events.push(e);
        });

        await collectionService.triggerRefresh();
        expect(events.length).to.not.equal(0, 'Atleast event should be fired');
        const envs = collectionService.getEnvs();

        // Trigger a refresh again.
        events = [];
        await collectionService.triggerRefresh();
        // Filter out the events which are related to envs in the cache, we expect no such events to be fired as no
        // envs were updated.
        events = events.filter((e) =>
            envs.some((env) => {
                const eventEnv = e.old ?? e.new;
                if (!eventEnv) {
                    return true;
                }
                return areSameEnv(eventEnv, env);
            }),
        );
        expect(events.length).to.equal(0, 'Do not fire additional events as envs have not updated');
    });

    test('triggerRefresh() refreshes the collection with any new envs & removes cached envs if not relevant', async () => {
        const onUpdated = new EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>();
        const locatedEnvs = getLocatorEnvs();
        const cachedEnvs = getCachedEnvs();
        const parentLocator = new SimpleLocator(locatedEnvs, {
            onUpdated: onUpdated.event,
            after: async () => {
                locatedEnvs.forEach((env, index) => {
                    const update = cloneDeep(env);
                    update.name = updatedName;
                    onUpdated.fire({ index, update });
                });
                onUpdated.fire({ index: locatedEnvs.length - 1, update: undefined });
                // It turns out the last env is invalid, ensure it does not appear in the final result.
                onUpdated.fire({ stage: ProgressReportStage.discoveryFinished });
            },
        });
        const cache = await createCollectionCache({
            get: () => cachedEnvs,
            store: async (e) => {
                storage = e;
            },
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);

        const events: PythonEnvCollectionChangedEvent[] = [];
        collectionService.onChanged((e) => {
            events.push(e);
        });

        await collectionService.triggerRefresh();

        let envs = cachedEnvs;
        // Ensure when all the events are applied to the original list in sequence, the final list is as expected.
        events.forEach((e) => {
            envs = applyChangeEventToEnvList(envs, e);
        });
        const expected = getExpectedEnvs();
        assertEnvsEqual(envs, expected);
        const queriedEnvs = collectionService.getEnvs();
        assertEnvsEqual(queriedEnvs, expected);
        assertEnvsEqual(storage, expected);
    });

    test('Ensure progress stage updates are emitted correctly and refresh promises correct track promise for each stage', async () => {
        // Arrange
        const onUpdated = new EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>();
        const locatedEnvs = getLocatorEnvs();
        const cachedEnvs = getCachedEnvs();
        const waitUntilEventVerified = createDeferred<void>();
        const waitForAllPathsDiscoveredEvent = createDeferred<void>();
        const parentLocator = new SimpleLocator(locatedEnvs, {
            before: async () => {
                onUpdated.fire({ stage: ProgressReportStage.discoveryStarted });
            },
            onUpdated: onUpdated.event,
            after: async () => {
                onUpdated.fire({ stage: ProgressReportStage.allPathsDiscovered });
                waitForAllPathsDiscoveredEvent.resolve();
                await waitUntilEventVerified.promise;
                locatedEnvs.forEach((env, index) => {
                    const update = cloneDeep(env);
                    update.name = updatedName;
                    onUpdated.fire({ index, update });
                });
                onUpdated.fire({ index: locatedEnvs.length - 1, update: undefined });
                // It turns out the last env is invalid, ensure it does not appear in the final result.
                onUpdated.fire({ stage: ProgressReportStage.discoveryFinished });
            },
        });
        const cache = await createCollectionCache({
            get: () => cachedEnvs,
            store: async (e) => {
                storage = e;
            },
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        let stage: ProgressReportStage | undefined;
        collectionService.onProgress((e) => {
            stage = e.stage;
        });

        // Act
        const discoveryPromise = collectionService.triggerRefresh();

        // Verify stages and refresh promises
        expect(stage).to.equal(ProgressReportStage.discoveryStarted, 'Discovery should already be started');
        let refreshPromise = collectionService.getRefreshPromise({
            stage: ProgressReportStage.discoveryStarted,
        });
        expect(refreshPromise).to.equal(undefined);
        refreshPromise = collectionService.getRefreshPromise({ stage: ProgressReportStage.allPathsDiscovered });
        expect(refreshPromise).to.not.equal(undefined);
        const allPathsDiscoveredPromise = createDeferredFromPromise(refreshPromise!);
        refreshPromise = collectionService.getRefreshPromise({ stage: ProgressReportStage.discoveryFinished });
        expect(refreshPromise).to.not.equal(undefined);
        const discoveryFinishedPromise = createDeferredFromPromise(refreshPromise!);

        expect(allPathsDiscoveredPromise.resolved).to.equal(false);
        await waitForAllPathsDiscoveredEvent.promise; // Wait for all paths to be discovered.
        expect(stage).to.equal(ProgressReportStage.allPathsDiscovered);
        expect(allPathsDiscoveredPromise.resolved).to.equal(true);
        waitUntilEventVerified.resolve();

        await discoveryPromise;
        expect(stage).to.equal(ProgressReportStage.discoveryFinished);
        expect(discoveryFinishedPromise.resolved).to.equal(
            true,
            'Any previous refresh promises should be resolved when refresh is over',
        );
        expect(collectionService.getRefreshPromise()).to.equal(
            undefined,
            'Should be undefined if no refresh is currently going on',
        );

        // Test stage when query is provided.
        collectionService.onProgress((e) => {
            if (e.stage === ProgressReportStage.allPathsDiscovered) {
                assert(false, 'All paths discovered event should not be fired if a query is provided');
            }
        });
        collectionService
            .triggerRefresh({ searchLocations: { roots: [], doNotIncludeNonRooted: true } })
            .ignoreErrors();
        refreshPromise = collectionService.getRefreshPromise({ stage: ProgressReportStage.allPathsDiscovered });
        expect(refreshPromise).to.equal(undefined, 'All paths discovered stage not applicable if a query is provided');
    });

    test('resolveEnv() uses cache if complete and up to date info is available', async () => {
        const resolvedViaLocator = buildEnvInfo({ executable: 'Resolved via locator' });
        const cachedEnvs = getCachedEnvs();
        const env = cachedEnvs[0];
        env.executable.ctime = 100;
        env.executable.mtime = 100;
        sinon.stub(externalDependencies, 'getFileInfo').resolves({ ctime: 100, mtime: 100 });
        const parentLocator = new SimpleLocator([], {
            resolve: async (e: any) => {
                if (env.executable.filename === e.executable.filename) {
                    return resolvedViaLocator;
                }
                return undefined;
            },
        });
        const cache = await createCollectionCache({
            get: () => cachedEnvs,
            store: async () => noop(),
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        const resolved = await collectionService.resolveEnv(env.executable.filename);
        assertEnvEqual(resolved, env);
    });

    test('resolveEnv() does not use cache if complete info is not available', async () => {
        const resolvedViaLocator = buildEnvInfo({ executable: 'Resolved via locator' });
        const deferred = createDeferred<void>();
        const waitDeferred = createDeferred<void>();
        const locatedEnvs = getLocatorEnvs();
        const env = locatedEnvs[0];
        env.executable.ctime = 100;
        env.executable.mtime = 100;
        sinon.stub(externalDependencies, 'getFileInfo').resolves({ ctime: 100, mtime: 100 });
        const parentLocator = new SimpleLocator(locatedEnvs, {
            after: async () => {
                waitDeferred.resolve();
                await deferred.promise;
            },
            resolve: async (e: any) => {
                if (env.executable.filename === e.executable.filename) {
                    return resolvedViaLocator;
                }
                return undefined;
            },
        });
        const cache = await createCollectionCache({
            get: () => [],
            store: async () => noop(),
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        collectionService.triggerRefresh().ignoreErrors();
        await waitDeferred.promise; // Cache should already contain `env` at this point, although it is not complete.
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        const resolved = await collectionService.resolveEnv(env.executable.filename);
        assertEnvEqual(resolved, resolvedViaLocator);
    });

    test('resolveEnv() uses underlying locator if cache does not have up to date info for env', async () => {
        const cachedEnvs = getCachedEnvs();
        const env = cachedEnvs[0];
        const resolvedViaLocator = buildEnvInfo({
            executable: env.executable.filename,
            sysPrefix: 'Resolved via locator',
        });
        env.executable.ctime = 101;
        env.executable.mtime = 90;
        sinon.stub(externalDependencies, 'getFileInfo').resolves({ ctime: 100, mtime: 100 });
        const parentLocator = new SimpleLocator([], {
            resolve: async (e: any) => {
                if (env.executable.filename === e.executable.filename) {
                    return resolvedViaLocator;
                }
                return undefined;
            },
        });
        const cache = await createCollectionCache({
            get: () => cachedEnvs,
            store: async () => noop(),
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        const resolved = await collectionService.resolveEnv(env.executable.filename);
        assertEnvEqual(resolved, resolvedViaLocator);
    });

    test('resolveEnv() adds env to cache after resolving using downstream locator', async () => {
        const resolvedViaLocator = buildEnvInfo({ executable: 'Resolved via locator' });
        const parentLocator = new SimpleLocator([], {
            resolve: async (e: any) => {
                if (resolvedViaLocator.executable.filename === e.executable.filename) {
                    return resolvedViaLocator;
                }
                return undefined;
            },
        });
        const cache = await createCollectionCache({
            get: () => [],
            store: async () => noop(),
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        const resolved = await collectionService.resolveEnv(resolvedViaLocator.executable.filename);
        const envs = collectionService.getEnvs();
        assertEnvsEqual(envs, [resolved]);
    });

    test('resolveEnv() uses underlying locator once conda envs without python get a python installed', async () => {
        const cachedEnvs = [condaEnvWithoutPython];
        const parentLocator = new SimpleLocator(
            [],
            {
                resolve: async (e) => {
                    if (condaEnvWithoutPython.location === (e as string)) {
                        return condaEnvWithPython;
                    }
                    return undefined;
                },
            },
            { resolveAsString: true },
        );
        const cache = await createCollectionCache({
            get: () => cachedEnvs,
            store: async () => noop(),
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        let resolved = await collectionService.resolveEnv(condaEnvWithoutPython.location);
        assertEnvEqual(resolved, condaEnvWithoutPython); // Ensure cache is used to resolve such envs.

        condaEnvWithPython.executable.ctime = 100;
        condaEnvWithPython.executable.mtime = 100;
        sinon.stub(externalDependencies, 'getFileInfo').resolves({ ctime: 100, mtime: 100 });

        const events: PythonEnvCollectionChangedEvent[] = [];
        collectionService.onChanged((e) => {
            events.push(e);
        });

        await createFile(condaEnvWithPython.executable.filename); // Install Python into the env

        resolved = await collectionService.resolveEnv(condaEnvWithoutPython.location);
        assertEnvEqual(resolved, condaEnvWithPython); // Ensure it resolves latest info.

        // Verify conda env without python in cache is replaced with updated info.
        const envs = collectionService.getEnvs();
        assertEnvsEqual(envs, [condaEnvWithPython]);

        expect(events.length).to.equal(1, 'Update event should be fired');
    });

    test('Ensure events from downstream locators do not trigger new refreshes if a refresh is already scheduled', async () => {
        const refreshDeferred = createDeferred();
        let refreshCount = 0;
        const parentLocator = new SimpleLocator([], {
            after: () => {
                refreshCount += 1;
                return refreshDeferred.promise;
            },
        });
        const cache = await createCollectionCache({
            get: () => [],
            store: async () => noop(),
        });
        collectionService = new EnvsCollectionService(cache, parentLocator, false);
        const events: PythonEnvCollectionChangedEvent[] = [];
        collectionService.onChanged((e) => {
            events.push(e);
        });

        const downstreamEvents = [
            { type: FileChangeType.Created, searchLocation: Uri.file('folder1s') },
            { type: FileChangeType.Changed },
            { type: FileChangeType.Deleted, kind: PythonEnvKind.Venv },
            { type: FileChangeType.Deleted, kind: PythonEnvKind.VirtualEnv },
        ]; // Total of 4 events
        await Promise.all(
            downstreamEvents.map(async (event) => {
                parentLocator.fire(event);
                await sleep(1); // Wait for refreshes to be initialized via change events
            }),
        );

        refreshDeferred.resolve();
        await sleep(1);

        await collectionService.getRefreshPromise(); // Wait for refresh to finish

        /**
         * We expect 2 refreshes to be triggered in total, explanation:
         * * First event triggers a refresh.
         * * Second event schedules a refresh to happen once the first refresh is finished.
         * * Third event is received. A fresh refresh is already scheduled to take place so no need to schedule another one.
         * * Same with the fourth event.
         */
        expect(refreshCount).to.equal(2);
        expect(events.length).to.equal(downstreamEvents.length, 'All 4 events should also be fired by the collection');
        assert.deepStrictEqual(
            events.sort((a, b) => (a.type && b.type ? a.type?.localeCompare(b.type) : 0)),
            downstreamEvents.sort((a, b) => (a.type && b.type ? a.type?.localeCompare(b.type) : 0)),
        );
    });
});
