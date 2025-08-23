// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import * as fsapi from '../../../../../client/common/platform/fs-paths';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { ActiveStateLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/activeStateLocator';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';
import { ExecutionResult } from '../../../../../client/common/process/types';
import { createBasicEnv } from '../../common';
import * as platform from '../../../../../client/common/utils/platform';
import { ActiveState } from '../../../../../client/pythonEnvironments/common/environmentManagers/activestate';
import { replaceAll } from '../../../../../client/common/stringUtils';

suite('ActiveState Locator', () => {
    const testActiveStateDir = path.join(TEST_LAYOUT_ROOT, 'activestate');
    let locator: ActiveStateLocator;

    setup(() => {
        locator = new ActiveStateLocator();

        let homeDir: string;
        switch (platform.getOSType()) {
            case platform.OSType.Windows:
                homeDir = 'C:\\Users\\user';
                break;
            case platform.OSType.OSX:
                homeDir = '/Users/user';
                break;
            default:
                homeDir = '/home/user';
        }
        sinon.stub(platform, 'getUserHomeDir').returns(homeDir);

        const stateToolDir = ActiveState.getStateToolDir();
        if (stateToolDir) {
            sinon.stub(fsapi, 'pathExists').callsFake((dir: string) => Promise.resolve(dir === stateToolDir));
        }

        sinon.stub(externalDependencies, 'getPythonSetting').returns(undefined);

        sinon.stub(externalDependencies, 'shellExecute').callsFake((command: string) => {
            if (command === 'state projects -o editor') {
                return Promise.resolve<ExecutionResult<string>>({
                    stdout: `[{"name":"test","organization":"test-org","local_checkouts":["does-not-matter"],"executables":["${replaceAll(
                        path.join(testActiveStateDir, 'c09080d1', 'exec'),
                        '\\',
                        '\\\\',
                    )}"]},{"name":"test2","organization":"test-org","local_checkouts":["does-not-matter2"],"executables":["${replaceAll(
                        path.join(testActiveStateDir, '2af6390a', 'exec'),
                        '\\',
                        '\\\\',
                    )}"]}]\n\0`,
                });
            }
            return Promise.reject(new Error('Command failed'));
        });
    });

    teardown(() => sinon.restore());

    test('iterEnvs()', async () => {
        const actualEnvs = await getEnvs(locator.iterEnvs());
        const expectedEnvs = [
            createBasicEnv(
                PythonEnvKind.ActiveState,
                path.join(
                    testActiveStateDir,
                    'c09080d1',
                    'exec',
                    platform.getOSType() === platform.OSType.Windows ? 'python3.exe' : 'python3',
                ),
            ),
        ];
        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });
});
