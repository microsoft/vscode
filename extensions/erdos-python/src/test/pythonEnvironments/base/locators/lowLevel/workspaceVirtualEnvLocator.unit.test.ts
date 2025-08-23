// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import * as fsWatcher from '../../../../../client/common/platform/fileSystemWatcher';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { WorkspaceVirtualEnvironmentLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/workspaceVirtualEnvLocator';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';
import { createBasicEnv } from '../../common';

suite('WorkspaceVirtualEnvironment Locator', () => {
    const testWorkspaceFolder = path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1');
    let getOSTypeStub: sinon.SinonStub;
    let watchLocationForPatternStub: sinon.SinonStub;
    let locator: WorkspaceVirtualEnvironmentLocator;

    setup(() => {
        getOSTypeStub = sinon.stub(platformUtils, 'getOSType');
        getOSTypeStub.returns(platformUtils.OSType.Linux);
        watchLocationForPatternStub = sinon.stub(fsWatcher, 'watchLocationForPattern');
        watchLocationForPatternStub.returns({
            dispose: () => {
                /* do nothing */
            },
        });
        locator = new WorkspaceVirtualEnvironmentLocator(testWorkspaceFolder);
    });
    teardown(async () => {
        await locator.dispose();
        sinon.restore();
    });

    test('iterEnvs(): Windows', async () => {
        getOSTypeStub.returns(platformUtils.OSType.Windows);
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Venv, path.join(testWorkspaceFolder, 'win1', 'python.exe')),
            createBasicEnv(
                PythonEnvKind.Venv,
                path.join(testWorkspaceFolder, '.direnv', 'win2', 'Scripts', 'python.exe'),
            ),
            createBasicEnv(PythonEnvKind.Pipenv, path.join(testWorkspaceFolder, '.venv', 'Scripts', 'python.exe')),
        ];

        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): Non-Windows', async () => {
        getOSTypeStub.returns(platformUtils.OSType.Linux);
        const expectedEnvs = [
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testWorkspaceFolder, '.direnv', 'posix1virtualenv', 'bin', 'python'),
            ),
            createBasicEnv(PythonEnvKind.Unknown, path.join(testWorkspaceFolder, 'posix2conda', 'python')),
            createBasicEnv(PythonEnvKind.Unknown, path.join(testWorkspaceFolder, 'posix3custom', 'bin', 'python')),
        ];

        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });
});
