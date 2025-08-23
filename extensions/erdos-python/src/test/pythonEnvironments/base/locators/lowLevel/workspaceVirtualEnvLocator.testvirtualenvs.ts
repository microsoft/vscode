// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { WorkspaceVirtualEnvironmentLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/workspaceVirtualEnvLocator';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { testLocatorWatcher } from './watcherTestUtils';

suite('WorkspaceVirtualEnvironment Locator', async () => {
    const testWorkspaceFolder = path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1');
    testLocatorWatcher(testWorkspaceFolder, async (root?: string) => new WorkspaceVirtualEnvironmentLocator(root!), {
        arg: testWorkspaceFolder,
        kind: PythonEnvKind.Venv,
    });
});
