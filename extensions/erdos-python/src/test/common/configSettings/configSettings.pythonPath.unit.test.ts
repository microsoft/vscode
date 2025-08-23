// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import * as typemoq from 'typemoq';
import { Uri, WorkspaceConfiguration } from 'vscode';
import { IWorkspaceService } from '../../../client/common/application/types';
import { PythonSettings } from '../../../client/common/configSettings';
import { IExperimentService, IInterpreterPathService } from '../../../client/common/types';
import { noop } from '../../../client/common/utils/misc';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';
import * as EnvFileTelemetry from '../../../client/telemetry/envFileTelemetry';
import { MockAutoSelectionService } from '../../mocks/autoSelector';
import { untildify } from '../../../client/common/helpers';
import { MockExtensions } from '../../mocks/extensions';

suite('Python Settings - pythonPath', () => {
    class CustomPythonSettings extends PythonSettings {
        public update(settings: WorkspaceConfiguration) {
            return super.update(settings);
        }

        // eslint-disable-next-line class-methods-use-this
        protected getPythonExecutable(pythonPath: string) {
            return pythonPath;
        }

        // eslint-disable-next-line class-methods-use-this
        public initialize() {
            noop();
        }
    }
    let configSettings: CustomPythonSettings;
    let workspaceService: typemoq.IMock<IWorkspaceService>;
    let experimentsManager: typemoq.IMock<IExperimentService>;
    let interpreterPathService: typemoq.IMock<IInterpreterPathService>;
    let pythonSettings: typemoq.IMock<WorkspaceConfiguration>;
    setup(() => {
        pythonSettings = typemoq.Mock.ofType<WorkspaceConfiguration>();
        sinon.stub(EnvFileTelemetry, 'sendSettingTelemetry').returns();
        interpreterPathService = typemoq.Mock.ofType<IInterpreterPathService>();
        experimentsManager = typemoq.Mock.ofType<IExperimentService>();
        workspaceService = typemoq.Mock.ofType<IWorkspaceService>();
        pythonSettings.setup((p) => p.get(typemoq.It.isValue('defaultInterpreterPath'))).returns(() => 'python');
        pythonSettings.setup((p) => p.get('logging')).returns(() => ({ level: 'error' }));
    });
    teardown(() => {
        if (configSettings) {
            configSettings.dispose();
        }
        sinon.restore();
    });

    test('Python Path from settings is used', () => {
        const pythonPath = 'This is the python Path';
        interpreterPathService.setup((p) => p.get(typemoq.It.isAny())).returns(() => pythonPath);
        configSettings = new CustomPythonSettings(
            undefined,
            new MockAutoSelectionService(),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal(pythonPath);
    });
    test("Python Path from settings is used and relative path starting with '~' will be resolved from home directory", () => {
        const pythonPath = `~${path.sep}This is the python Path`;
        interpreterPathService.setup((p) => p.get(typemoq.It.isAny())).returns(() => pythonPath);
        configSettings = new CustomPythonSettings(
            undefined,
            new MockAutoSelectionService(),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal(untildify(pythonPath));
    });
    test("Python Path from settings is used and relative path starting with '.' will be resolved from workspace folder", () => {
        const pythonPath = `.${path.sep}This is the python Path`;
        interpreterPathService.setup((p) => p.get(typemoq.It.isAny())).returns(() => pythonPath);
        const workspaceFolderUri = Uri.file(__dirname);
        configSettings = new CustomPythonSettings(
            workspaceFolderUri,
            new MockAutoSelectionService(),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );

        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal(path.resolve(workspaceFolderUri.fsPath, pythonPath));
    });
    test('Python Path from settings is used and ${workspacecFolder} value will be resolved from workspace folder', () => {
        const workspaceFolderToken = '${workspaceFolder}';
        const pythonPath = `${workspaceFolderToken}${path.sep}This is the python Path`;
        interpreterPathService.setup((p) => p.get(typemoq.It.isAny())).returns(() => pythonPath);
        const workspaceFolderUri = Uri.file(__dirname);
        configSettings = new CustomPythonSettings(
            workspaceFolderUri,
            new MockAutoSelectionService(),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal(path.join(workspaceFolderUri.fsPath, 'This is the python Path'));
    });
    test("If we don't have a custom python path and no auto selected interpreters, then use default", () => {
        const workspaceFolderUri = Uri.file(__dirname);
        const selectionService = mock(MockAutoSelectionService);
        const pythonPath = 'python';
        interpreterPathService.setup((p) => p.get(typemoq.It.isAny())).returns(() => pythonPath);
        configSettings = new CustomPythonSettings(
            workspaceFolderUri,
            instance(selectionService),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal('python');
    });
    test("If a workspace is opened and if we don't have a custom python path but we do have an auto selected interpreter, then use it", () => {
        const pythonPath = path.join(__dirname, 'this is a python path that was auto selected');
        const interpreter = { path: pythonPath } as PythonEnvironment;
        const workspaceFolderUri = Uri.file(__dirname);
        const selectionService = mock(MockAutoSelectionService);
        when(selectionService.getAutoSelectedInterpreter(workspaceFolderUri)).thenReturn(interpreter);
        when(selectionService.setWorkspaceInterpreter(workspaceFolderUri, anything())).thenResolve();
        interpreterPathService.setup((p) => p.get(typemoq.It.isAny())).returns(() => 'python');
        configSettings = new CustomPythonSettings(
            workspaceFolderUri,
            instance(selectionService),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal(pythonPath);
        verify(selectionService.setWorkspaceInterpreter(workspaceFolderUri, interpreter)).once(); // Verify we set the autoselected interpreter
    });
    test("If no workspace is opened and we don't have a custom python path but we do have an auto selected interpreter, then use it", () => {
        const pythonPath = path.join(__dirname, 'this is a python path that was auto selected');
        const interpreter = { path: pythonPath } as PythonEnvironment;
        const workspaceFolderUri = Uri.file(__dirname);
        const selectionService = mock(MockAutoSelectionService);
        when(selectionService.getAutoSelectedInterpreter(workspaceFolderUri)).thenReturn(interpreter);
        when(selectionService.setWorkspaceInterpreter(workspaceFolderUri, anything())).thenResolve();
        interpreterPathService.setup((p) => p.get(typemoq.It.isAny())).returns(() => 'python');

        configSettings = new CustomPythonSettings(
            workspaceFolderUri,
            instance(selectionService),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal(pythonPath);
    });
    test("If we don't have a custom default python path and we do have an auto selected interpreter, then use it", () => {
        const pythonPath = path.join(__dirname, 'this is a python path that was auto selected');
        const interpreter = { path: pythonPath } as PythonEnvironment;
        const workspaceFolderUri = Uri.file(__dirname);
        const selectionService = mock(MockAutoSelectionService);
        when(selectionService.getAutoSelectedInterpreter(workspaceFolderUri)).thenReturn(interpreter);

        configSettings = new CustomPythonSettings(
            workspaceFolderUri,
            instance(selectionService),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        interpreterPathService.setup((i) => i.get(typemoq.It.isAny())).returns(() => 'custom');
        pythonSettings.setup((p) => p.get(typemoq.It.isValue('defaultInterpreterPath'))).returns(() => 'python');
        configSettings.update(pythonSettings.object);

        expect(configSettings.defaultInterpreterPath).to.be.equal(pythonPath);
    });
    test("If we don't have a custom python path, get the autoselected interpreter and use it if it's safe", () => {
        const resource = Uri.parse('a');
        const pythonPath = path.join(__dirname, 'this is a python path that was auto selected');
        const interpreter = { path: pythonPath } as PythonEnvironment;
        const selectionService = mock(MockAutoSelectionService);
        when(selectionService.getAutoSelectedInterpreter(resource)).thenReturn(interpreter);
        when(selectionService.setWorkspaceInterpreter(resource, anything())).thenResolve();
        configSettings = new CustomPythonSettings(
            resource,
            instance(selectionService),
            workspaceService.object,
            interpreterPathService.object,
            undefined,
            new MockExtensions(),
        );
        interpreterPathService.setup((i) => i.get(resource)).returns(() => 'python');
        configSettings.update(pythonSettings.object);

        expect(configSettings.pythonPath).to.be.equal(pythonPath);
        experimentsManager.verifyAll();
        interpreterPathService.verifyAll();
        pythonSettings.verifyAll();
    });
});
