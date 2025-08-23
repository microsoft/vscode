// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as fsWatcher from '../../../../../client/common/platform/fileSystemWatcher';
import { ExecutionResult } from '../../../../../client/common/process/types';
import * as platformApis from '../../../../../client/common/utils/platform';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { BasicEnvInfo } from '../../../../../client/pythonEnvironments/base/locator';
import * as externalDep from '../../../../../client/pythonEnvironments/common/externalDependencies';
import {
    getMicrosoftStorePythonExes,
    MicrosoftStoreLocator,
} from '../../../../../client/pythonEnvironments/base/locators/lowLevel/microsoftStoreLocator';
import { getEnvs } from '../../common';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';

suite('Microsoft Store', () => {
    suite('Utils', () => {
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
            const expected = [
                path.join(testStoreAppRoot, 'python3.7.exe'),
                path.join(testStoreAppRoot, 'python3.8.exe'),
            ];

            const actual = await getMicrosoftStorePythonExes();
            assert.deepEqual(actual, expected);
        });
    });

    suite('Locator', () => {
        let stubShellExec: sinon.SinonStub;
        let getEnvVar: sinon.SinonStub;
        let locator: MicrosoftStoreLocator;
        let watchLocationForPatternStub: sinon.SinonStub;

        const testLocalAppData = path.join(TEST_LAYOUT_ROOT, 'storeApps');
        const testStoreAppRoot = path.join(testLocalAppData, 'Microsoft', 'WindowsApps');
        const pathToData = new Map<
            string,
            {
                versionInfo: (string | number)[];
                sysPrefix: string;
                sysVersion: string;
                is64Bit: boolean;
            }
        >();

        const python383data = {
            versionInfo: [3, 8, 3, 'final', 0],
            sysPrefix: 'path',
            sysVersion: '3.8.3 (tags/v3.8.3:6f8c832, May 13 2020, 22:37:02) [MSC v.1924 64 bit (AMD64)]',
            is64Bit: true,
        };

        const python379data = {
            versionInfo: [3, 7, 9, 'final', 0],
            sysPrefix: 'path',
            sysVersion: '3.7.9 (tags/v3.7.9:13c94747c7, Aug 17 2020, 16:30:00) [MSC v.1900 64 bit (AMD64)]',
            is64Bit: true,
        };

        pathToData.set(path.join(testStoreAppRoot, 'python3.8.exe'), python383data);
        pathToData.set(path.join(testStoreAppRoot, 'python3.7.exe'), python379data);

        function createExpectedInfo(executable: string): BasicEnvInfo {
            return {
                executablePath: executable,
                kind: PythonEnvKind.MicrosoftStore,
            };
        }

        setup(async () => {
            stubShellExec = sinon.stub(externalDep, 'shellExecute');
            stubShellExec.callsFake((command: string) => {
                if (command.indexOf('notpython.exe') > 0) {
                    return Promise.resolve<ExecutionResult<string>>({ stdout: '' });
                }
                if (command.indexOf('python3.7.exe') > 0) {
                    return Promise.resolve<ExecutionResult<string>>({ stdout: JSON.stringify(python379data) });
                }
                return Promise.resolve<ExecutionResult<string>>({ stdout: JSON.stringify(python383data) });
            });

            getEnvVar = sinon.stub(platformApis, 'getEnvironmentVariable');
            getEnvVar.withArgs('LOCALAPPDATA').returns(testLocalAppData);

            watchLocationForPatternStub = sinon.stub(fsWatcher, 'watchLocationForPattern');
            watchLocationForPatternStub.returns({
                dispose: () => {
                    /* do nothing */
                },
            });

            locator = new MicrosoftStoreLocator();
        });

        teardown(async () => {
            await locator.dispose();
            sinon.restore();
        });

        test('iterEnvs()', async () => {
            const expectedEnvs = [
                createExpectedInfo(path.join(testStoreAppRoot, 'python3.7.exe')),
                createExpectedInfo(path.join(testStoreAppRoot, 'python3.8.exe')),
            ];

            const iterator = locator.iterEnvs();
            const actualEnvs = (await getEnvs(iterator)).sort((a, b) =>
                a.executablePath.localeCompare(b.executablePath),
            );

            assertBasicEnvsEqual(actualEnvs, expectedEnvs);
        });
    });
});
