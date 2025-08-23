// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import { PythonEnvKind, PythonEnvSource } from '../../../../../client/pythonEnvironments/base/info';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { PoetryLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/poetryLocator';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';
import { ExecutionResult, ShellOptions } from '../../../../../client/common/process/types';
import { createBasicEnv as createBasicEnvCommon } from '../../common';
import { BasicEnvInfo } from '../../../../../client/pythonEnvironments/base/locator';

suite('Poetry Locator', () => {
    let shellExecute: sinon.SinonStub;
    let getPythonSetting: sinon.SinonStub;
    let getOSTypeStub: sinon.SinonStub;
    const testPoetryDir = path.join(TEST_LAYOUT_ROOT, 'poetry');
    let locator: PoetryLocator;

    suiteSetup(() => {
        getPythonSetting = sinon.stub(externalDependencies, 'getPythonSetting');
        getPythonSetting.returns('poetry');
        getOSTypeStub = sinon.stub(platformUtils, 'getOSType');
        shellExecute = sinon.stub(externalDependencies, 'shellExecute');
    });

    suiteTeardown(() => sinon.restore());

    suite('Windows', () => {
        const project1 = path.join(testPoetryDir, 'project1');

        function createBasicEnv(
            kind: PythonEnvKind,
            executablePath: string,
            source?: PythonEnvSource[],
            envPath?: string,
        ): BasicEnvInfo {
            const basicEnv = createBasicEnvCommon(kind, executablePath, source, envPath);
            basicEnv.searchLocation = Uri.file(project1);
            return basicEnv;
        }
        setup(() => {
            locator = new PoetryLocator(project1);
            getOSTypeStub.returns(platformUtils.OSType.Windows);
            shellExecute.callsFake((command: string, options: ShellOptions) => {
                if (command === 'poetry env list --full-path') {
                    const cwd = typeof options.cwd === 'string' ? options.cwd : options.cwd?.toString();
                    if (cwd && externalDependencies.arePathsSame(cwd, project1)) {
                        return Promise.resolve<ExecutionResult<string>>({
                            stdout: `${path.join(testPoetryDir, 'poetry-tutorial-project-6hnqYwvD-py3.8')} \n
                            ${path.join(testPoetryDir, 'globalwinproject-9hvDnqYw-py3.11')} (Activated)\r\n
                            ${path.join(testPoetryDir, 'someRandomPathWhichDoesNotExist')} `,
                        });
                    }
                }
                return Promise.reject(new Error('Command failed'));
            });
        });

        test('iterEnvs()', async () => {
            // Act
            const iterator = locator.iterEnvs();
            const actualEnvs = await getEnvs(iterator);

            // Assert
            const expectedEnvs = [
                createBasicEnv(
                    PythonEnvKind.Poetry,
                    path.join(testPoetryDir, 'poetry-tutorial-project-6hnqYwvD-py3.8', 'Scripts', 'python.exe'),
                ),
                createBasicEnv(
                    PythonEnvKind.Poetry,
                    path.join(testPoetryDir, 'globalwinproject-9hvDnqYw-py3.11', 'Scripts', 'python.exe'),
                ),
                createBasicEnv(PythonEnvKind.Poetry, path.join(project1, '.venv', 'Scripts', 'python.exe')),
            ];
            assertBasicEnvsEqual(actualEnvs, expectedEnvs);
        });
    });

    suite('Non-Windows', () => {
        const project2 = path.join(testPoetryDir, 'project2');

        function createBasicEnv(
            kind: PythonEnvKind,
            executablePath: string,
            source?: PythonEnvSource[],
            envPath?: string,
        ): BasicEnvInfo {
            const basicEnv = createBasicEnvCommon(kind, executablePath, source, envPath);
            basicEnv.searchLocation = Uri.file(project2);
            return basicEnv;
        }
        setup(() => {
            locator = new PoetryLocator(project2);
            getOSTypeStub.returns(platformUtils.OSType.Linux);
            shellExecute.callsFake((command: string, options: ShellOptions) => {
                if (command === 'poetry env list --full-path') {
                    const cwd = typeof options.cwd === 'string' ? options.cwd : options.cwd?.toString();
                    if (cwd && externalDependencies.arePathsSame(cwd, project2)) {
                        return Promise.resolve<ExecutionResult<string>>({
                            stdout: `${path.join(testPoetryDir, 'posix1project-9hvDnqYw-py3.4')} (Activated)\n
                        ${path.join(testPoetryDir, 'posix2project-6hnqYwvD-py3.7')}`,
                        });
                    }
                }
                return Promise.reject(new Error('Command failed'));
            });
        });

        test('iterEnvs()', async () => {
            // Act
            const iterator = locator.iterEnvs();
            const actualEnvs = await getEnvs(iterator);

            // Assert
            const expectedEnvs = [
                createBasicEnv(
                    PythonEnvKind.Poetry,
                    path.join(testPoetryDir, 'posix1project-9hvDnqYw-py3.4', 'python'),
                ),
                createBasicEnv(
                    PythonEnvKind.Poetry,
                    path.join(testPoetryDir, 'posix2project-6hnqYwvD-py3.7', 'bin', 'python'),
                ),
                createBasicEnv(PythonEnvKind.Poetry, path.join(project2, '.venv', 'bin', 'python')),
            ];
            assertBasicEnvsEqual(actualEnvs, expectedEnvs);
        });
    });
});
