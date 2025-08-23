// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as fsWatcher from '../../../../../client/common/platform/fileSystemWatcher';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { PythonEnvsChangedEvent } from '../../../../../client/pythonEnvironments/base/watcher';
import * as helpers from '../../../../../client/common/helpers';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import {
    CustomVirtualEnvironmentLocator,
    VENVFOLDERS_SETTING_KEY,
    VENVPATH_SETTING_KEY,
} from '../../../../../client/pythonEnvironments/base/locators/lowLevel/customVirtualEnvLocator';
import { createBasicEnv } from '../../common';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';

suite('CustomVirtualEnvironment Locator', () => {
    const testVirtualHomeDir = path.join(TEST_LAYOUT_ROOT, 'virtualhome');
    const testVenvPathWithTilda = path.join('~', 'customfolder');
    let getUserHomeDirStub: sinon.SinonStub;
    let getOSTypeStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;
    let locator: CustomVirtualEnvironmentLocator;
    let watchLocationForPatternStub: sinon.SinonStub;
    let getPythonSettingStub: sinon.SinonStub;
    let onDidChangePythonSettingStub: sinon.SinonStub;
    let untildify: sinon.SinonStub;

    setup(async () => {
        untildify = sinon.stub(helpers, 'untildify');
        untildify.callsFake((value: string) => value.replace('~', testVirtualHomeDir));
        getUserHomeDirStub = sinon.stub(platformUtils, 'getUserHomeDir');
        getUserHomeDirStub.returns(testVirtualHomeDir);
        getPythonSettingStub = sinon.stub(externalDependencies, 'getPythonSetting');

        getOSTypeStub = sinon.stub(platformUtils, 'getOSType');
        getOSTypeStub.returns(platformUtils.OSType.Linux);

        watchLocationForPatternStub = sinon.stub(fsWatcher, 'watchLocationForPattern');
        watchLocationForPatternStub.returns({
            dispose: () => {
                /* do nothing */
            },
        });

        onDidChangePythonSettingStub = sinon.stub(externalDependencies, 'onDidChangePythonSetting');
        onDidChangePythonSettingStub.returns({
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
        readFileStub.withArgs(expectedDotProjectFile).returns(path.join(TEST_LAYOUT_ROOT, 'pipenv', 'project2'));
        readFileStub.callThrough();

        locator = new CustomVirtualEnvironmentLocator();
    });
    teardown(async () => {
        await locator.dispose();
        sinon.restore();
    });

    test('iterEnvs(): Windows with both settings set', async () => {
        getPythonSettingStub.withArgs('venvPath').returns(testVenvPathWithTilda);
        getPythonSettingStub.withArgs('venvFolders').returns(['.venvs', '.virtualenvs', 'Envs']);
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
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win2', 'bin', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, 'customfolder', 'win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, 'customfolder', 'win2', 'bin', 'python.exe'),
            ),
        ];

        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): Non-Windows with both settings set', async () => {
        const testWorkspaceFolder = path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1');

        getPythonSettingStub.withArgs('venvPath').returns(path.join(testWorkspaceFolder, 'posix2conda'));
        getPythonSettingStub
            .withArgs('venvFolders')
            .returns(['.venvs', '.virtualenvs', 'envs', path.join('.local', 'share', 'virtualenvs')]);
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Unknown, path.join(testWorkspaceFolder, 'posix2conda', 'python')),
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
            createBasicEnv(
                PythonEnvKind.Pipenv,
                path.join(testVirtualHomeDir, '.local', 'share', 'virtualenvs', 'project2-vnNIWe9P', 'bin', 'python'),
            ),
        ];

        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): No User home dir set', async () => {
        getUserHomeDirStub.returns(undefined);

        getPythonSettingStub.withArgs('venvPath').returns(testVenvPathWithTilda);
        getPythonSettingStub.withArgs('venvFolders').returns(['.venvs', '.virtualenvs', 'Envs']);
        getOSTypeStub.returns(platformUtils.OSType.Windows);
        const expectedEnvs = [
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, 'customfolder', 'win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnv,
                path.join(testVirtualHomeDir, 'customfolder', 'win2', 'bin', 'python.exe'),
            ),
        ];

        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): with only venvFolders set', async () => {
        getPythonSettingStub.withArgs('venvFolders').returns(['.venvs', '.virtualenvs', 'Envs']);
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
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win1', 'python.exe'),
            ),
            createBasicEnv(
                PythonEnvKind.VirtualEnvWrapper,
                path.join(testVirtualHomeDir, 'Envs', 'wrapper_win2', 'bin', 'python.exe'),
            ),
        ];

        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): with only venvPath set', async () => {
        const testWorkspaceFolder = path.join(TEST_LAYOUT_ROOT, 'workspace', 'folder1');

        getPythonSettingStub.withArgs('venvPath').returns(path.join(testWorkspaceFolder, 'posix2conda'));
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Unknown, path.join(testWorkspaceFolder, 'posix2conda', 'python')),
        ];

        const iterator = locator.iterEnvs();
        const actualEnvs = await getEnvs(iterator);

        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('onChanged fires if venvPath setting changes', async () => {
        const events: PythonEnvsChangedEvent[] = [];
        const expected: PythonEnvsChangedEvent[] = [{ providerId: locator.providerId }];
        locator.onChanged((e) => events.push(e));

        await getEnvs(locator.iterEnvs());
        const venvPathCall = onDidChangePythonSettingStub
            .getCalls()
            .filter((c) => c.args[0] === VENVPATH_SETTING_KEY)[0];
        const callback = venvPathCall.args[1];
        callback(); // Callback is called when venvPath setting changes

        assert.deepEqual(events, expected, 'Unexpected events');
    });

    test('onChanged fires if venvFolders setting changes', async () => {
        const events: PythonEnvsChangedEvent[] = [];
        const expected: PythonEnvsChangedEvent[] = [{ providerId: locator.providerId }];
        locator.onChanged((e) => events.push(e));

        await getEnvs(locator.iterEnvs());
        const venvFoldersCall = onDidChangePythonSettingStub
            .getCalls()
            .filter((c) => c.args[0] === VENVFOLDERS_SETTING_KEY)[0];
        const callback = venvFoldersCall.args[1];
        callback(); // Callback is called when venvFolders setting changes

        assert.deepEqual(events, expected, 'Unexpected events');
    });
});
