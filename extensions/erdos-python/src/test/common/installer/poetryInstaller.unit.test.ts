// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as sinon from 'sinon';
import * as path from 'path';
import * as assert from 'assert';
import { expect } from 'chai';
import { anything, instance, mock, when } from 'ts-mockito';
import { Uri } from 'vscode';
import { IWorkspaceService } from '../../../client/common/application/types';
import { WorkspaceService } from '../../../client/common/application/workspace';
import { PythonSettings } from '../../../client/common/configSettings';
import { ConfigurationService } from '../../../client/common/configuration/service';
import { PoetryInstaller } from '../../../client/common/installer/poetryInstaller';
import { ExecutionResult, ShellOptions } from '../../../client/common/process/types';
import { ExecutionInfo, IConfigurationService } from '../../../client/common/types';
import { ServiceContainer } from '../../../client/ioc/container';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { TEST_LAYOUT_ROOT } from '../../pythonEnvironments/common/commonTestConstants';
import * as externalDependencies from '../../../client/pythonEnvironments/common/externalDependencies';
import { EnvironmentType } from '../../../client/pythonEnvironments/info';

suite('Module Installer - Poetry', () => {
    class TestInstaller extends PoetryInstaller {
        public getExecutionInfo(moduleName: string, resource?: Uri): Promise<ExecutionInfo> {
            return super.getExecutionInfo(moduleName, resource);
        }
    }
    const testPoetryDir = path.join(TEST_LAYOUT_ROOT, 'poetry');
    const project1 = path.join(testPoetryDir, 'project1');
    let poetryInstaller: TestInstaller;
    let workspaceService: IWorkspaceService;
    let configurationService: IConfigurationService;
    let interpreterService: IInterpreterService;
    let serviceContainer: ServiceContainer;
    let shellExecute: sinon.SinonStub;

    setup(() => {
        serviceContainer = mock(ServiceContainer);
        interpreterService = mock<IInterpreterService>();
        when(serviceContainer.get<IInterpreterService>(IInterpreterService)).thenReturn(instance(interpreterService));
        workspaceService = mock(WorkspaceService);
        configurationService = mock(ConfigurationService);

        shellExecute = sinon.stub(externalDependencies, 'shellExecute');
        shellExecute.callsFake((command: string, options: ShellOptions) => {
            // eslint-disable-next-line default-case
            switch (command) {
                case 'poetry env list --full-path':
                    return Promise.resolve<ExecutionResult<string>>({ stdout: '' });
                case 'poetry env info -p': {
                    const cwd = typeof options.cwd === 'string' ? options.cwd : options.cwd?.toString();
                    if (cwd && externalDependencies.arePathsSame(cwd, project1)) {
                        return Promise.resolve<ExecutionResult<string>>({
                            stdout: `${path.join(project1, '.venv')} \n`,
                        });
                    }
                }
            }
            return Promise.reject(new Error('Command failed'));
        });

        poetryInstaller = new TestInstaller(
            instance(serviceContainer),
            instance(workspaceService),
            instance(configurationService),
        );
    });

    teardown(() => {
        shellExecute?.restore();
    });

    test('Installer name is poetry', () => {
        expect(poetryInstaller.name).to.equal('poetry');
    });

    test('Installer priority is 10', () => {
        expect(poetryInstaller.priority).to.equal(10);
    });

    test('Installer display name is poetry', () => {
        expect(poetryInstaller.displayName).to.equal('poetry');
    });

    test('Is not supported when there is no resource', async () => {
        const supported = await poetryInstaller.isSupported();
        assert.strictEqual(supported, false);
    });
    test('Is not supported when there is no workspace', async () => {
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn();

        const supported = await poetryInstaller.isSupported(Uri.file(__filename));

        assert.strictEqual(supported, false);
    });
    test('Get Executable info', async () => {
        const uri = Uri.file(__dirname);
        const settings = mock(PythonSettings);

        when(configurationService.getSettings(uri)).thenReturn(instance(settings));
        when(settings.poetryPath).thenReturn('poetry path');

        const info = await poetryInstaller.getExecutionInfo('something', uri);

        assert.deepEqual(info, { args: ['add', '--group', 'dev', 'something'], execPath: 'poetry path' });
    });
    test('Get executable info when installing black', async () => {
        const uri = Uri.file(__dirname);
        const settings = mock(PythonSettings);

        when(configurationService.getSettings(uri)).thenReturn(instance(settings));
        when(settings.poetryPath).thenReturn('poetry path');

        const info = await poetryInstaller.getExecutionInfo('black', uri);

        assert.deepEqual(info, {
            args: ['add', '--group', 'dev', 'black'],
            execPath: 'poetry path',
        });
    });
    test('Is supported returns true if selected interpreter is related to the workspace', async () => {
        const uri = Uri.file(project1);
        const settings = mock(PythonSettings);

        when(interpreterService.getActiveInterpreter(anything())).thenResolve({
            path: path.join(project1, '.venv', 'Scripts', 'python.exe'),
            envType: EnvironmentType.Poetry,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        when(configurationService.getSettings(anything())).thenReturn(instance(settings));
        when(settings.poetryPath).thenReturn('poetry');
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn({ uri, name: '', index: 0 });

        const supported = await poetryInstaller.isSupported(Uri.file(__filename));

        assert.strictEqual(supported, true);
    });

    test('Is supported returns true if no interpreter is selected', async () => {
        const uri = Uri.file(project1);
        const settings = mock(PythonSettings);

        when(interpreterService.getActiveInterpreter(anything())).thenResolve(undefined);
        when(configurationService.getSettings(anything())).thenReturn(instance(settings));
        when(settings.poetryPath).thenReturn('poetry');
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn({ uri, name: '', index: 0 });

        const supported = await poetryInstaller.isSupported(Uri.file(__filename));

        assert.strictEqual(supported, false);
    });

    test('Is supported returns false if selected interpreter is not related to the workspace', async () => {
        const uri = Uri.file(project1);
        const settings = mock(PythonSettings);

        when(interpreterService.getActiveInterpreter(anything())).thenResolve({
            path: path.join(project1, '.random', 'Scripts', 'python.exe'),
            envType: EnvironmentType.Poetry,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        when(configurationService.getSettings(anything())).thenReturn(instance(settings));
        when(settings.poetryPath).thenReturn('poetry');
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn({ uri, name: '', index: 0 });

        const supported = await poetryInstaller.isSupported(Uri.file(__filename));

        assert.strictEqual(supported, false);
    });

    test('Is supported returns false if selected interpreter is not of Poetry type', async () => {
        const uri = Uri.file(project1);
        const settings = mock(PythonSettings);

        when(interpreterService.getActiveInterpreter(anything())).thenResolve({
            path: path.join(project1, '.venv', 'Scripts', 'python.exe'),
            envType: EnvironmentType.Pipenv,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        when(configurationService.getSettings(anything())).thenReturn(instance(settings));
        when(settings.poetryPath).thenReturn('poetry');
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn({ uri, name: '', index: 0 });

        const supported = await poetryInstaller.isSupported(Uri.file(__filename));

        assert.strictEqual(supported, false);
    });
});
