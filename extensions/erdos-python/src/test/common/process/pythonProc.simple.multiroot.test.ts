// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { execFile } from 'child_process';
import * as path from 'path';
import { ConfigurationTarget, Uri } from 'vscode';
import * as fs from '../../../client/common/platform/fs-paths';
import { IPythonExecutionFactory, StdErrError } from '../../../client/common/process/types';
import { IConfigurationService } from '../../../client/common/types';
import { clearCache } from '../../../client/common/utils/cacheUtils';
import { IServiceContainer } from '../../../client/ioc/types';
import { initializeExternalDependencies } from '../../../client/pythonEnvironments/common/externalDependencies';
import { clearPythonPathInWorkspaceFolder } from '../../common';
import { getExtensionSettings } from '../../extensionSettings';
import { closeActiveWindows, initialize, initializeTest, IS_MULTI_ROOT_TEST, TEST_TIMEOUT } from '../../initialize';

use(chaiAsPromised.default);

const multirootPath = path.join(__dirname, '..', '..', '..', '..', 'src', 'testMultiRootWkspc');
const workspace4Path = Uri.file(path.join(multirootPath, 'workspace4'));
const workspace4PyFile = Uri.file(path.join(workspace4Path.fsPath, 'one.py'));

suite('PythonExecutableService', () => {
    let serviceContainer: IServiceContainer;
    let configService: IConfigurationService;
    let pythonExecFactory: IPythonExecutionFactory;

    suiteSetup(async function () {
        if (!IS_MULTI_ROOT_TEST) {
            this.skip();
        }
        await clearPythonPathInWorkspaceFolder(workspace4Path);
        serviceContainer = (await initialize()).serviceContainer;
    });
    setup(async () => {
        initializeExternalDependencies(serviceContainer);
        configService = serviceContainer.get<IConfigurationService>(IConfigurationService);
        pythonExecFactory = serviceContainer.get<IPythonExecutionFactory>(IPythonExecutionFactory);

        await configService.updateSetting('envFile', undefined, workspace4PyFile, ConfigurationTarget.WorkspaceFolder);
        clearCache();
        return initializeTest();
    });
    suiteTeardown(closeActiveWindows);
    teardown(async () => {
        await closeActiveWindows();
        await clearPythonPathInWorkspaceFolder(workspace4Path);
        await configService.updateSetting('envFile', undefined, workspace4PyFile, ConfigurationTarget.WorkspaceFolder);
        await initializeTest();
        clearCache();
    });

    test('Importing without a valid PYTHONPATH should fail', async () => {
        await configService.updateSetting(
            'envFile',
            'someInvalidFile.env',
            workspace4PyFile,
            ConfigurationTarget.WorkspaceFolder,
        );
        pythonExecFactory = serviceContainer.get<IPythonExecutionFactory>(IPythonExecutionFactory);
        const pythonExecService = await pythonExecFactory.create({ resource: workspace4PyFile });
        const promise = pythonExecService.exec([workspace4PyFile.fsPath], {
            cwd: path.dirname(workspace4PyFile.fsPath),
            throwOnStdErr: true,
        });

        await expect(promise).to.eventually.be.rejectedWith(StdErrError);
    }).timeout(TEST_TIMEOUT * 3);

    test('Importing with a valid PYTHONPATH from .env file should succeed', async () => {
        await configService.updateSetting('envFile', undefined, workspace4PyFile, ConfigurationTarget.WorkspaceFolder);
        const pythonExecService = await pythonExecFactory.create({ resource: workspace4PyFile });
        const result = await pythonExecService.exec([workspace4PyFile.fsPath], {
            cwd: path.dirname(workspace4PyFile.fsPath),
            throwOnStdErr: true,
        });

        expect(result.stdout.startsWith('Hello')).to.be.equals(true);
    }).timeout(TEST_TIMEOUT * 3);

    test("Known modules such as 'os' and 'sys' should be deemed 'installed'", async () => {
        const pythonExecService = await pythonExecFactory.create({ resource: workspace4PyFile });
        const osModuleIsInstalled = pythonExecService.isModuleInstalled('os');
        const sysModuleIsInstalled = pythonExecService.isModuleInstalled('sys');
        await expect(osModuleIsInstalled).to.eventually.equal(true, 'os module is not installed');
        await expect(sysModuleIsInstalled).to.eventually.equal(true, 'sys module is not installed');
    }).timeout(TEST_TIMEOUT * 3);

    test("Unknown modules such as 'xyzabc123' be deemed 'not installed'", async () => {
        const pythonExecService = await pythonExecFactory.create({ resource: workspace4PyFile });
        const randomModuleName = `xyz123${new Date().getSeconds()}`;
        const randomModuleIsInstalled = pythonExecService.isModuleInstalled(randomModuleName);
        await expect(randomModuleIsInstalled).to.eventually.equal(
            false,
            `Random module '${randomModuleName}' is installed`,
        );
    }).timeout(TEST_TIMEOUT * 3);

    test('Ensure correct path to executable is returned', async () => {
        const { pythonPath } = getExtensionSettings(workspace4Path);
        let expectedExecutablePath: string;
        if (await fs.pathExists(pythonPath)) {
            expectedExecutablePath = pythonPath;
        } else {
            expectedExecutablePath = await new Promise<string>((resolve) => {
                execFile(pythonPath, ['-c', 'import sys;print(sys.executable)'], (_error, stdout, _stdErr) => {
                    resolve(stdout.trim());
                });
            });
        }
        const pythonExecService = await pythonExecFactory.create({ resource: workspace4PyFile });
        const executablePath = await pythonExecService.getExecutablePath();
        expect(executablePath).to.equal(expectedExecutablePath, 'Executable paths are not the same');
    }).timeout(TEST_TIMEOUT * 3);
});
