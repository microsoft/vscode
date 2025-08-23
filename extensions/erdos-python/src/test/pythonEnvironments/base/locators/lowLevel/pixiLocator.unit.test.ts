// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import * as path from 'path';
import { PixiLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/pixiLocator';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { makeExecHandler, projectDirs } from '../../../common/environmentManagers/pixi.unit.test';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { createBasicEnv } from '../../common';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { assertBasicEnvsEqual } from '../envTestUtils';

suite('Pixi Locator', () => {
    let exec: sinon.SinonStub;
    let getPythonSetting: sinon.SinonStub;
    let getOSType: sinon.SinonStub;
    let locator: PixiLocator;
    let pathExistsStub: sinon.SinonStub;

    suiteSetup(() => {
        getPythonSetting = sinon.stub(externalDependencies, 'getPythonSetting');
        getPythonSetting.returns('pixi');
        getOSType = sinon.stub(platformUtils, 'getOSType');
        exec = sinon.stub(externalDependencies, 'exec');
        pathExistsStub = sinon.stub(externalDependencies, 'pathExists');
        pathExistsStub.resolves(true);
    });

    suiteTeardown(() => sinon.restore());

    suite('iterEnvs()', () => {
        interface TestArgs {
            projectDir: string;
            osType: platformUtils.OSType;
            pythonBin: string;
        }

        const testProject = async ({ projectDir, osType, pythonBin }: TestArgs) => {
            getOSType.returns(osType);

            locator = new PixiLocator(projectDir);
            exec.callsFake(makeExecHandler({ cwd: projectDir }));

            const iterator = locator.iterEnvs();
            const actualEnvs = await getEnvs(iterator);

            const envPath = path.join(projectDir, '.pixi', 'envs', 'default');
            const expectedEnvs = [
                createBasicEnv(PythonEnvKind.Pixi, path.join(envPath, pythonBin), undefined, envPath),
            ];
            assertBasicEnvsEqual(actualEnvs, expectedEnvs);
        };

        test('project with only the default env', () =>
            testProject({
                projectDir: projectDirs.nonWindows.path,
                osType: platformUtils.OSType.Linux,
                pythonBin: 'bin/python',
            }));
        test('project with only the default env on Windows', () =>
            testProject({
                projectDir: projectDirs.windows.path,
                osType: platformUtils.OSType.Windows,
                pythonBin: 'python.exe',
            }));

        test('project with multiple environments', async () => {
            getOSType.returns(platformUtils.OSType.Linux);

            exec.callsFake(makeExecHandler({ cwd: projectDirs.multiEnv.path }));

            locator = new PixiLocator(projectDirs.multiEnv.path);
            const iterator = locator.iterEnvs();
            const actualEnvs = await getEnvs(iterator);

            const expectedEnvs = projectDirs.multiEnv.info.environments_info.map((info) =>
                createBasicEnv(PythonEnvKind.Pixi, path.join(info.prefix, 'bin/python'), undefined, info.prefix),
            );
            assertBasicEnvsEqual(actualEnvs, expectedEnvs);
        });
    });
});
