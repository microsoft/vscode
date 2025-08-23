// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import * as path from 'path';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { HatchLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/hatchLocator';
import { assertBasicEnvsEqual } from '../envTestUtils';
import { createBasicEnv } from '../../common';
import { makeExecHandler, projectDirs, venvDirs } from '../../../common/environmentManagers/hatch.unit.test';

suite('Hatch Locator', () => {
    let exec: sinon.SinonStub;
    let getPythonSetting: sinon.SinonStub;
    let getOSType: sinon.SinonStub;
    let locator: HatchLocator;

    suiteSetup(() => {
        getPythonSetting = sinon.stub(externalDependencies, 'getPythonSetting');
        getPythonSetting.returns('hatch');
        getOSType = sinon.stub(platformUtils, 'getOSType');
        exec = sinon.stub(externalDependencies, 'exec');
    });

    suiteTeardown(() => sinon.restore());

    suite('iterEnvs()', () => {
        setup(() => {
            getOSType.returns(platformUtils.OSType.Linux);
        });

        interface TestArgs {
            osType?: platformUtils.OSType;
            pythonBin?: string;
        }

        const testProj1 = async ({ osType, pythonBin = 'bin/python' }: TestArgs = {}) => {
            if (osType) {
                getOSType.returns(osType);
            }

            locator = new HatchLocator(projectDirs.project1);
            exec.callsFake(makeExecHandler(venvDirs.project1, { path: true, cwd: projectDirs.project1 }));

            const iterator = locator.iterEnvs();
            const actualEnvs = await getEnvs(iterator);

            const expectedEnvs = [createBasicEnv(PythonEnvKind.Hatch, path.join(venvDirs.project1.default, pythonBin))];
            assertBasicEnvsEqual(actualEnvs, expectedEnvs);
        };

        test('project with only the default env', () => testProj1());
        test('project with only the default env on Windows', () =>
            testProj1({
                osType: platformUtils.OSType.Windows,
                pythonBin: 'Scripts/python.exe',
            }));

        test('project with multiple defined envs', async () => {
            locator = new HatchLocator(projectDirs.project2);
            exec.callsFake(makeExecHandler(venvDirs.project2, { path: true, cwd: projectDirs.project2 }));

            const iterator = locator.iterEnvs();
            const actualEnvs = await getEnvs(iterator);

            const expectedEnvs = [
                createBasicEnv(PythonEnvKind.Hatch, path.join(venvDirs.project2.default, 'bin/python')),
                createBasicEnv(PythonEnvKind.Hatch, path.join(venvDirs.project2.test, 'bin/python')),
            ];
            assertBasicEnvsEqual(actualEnvs, expectedEnvs);
        });
    });
});
