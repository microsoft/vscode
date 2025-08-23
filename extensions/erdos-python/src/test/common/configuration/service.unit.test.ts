// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { ConfigurationTarget, Uri, WorkspaceConfiguration } from 'vscode';
import { IWorkspaceService } from '../../../client/common/application/types';
import { PythonSettings } from '../../../client/common/configSettings';
import { ConfigurationService } from '../../../client/common/configuration/service';
import { IInterpreterPathService } from '../../../client/common/types';
import { IInterpreterAutoSelectionService } from '../../../client/interpreter/autoSelection/types';
import { IServiceContainer } from '../../../client/ioc/types';

suite('Configuration Service', () => {
    const resource = Uri.parse('a');
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    let interpreterPathService: TypeMoq.IMock<IInterpreterPathService>;
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let configService: ConfigurationService;
    setup(() => {
        workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
        workspaceService
            .setup((w) => w.getWorkspaceFolder(resource))
            .returns(() => ({
                uri: resource,
                index: 0,
                name: '0',
            }));
        interpreterPathService = TypeMoq.Mock.ofType<IInterpreterPathService>();
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        serviceContainer.setup((s) => s.get(IWorkspaceService)).returns(() => workspaceService.object);
        serviceContainer.setup((s) => s.get(IInterpreterPathService)).returns(() => interpreterPathService.object);
        configService = new ConfigurationService(serviceContainer.object);
    });

    function setupConfigProvider(): TypeMoq.IMock<WorkspaceConfiguration> {
        const workspaceConfig = TypeMoq.Mock.ofType<WorkspaceConfiguration>();
        workspaceService
            .setup((w) => w.getConfiguration(TypeMoq.It.isValue('python'), TypeMoq.It.isValue(resource)))
            .returns(() => workspaceConfig.object);
        return workspaceConfig;
    }

    test('Fetching settings goes as expected', () => {
        const interpreterAutoSelectionProxyService = TypeMoq.Mock.ofType<IInterpreterAutoSelectionService>();
        serviceContainer
            .setup((s) => s.get(IInterpreterAutoSelectionService))
            .returns(() => interpreterAutoSelectionProxyService.object)
            .verifiable(TypeMoq.Times.once());
        const settings = configService.getSettings();
        expect(settings).to.be.instanceOf(PythonSettings);
    });

    test('Do not update global settings if global value is already equal to the new value', async () => {
        const workspaceConfig = setupConfigProvider();

        workspaceConfig
            .setup((w) => w.inspect('setting'))
            .returns(() => ({ globalValue: 'globalValue', key: 'setting' }));
        workspaceConfig
            .setup((w) => w.update('setting', 'globalValue', ConfigurationTarget.Global))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.never());

        await configService.updateSetting('setting', 'globalValue', resource, ConfigurationTarget.Global);

        workspaceConfig.verifyAll();
    });

    test('Update global settings if global value is not equal to the new value', async () => {
        const workspaceConfig = setupConfigProvider();

        workspaceConfig
            .setup((w) => w.inspect('setting'))
            .returns(() => ({ globalValue: 'globalValue', key: 'setting' }));
        workspaceConfig
            .setup((w) => w.update('setting', 'newGlobalValue', ConfigurationTarget.Global))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());

        await configService.updateSetting('setting', 'newGlobalValue', resource, ConfigurationTarget.Global);

        workspaceConfig.verifyAll();
    });

    test('Do not update workspace settings if workspace value is already equal to the new value', async () => {
        const workspaceConfig = setupConfigProvider();

        workspaceConfig
            .setup((w) => w.inspect('setting'))
            .returns(() => ({ workspaceValue: 'workspaceValue', key: 'setting' }));
        workspaceConfig
            .setup((w) => w.update('setting', 'workspaceValue', ConfigurationTarget.Workspace))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.never());

        await configService.updateSetting('setting', 'workspaceValue', resource, ConfigurationTarget.Workspace);

        workspaceConfig.verifyAll();
    });

    test('Update workspace settings if workspace value is not equal to the new value', async () => {
        const workspaceConfig = setupConfigProvider();

        workspaceConfig
            .setup((w) => w.inspect('setting'))
            .returns(() => ({ workspaceValue: 'workspaceValue', key: 'setting' }));
        workspaceConfig
            .setup((w) => w.update('setting', 'newWorkspaceValue', ConfigurationTarget.Workspace))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());

        await configService.updateSetting('setting', 'newWorkspaceValue', resource, ConfigurationTarget.Workspace);

        workspaceConfig.verifyAll();
    });

    test('Do not update workspace folder settings if workspace folder value is already equal to the new value', async () => {
        const workspaceConfig = setupConfigProvider();
        workspaceConfig
            .setup((w) => w.inspect('setting'))

            .returns(() => ({ workspaceFolderValue: 'workspaceFolderValue', key: 'setting' }));
        workspaceConfig
            .setup((w) => w.update('setting', 'workspaceFolderValue', ConfigurationTarget.WorkspaceFolder))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.never());

        await configService.updateSetting(
            'setting',
            'workspaceFolderValue',
            resource,
            ConfigurationTarget.WorkspaceFolder,
        );

        workspaceConfig.verifyAll();
    });

    test('Update workspace folder settings if workspace folder value is not equal to the new value', async () => {
        const workspaceConfig = setupConfigProvider();
        workspaceConfig
            .setup((w) => w.inspect('setting'))

            .returns(() => ({ workspaceFolderValue: 'workspaceFolderValue', key: 'setting' }));
        workspaceConfig
            .setup((w) => w.update('setting', 'newWorkspaceFolderValue', ConfigurationTarget.WorkspaceFolder))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());

        await configService.updateSetting(
            'setting',
            'newWorkspaceFolderValue',
            resource,
            ConfigurationTarget.WorkspaceFolder,
        );

        workspaceConfig.verifyAll();
    });
});
