// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as path from 'path';
import { Uri } from 'vscode';
import * as fs from '../../../../../client/common/platform/fs-paths';
import { FileChangeType } from '../../../../../client/common/platform/fileSystemWatcher';
import { createDeferred, Deferred, sleep } from '../../../../../client/common/utils/async';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { PythonEnvsChangedEvent } from '../../../../../client/pythonEnvironments/base/watcher';
import * as externalDeps from '../../../../../client/pythonEnvironments/common/externalDependencies';
import { MicrosoftStoreLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/microsoftStoreLocator';
import { TEST_TIMEOUT } from '../../../../constants';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { traceWarn } from '../../../../../client/logging';

class MicrosoftStoreEnvs {
    private executables: string[] = [];

    private dirs: string[] = [];

    constructor(private readonly storeAppRoot: string) {}

    public async create(version: string): Promise<string> {
        const dirName = path.join(this.storeAppRoot, `PythonSoftwareFoundation.Python.${version}_qbz5n2kfra8p0`);
        const filename = path.join(this.storeAppRoot, `python${version}.exe`);
        try {
            await fs.createFile(filename);
        } catch (err) {
            throw new Error(`Failed to create Windows Apps executable ${filename}, Error: ${err}`);
        }
        try {
            await fs.mkdir(dirName);
        } catch (err) {
            throw new Error(`Failed to create Windows Apps directory ${dirName}, Error: ${err}`);
        }
        this.executables.push(filename);
        this.dirs.push(dirName);
        return filename;
    }

    public async update(version: string): Promise<void> {
        // On update microsoft store removes the directory and re-adds it.
        const dirName = path.join(this.storeAppRoot, `PythonSoftwareFoundation.Python.${version}_qbz5n2kfra8p0`);
        try {
            await fs.rmdir(dirName);
            await fs.mkdir(dirName);
        } catch (err) {
            throw new Error(`Failed to update Windows Apps directory ${dirName}, Error: ${err}`);
        }
    }

    public async cleanUp() {
        await Promise.all(
            this.executables.map(async (filename: string) => {
                try {
                    await fs.remove(filename);
                } catch (err) {
                    traceWarn(`Failed to clean up ${filename}`);
                }
            }),
        );
        await Promise.all(
            this.dirs.map(async (dir: string) => {
                try {
                    await fs.rmdir(dir);
                } catch (err) {
                    traceWarn(`Failed to clean up ${dir}`);
                }
            }),
        );
    }
}

suite('Microsoft Store Locator', async () => {
    const testLocalAppData = path.join(TEST_LAYOUT_ROOT, 'storeApps');
    const testStoreAppRoot = path.join(testLocalAppData, 'Microsoft', 'WindowsApps');
    const windowsStoreEnvs = new MicrosoftStoreEnvs(testStoreAppRoot);
    let locator: MicrosoftStoreLocator;

    const localAppDataOldValue = process.env.LOCALAPPDATA;

    async function waitForChangeToBeDetected(deferred: Deferred<void>) {
        const timeout = setTimeout(() => {
            clearTimeout(timeout);
            deferred.reject(new Error('Environment not detected'));
        }, TEST_TIMEOUT);
        await deferred.promise;
    }

    async function isLocated(executable: string): Promise<boolean> {
        const items = await getEnvs(locator.iterEnvs());
        return items.some((item) => externalDeps.arePathsSame(item.executablePath, executable));
    }

    suiteSetup(async function () {
        // Enable once this is done: https://github.com/microsoft/vscode-python/issues/17797
        return this.skip();
        process.env.LOCALAPPDATA = testLocalAppData;
        await windowsStoreEnvs.cleanUp();
    });

    async function setupLocator(onChanged: (e: PythonEnvsChangedEvent) => Promise<void>) {
        locator = new MicrosoftStoreLocator();
        await getEnvs(locator.iterEnvs()); // Force the watchers to start.
        // Wait for watchers to get ready
        await sleep(1000);
        locator.onChanged(onChanged);
    }

    teardown(async () => {
        await windowsStoreEnvs.cleanUp();
        await locator.dispose();
    });
    suiteTeardown(async () => {
        process.env.LOCALAPPDATA = localAppDataOldValue;
    });

    test('Detect a new environment', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        const expectedEvent = {
            kind: PythonEnvKind.MicrosoftStore,
            type: FileChangeType.Created,
            searchLocation: Uri.file(testStoreAppRoot),
        };
        await setupLocator(async (e) => {
            actualEvent = e;
            deferred.resolve();
        });

        const executable = await windowsStoreEnvs.create('3.4');
        await waitForChangeToBeDetected(deferred);
        const isFound = await isLocated(executable);

        assert.ok(isFound);
        assert.deepEqual(actualEvent!, expectedEvent, 'Wrong event emitted');
    });

    test('Detect when an environment has been deleted', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        const expectedEvent = {
            kind: PythonEnvKind.MicrosoftStore,
            type: FileChangeType.Deleted,
            searchLocation: Uri.file(testStoreAppRoot),
        };
        const executable = await windowsStoreEnvs.create('3.4');
        // Wait before the change event has been sent. If both operations occur almost simultaneously no event is sent.
        await sleep(100);
        await setupLocator(async (e) => {
            actualEvent = e;
            deferred.resolve();
        });

        await windowsStoreEnvs.cleanUp();
        await waitForChangeToBeDetected(deferred);
        const isFound = await isLocated(executable);

        assert.notOk(isFound);
        assert.deepEqual(actualEvent!, expectedEvent, 'Wrong event emitted');
    });

    test('Detect when an environment has been updated', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        const expectedEvent = {
            kind: PythonEnvKind.MicrosoftStore,
            type: FileChangeType.Changed,
            searchLocation: Uri.file(testStoreAppRoot),
        };
        const executable = await windowsStoreEnvs.create('3.4');
        // Wait before the change event has been sent. If both operations occur almost simultaneously no event is sent.
        await sleep(100);
        await setupLocator(async (e) => {
            actualEvent = e;
            deferred.resolve();
        });

        await windowsStoreEnvs.update('3.4');
        await waitForChangeToBeDetected(deferred);
        const isFound = await isLocated(executable);

        assert.ok(isFound);
        assert.deepEqual(actualEvent!, expectedEvent, 'Wrong event emitted');
    });
});
