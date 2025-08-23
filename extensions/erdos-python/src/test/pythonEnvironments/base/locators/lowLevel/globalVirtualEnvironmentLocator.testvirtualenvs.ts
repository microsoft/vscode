// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { GlobalVirtualEnvironmentLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/globalVirtualEnvronmentLocator';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { testLocatorWatcher } from './watcherTestUtils';

suite('GlobalVirtualEnvironment Locator', async () => {
    const testVirtualHomeDir = path.join(TEST_LAYOUT_ROOT, 'virtualhome');
    const testWorkOnHomePath = path.join(testVirtualHomeDir, 'workonhome');
    let workonHomeOldValue: string | undefined;
    suiteSetup(async function () {
        // https://github.com/microsoft/vscode-python/issues/17798
        return this.skip();
        workonHomeOldValue = process.env.WORKON_HOME;
        process.env.WORKON_HOME = testWorkOnHomePath;
    });
    testLocatorWatcher(testWorkOnHomePath, async () => new GlobalVirtualEnvironmentLocator());
    suiteTeardown(() => {
        process.env.WORKON_HOME = workonHomeOldValue;
    });
});
