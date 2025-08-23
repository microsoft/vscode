/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { assert } from 'chai';
import * as sinon from 'sinon';
import * as fs from '../../../../../client/common/platform/fs-paths';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { CondaEnvironmentLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/condaLocator';
import { sleep } from '../../../../core';
import { createDeferred, Deferred } from '../../../../../client/common/utils/async';
import { PythonEnvsChangedEvent } from '../../../../../client/pythonEnvironments/base/watcher';
import { EXTENSION_ROOT_DIR_FOR_TESTS, TEST_TIMEOUT } from '../../../../constants';
import { traceWarn } from '../../../../../client/logging';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { PYTHON_VIRTUAL_ENVS_LOCATION } from '../../../../ciConstants';
import { isCI } from '../../../../../client/common/constants';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';

class CondaEnvs {
    private readonly condaEnvironmentsTxt;

    constructor() {
        const home = platformUtils.getUserHomeDir();
        if (!home) {
            throw new Error('Home directory not found');
        }
        this.condaEnvironmentsTxt = path.join(home, '.conda', 'environments.txt');
    }

    public async create(): Promise<void> {
        try {
            await fs.createFile(this.condaEnvironmentsTxt);
        } catch (err) {
            throw new Error(`Failed to create environments.txt ${this.condaEnvironmentsTxt}, Error: ${err}`);
        }
    }

    public async update(): Promise<void> {
        try {
            await fs.writeFile(this.condaEnvironmentsTxt, 'path/to/environment');
        } catch (err) {
            throw new Error(`Failed to update environments file ${this.condaEnvironmentsTxt}, Error: ${err}`);
        }
    }

    public async cleanUp() {
        try {
            await fs.remove(this.condaEnvironmentsTxt);
        } catch (err) {
            traceWarn(`Failed to clean up ${this.condaEnvironmentsTxt}`);
        }
    }
}

suite('Conda Env Locator', async () => {
    let locator: CondaEnvironmentLocator;
    let condaEnvsTxt: CondaEnvs;
    const envsLocation =
        PYTHON_VIRTUAL_ENVS_LOCATION !== undefined
            ? path.join(EXTENSION_ROOT_DIR_FOR_TESTS, PYTHON_VIRTUAL_ENVS_LOCATION)
            : path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'tmp', 'envPaths.json');

    async function waitForChangeToBeDetected(deferred: Deferred<void>) {
        const timeout = setTimeout(() => {
            clearTimeout(timeout);
            deferred.reject(new Error('Environment not detected'));
        }, TEST_TIMEOUT);
        await deferred.promise;
    }
    let envPaths: any;

    suiteSetup(async () => {
        if (isCI) {
            envPaths = await fs.readJson(envsLocation);
        }
    });

    setup(async () => {
        sinon.stub(platformUtils, 'getUserHomeDir').returns(TEST_LAYOUT_ROOT);
        condaEnvsTxt = new CondaEnvs();
        await condaEnvsTxt.cleanUp();
        if (isCI) {
            sinon.stub(externalDependencies, 'getPythonSetting').returns(envPaths.condaExecPath);
        }
    });

    async function setupLocator(onChanged: (e: PythonEnvsChangedEvent) => Promise<void>) {
        locator = new CondaEnvironmentLocator();
        // Wait for watchers to get ready
        await sleep(1000);
        locator.onChanged(onChanged);
    }

    teardown(async () => {
        await condaEnvsTxt.cleanUp();
        await locator.dispose();
        sinon.restore();
    });

    test('Fires when conda `environments.txt` file is created', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        const expectedEvent = { providerId: 'conda-envs' };
        await setupLocator(async (e) => {
            deferred.resolve();
            actualEvent = e;
        });

        await condaEnvsTxt.create();
        await waitForChangeToBeDetected(deferred);

        assert.deepEqual(actualEvent!, expectedEvent, 'Unexpected event emitted');
    });

    test('Fires when conda `environments.txt` file is updated', async () => {
        let actualEvent: PythonEnvsChangedEvent;
        const deferred = createDeferred<void>();
        const expectedEvent = { providerId: 'conda-envs' };
        await condaEnvsTxt.create();
        await setupLocator(async (e) => {
            deferred.resolve();
            actualEvent = e;
        });

        await condaEnvsTxt.update();
        await waitForChangeToBeDetected(deferred);

        assert.deepEqual(actualEvent!, expectedEvent, 'Unexpected event emitted');
    });
});
