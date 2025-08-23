// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { PyenvLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/pyenvLocator';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { testLocatorWatcher } from './watcherTestUtils';

suite('Pyenv Locator', async () => {
    const testPyenvRoot = path.join(TEST_LAYOUT_ROOT, 'pyenvhome', '.pyenv');
    const testPyenvVersionsDir = path.join(testPyenvRoot, 'versions');
    let pyenvRootOldValue: string | undefined;
    suiteSetup(async function () {
        // https://github.com/microsoft/vscode-python/issues/17798
        return this.skip();
        pyenvRootOldValue = process.env.PYENV_ROOT;
        process.env.PYENV_ROOT = testPyenvRoot;
    });
    testLocatorWatcher(testPyenvVersionsDir, async () => new PyenvLocator(), { kind: PythonEnvKind.Pyenv });
    suiteTeardown(() => {
        process.env.PYENV_ROOT = pyenvRootOldValue;
    });
});
