// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as platformApis from '../../../../client/common/utils/platform';
import { getMicrosoftStorePythonExes } from '../../../../client/pythonEnvironments/base/locators/lowLevel/microsoftStoreLocator';
import { isMicrosoftStoreDir } from '../../../../client/pythonEnvironments/common/environmentManagers/microsoftStoreEnv';
import { TEST_LAYOUT_ROOT } from '../commonTestConstants';

suite('Microsoft Store Env', () => {
    let getEnvVarStub: sinon.SinonStub;
    const testLocalAppData = path.join(TEST_LAYOUT_ROOT, 'storeApps');
    const testStoreAppRoot = path.join(testLocalAppData, 'Microsoft', 'WindowsApps');

    setup(() => {
        getEnvVarStub = sinon.stub(platformApis, 'getEnvironmentVariable');
        getEnvVarStub.withArgs('LOCALAPPDATA').returns(testLocalAppData);
    });

    teardown(() => {
        getEnvVarStub.restore();
    });

    test('Store Python Interpreters', async () => {
        const expected = [path.join(testStoreAppRoot, 'python3.7.exe'), path.join(testStoreAppRoot, 'python3.8.exe')];

        const actual = await getMicrosoftStorePythonExes();
        assert.deepEqual(actual, expected);
    });

    test('isMicrosoftStoreDir: valid case', () => {
        assert.deepStrictEqual(isMicrosoftStoreDir(testStoreAppRoot), true);
        assert.deepStrictEqual(isMicrosoftStoreDir(testStoreAppRoot + path.sep), true);
    });

    test('isMicrosoftStoreDir: invalid case', () => {
        assert.deepStrictEqual(isMicrosoftStoreDir(__dirname), false);
    });
});
