// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as fsWatcher from '../../../../../client/common/platform/fileSystemWatcher';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import { GlobalVirtualEnvironmentLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/globalVirtualEnvronmentLocator';
import { createBasicEnv } from '../../common';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';

suite('GlobalVirtualEnvironment Locator', () => {
    const testVirtualHomeDir = path.join(TEST_LAYOUT_ROOT, 'virtualhome');
    const testWorkOnHomePath = path.join(testVirtualHomeDir, 'workonhome');
    let getEnvVariableStub: sinon.SinonStub;
    let getUserHomeDirStub: sinon.SinonStub;
    let getOSTypeStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;
    let locator: GlobalVirtualEnvironmentLocator;
    let watchLocationForPatternStub: sinon.SinonStub;
    const project2 = path.join(TEST_LAYOUT_ROOT, 'pipenv', 'project2');

    setup(async () => {
        getEnvVariableStub = sinon.stub(platformUtils, 'getEnvironmentVariable');
        getEnvVariableStub.withArgs('WORKON_HOME').returns(testWorkOnHomePath);

        getUserHomeDirStub = sinon.stub(platformUtils, 'getUserHomeDir');
        getUserHomeDirStub.returns(testVirtualHomeDir);

        getOSTypeStub = sinon.stub(platformUtils, 'getOSType');
        getOSTypeStub.returns(platformUtils.OSType.Linux);

        watchLocationForPatternStub = sinon.stub(fsWatcher, 'watchLocationForPattern');
        watchLocationForPatternStub.returns({
            dispose: () => {
                /* do nothing */
            },
        });

        const expectedDotProjectFile = path.join(
            testVirtualHomeDir,
            '.local',
            'share',
            'virtualenvs',
            'project2-vnNIWe9P',
            '.project',
        );
        readFileStub = sinon.stub(externalDependencies, 'readFile');
        readFileStub.withArgs(expectedDotProjectFile).returns(project2);
        readFileStub.callThrough();
    });
    teardown(async () => {
        await locator.dispose();
        readFileStub.restore();
        getEnvVariableStub.restore();
        getUserHomeDirStub.restore();
        getOSTypeStub.restore();
        watchLocationForPatternStub.restore();
    });

    test('iterEnvs(): Windows', async () => {
        getOSTypeStub.returns(platformUtils.OSType.Windows);
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe')),
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'win2', 'bin', 'python.exe')),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, '.virtualenvs', 'win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, '.virtualenvs', 'win2', 'bin', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win2', 'bin', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'win2', 'bin', 'python.exe'),
            ),
        ];

        locator = new GlobalVirtualEnvironmentLocator();
        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): Windows (WORKON_HOME NOT set)', async () => {
        getOSTypeStub.returns(platformUtils.OSType.Windows);
        getEnvVariableStub.withArgs('WORKON_HOME').returns(undefined);
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe')),
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'win2', 'bin', 'python.exe')),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, '.virtualenvs', 'win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, '.virtualenvs', 'win2', 'bin', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win2', 'bin', 'python.exe'),
            ),
        ];

        locator = new GlobalVirtualEnvironmentLocator();
        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): Non-Windows', async () => {
        const pipenv = createBasicEnv(
            PythonEnvKind.Pipenv,
            path.join(testVirtualHomeDir, '.local', 'share', 'virtualenvs', 'project2-vnNIWe9P', 'bin', 'python'),
        );
        pipenv.searchLocation = Uri.file(project2);
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'posix1', 'python')),
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'posix2', 'bin', 'python')),
            createBasicEnv(PythonEnvKind.VirtualEnv, path.join(testVirtualHomeDir, '.virtualenvs', 'posix1', 'python')),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, '.virtualenvs', 'posix2', 'bin', 'python'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'posix1', 'python'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'posix2', 'bin', 'python'),
            ),
            pipenv,
        ];

        locator = new GlobalVirtualEnvironmentLocator();
        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): with depth set', async () => {
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'posix1', 'python')),
            createBasicEnv(PythonEnvKind.VirtualEnv, path.join(testVirtualHomeDir, '.virtualenvs', 'posix1', 'python')),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'posix1', 'python'),
            ),
        ];

        locator = new GlobalVirtualEnvironmentLocator(1);
        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): Non-Windows (WORKON_HOME not set)', async () => {
        getEnvVariableStub.withArgs('WORKON_HOME').returns(undefined);
        const pipenv = createBasicEnv(
            PythonEnvKind.Pipenv,
            path.join(testVirtualHomeDir, '.local', 'share', 'virtualenvs', 'project2-vnNIWe9P', 'bin', 'python'),
        );
        pipenv.searchLocation = Uri.file(project2);
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'posix1', 'python')),
            createBasicEnv(PythonEnvKind.Venv, path.join(testVirtualHomeDir, '.venvs', 'posix2', 'bin', 'python')),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, '.virtualenvs', 'posix1', 'python'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, '.virtualenvs', 'posix2', 'bin', 'python'),
            ),
            pipenv,
        ];

        locator = new GlobalVirtualEnvironmentLocator();
        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): No User home dir set', async () => {
        getUserHomeDirStub.returns(undefined);
        const expectedEnvs = [
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'posix1', 'python'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'posix2', 'bin', 'python'),
            ),
        ];

        locator = new GlobalVirtualEnvironmentLocator();
        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): No default virtual environment dirs ', async () => {
        // We can simulate that by pointing the user home dir to some random directory
        getUserHomeDirStub.returns(path.join('some', 'random', 'directory'));
        const expectedEnvs = [
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'posix1', 'python'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'workonhome', 'posix2', 'bin', 'python'),
            ),
        ];

        locator = new GlobalVirtualEnvironmentLocator(2);
        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });
});
