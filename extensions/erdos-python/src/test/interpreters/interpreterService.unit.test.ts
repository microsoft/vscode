// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { Container } from 'inversify';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import * as sinon from 'sinon';
import { ConfigurationTarget, Disposable, TextDocument, TextEditor, Uri, WorkspaceConfiguration } from 'vscode';
import { IApplicationShell, IDocumentManager, IWorkspaceService } from '../../client/common/application/types';
import { IFileSystem } from '../../client/common/platform/types';
import { IPythonExecutionFactory, IPythonExecutionService } from '../../client/common/process/types';
import {
    IConfigurationService,
    IDisposableRegistry,
    IExperimentService,
    IInstaller,
    IInterpreterPathService,
    InterpreterConfigurationScope,
    IPersistentStateFactory,
    IPythonSettings,
} from '../../client/common/types';
import { noop } from '../../client/common/utils/misc';
import {
    IInterpreterAutoSelectionService,
    IInterpreterAutoSelectionProxyService,
} from '../../client/interpreter/autoSelection/types';
import { IPythonPathUpdaterServiceManager } from '../../client/interpreter/configuration/types';
import { IComponentAdapter, IInterpreterDisplay, IInterpreterHelper } from '../../client/interpreter/contracts';
import { InterpreterService } from '../../client/interpreter/interpreterService';
import { ServiceContainer } from '../../client/ioc/container';
import { ServiceManager } from '../../client/ioc/serviceManager';
import { PYTHON_PATH } from '../common';
import { MockAutoSelectionService } from '../mocks/autoSelector';
import * as proposedApi from '../../client/environmentApi';
import { createTypeMoq } from '../mocks/helper';
import * as extapi from '../../client/envExt/api.internal';

/* eslint-disable @typescript-eslint/no-explicit-any */

use(chaiAsPromised.default);

suite('Interpreters service', () => {
    let serviceManager: ServiceManager;
    let serviceContainer: ServiceContainer;
    let updater: TypeMoq.IMock<IPythonPathUpdaterServiceManager>;
    let pyenvs: TypeMoq.IMock<IComponentAdapter>;
    let helper: TypeMoq.IMock<IInterpreterHelper>;
    let workspace: TypeMoq.IMock<IWorkspaceService>;
    let config: TypeMoq.IMock<WorkspaceConfiguration>;
    let fileSystem: TypeMoq.IMock<IFileSystem>;
    let interpreterDisplay: TypeMoq.IMock<IInterpreterDisplay>;
    let persistentStateFactory: TypeMoq.IMock<IPersistentStateFactory>;
    let pythonExecutionFactory: TypeMoq.IMock<IPythonExecutionFactory>;
    let pythonExecutionService: TypeMoq.IMock<IPythonExecutionService>;
    let configService: TypeMoq.IMock<IConfigurationService>;
    let interpreterPathService: TypeMoq.IMock<IInterpreterPathService>;
    let pythonSettings: TypeMoq.IMock<IPythonSettings>;
    let experiments: TypeMoq.IMock<IExperimentService>;
    let installer: TypeMoq.IMock<IInstaller>;
    let appShell: TypeMoq.IMock<IApplicationShell>;
    let reportActiveInterpreterChangedStub: sinon.SinonStub;
    let useEnvExtensionStub: sinon.SinonStub;

    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        const cont = new Container();
        serviceManager = new ServiceManager(cont);
        serviceContainer = new ServiceContainer(cont);

        interpreterPathService = createTypeMoq<IInterpreterPathService>();
        updater = createTypeMoq<IPythonPathUpdaterServiceManager>();
        pyenvs = createTypeMoq<IComponentAdapter>();
        helper = createTypeMoq<IInterpreterHelper>();
        workspace = createTypeMoq<IWorkspaceService>();
        config = createTypeMoq<WorkspaceConfiguration>();
        fileSystem = createTypeMoq<IFileSystem>();
        interpreterDisplay = createTypeMoq<IInterpreterDisplay>();
        persistentStateFactory = createTypeMoq<IPersistentStateFactory>();
        pythonExecutionFactory = createTypeMoq<IPythonExecutionFactory>();
        pythonExecutionService = createTypeMoq<IPythonExecutionService>();
        configService = createTypeMoq<IConfigurationService>();
        installer = createTypeMoq<IInstaller>();
        appShell = createTypeMoq<IApplicationShell>();
        experiments = createTypeMoq<IExperimentService>();

        pythonSettings = createTypeMoq<IPythonSettings>();
        pythonSettings.setup((s) => s.pythonPath).returns(() => PYTHON_PATH);
        configService.setup((c) => c.getSettings(TypeMoq.It.isAny())).returns(() => pythonSettings.object);

        pythonExecutionService.setup((p: any) => p.then).returns(() => undefined);
        workspace.setup((x) => x.getConfiguration('python', TypeMoq.It.isAny())).returns(() => config.object);
        pythonExecutionFactory
            .setup((f) => f.create(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(pythonExecutionService.object));
        fileSystem.setup((fs) => fs.getFileHash(TypeMoq.It.isAny())).returns(() => Promise.resolve(''));
        persistentStateFactory
            .setup((p) => p.createGlobalPersistentState(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => {
                const state = {
                    updateValue: () => Promise.resolve(),
                };
                return state as any;
            });

        serviceManager.addSingletonInstance<IExperimentService>(IExperimentService, experiments.object);
        serviceManager.addSingletonInstance<Disposable[]>(IDisposableRegistry, []);
        serviceManager.addSingletonInstance<IInterpreterHelper>(IInterpreterHelper, helper.object);
        serviceManager.addSingletonInstance<IPythonPathUpdaterServiceManager>(
            IPythonPathUpdaterServiceManager,
            updater.object,
        );
        serviceManager.addSingletonInstance<IWorkspaceService>(IWorkspaceService, workspace.object);
        serviceManager.addSingletonInstance<IFileSystem>(IFileSystem, fileSystem.object);
        serviceManager.addSingletonInstance<IInterpreterPathService>(
            IInterpreterPathService,
            interpreterPathService.object,
        );
        serviceManager.addSingletonInstance<IInterpreterDisplay>(IInterpreterDisplay, interpreterDisplay.object);
        serviceManager.addSingletonInstance<IPersistentStateFactory>(
            IPersistentStateFactory,
            persistentStateFactory.object,
        );
        serviceManager.addSingletonInstance<IPythonExecutionFactory>(
            IPythonExecutionFactory,
            pythonExecutionFactory.object,
        );
        serviceManager.addSingletonInstance<IPythonExecutionService>(
            IPythonExecutionService,
            pythonExecutionService.object,
        );
        serviceManager.addSingleton<IInterpreterAutoSelectionService>(
            IInterpreterAutoSelectionService,
            MockAutoSelectionService,
        );
        serviceManager.addSingleton<IInterpreterAutoSelectionProxyService>(
            IInterpreterAutoSelectionProxyService,
            MockAutoSelectionService,
        );
        installer.setup((i) => i.isInstalled(TypeMoq.It.isAny())).returns(() => Promise.resolve(true));
        serviceManager.addSingletonInstance<IInstaller>(IInstaller, installer.object);
        serviceManager.addSingletonInstance<IApplicationShell>(IApplicationShell, appShell.object);
        serviceManager.addSingletonInstance<IConfigurationService>(IConfigurationService, configService.object);

        reportActiveInterpreterChangedStub = sinon.stub(proposedApi, 'reportActiveInterpreterChanged');
    });

    teardown(() => {
        sinon.restore();
    });

    [undefined, Uri.file('xyz')].forEach((resource) => {
        const resourceTestSuffix = `(${resource ? 'with' : 'without'} a resource)`;

        test(`Refresh invokes refresh of display ${resourceTestSuffix}`, async () => {
            interpreterDisplay
                .setup((i) => i.refresh(TypeMoq.It.isValue(resource)))
                .returns(() => Promise.resolve(undefined))
                .verifiable(TypeMoq.Times.once());

            const service = new InterpreterService(serviceContainer, pyenvs.object);
            await service.refresh(resource);

            interpreterDisplay.verifyAll();
        });
    });

    test('Changes to active document should invoke interpreter.refresh method', async () => {
        const service = new InterpreterService(serviceContainer, pyenvs.object);
        const documentManager = createTypeMoq<IDocumentManager>();

        workspace.setup((w) => w.workspaceFolders).returns(() => [{ uri: '' }] as any);
        let activeTextEditorChangeHandler: (e: TextEditor | undefined) => any | undefined;
        documentManager
            .setup((d) => d.onDidChangeActiveTextEditor(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns((handler) => {
                activeTextEditorChangeHandler = handler;
                return { dispose: noop };
            });
        serviceManager.addSingletonInstance(IDocumentManager, documentManager.object);

        service.initialize();
        const textEditor = createTypeMoq<TextEditor>();
        const uri = Uri.file(path.join('usr', 'file.py'));
        const document = createTypeMoq<TextDocument>();
        textEditor.setup((t) => t.document).returns(() => document.object);
        document.setup((d) => d.uri).returns(() => uri);
        activeTextEditorChangeHandler!(textEditor.object);

        interpreterDisplay.verify((i) => i.refresh(TypeMoq.It.isValue(uri)), TypeMoq.Times.once());
    });

    test('If there is no active document then interpreter.refresh should not be invoked', async () => {
        const service = new InterpreterService(serviceContainer, pyenvs.object);
        const documentManager = createTypeMoq<IDocumentManager>();

        workspace.setup((w) => w.workspaceFolders).returns(() => [{ uri: '' }] as any);
        let activeTextEditorChangeHandler: (e?: TextEditor | undefined) => any | undefined;
        documentManager
            .setup((d) => d.onDidChangeActiveTextEditor(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns((handler) => {
                activeTextEditorChangeHandler = handler;
                return { dispose: noop };
            });
        serviceManager.addSingletonInstance(IDocumentManager, documentManager.object);

        service.initialize();
        activeTextEditorChangeHandler!();

        interpreterDisplay.verify((i) => i.refresh(TypeMoq.It.isValue(undefined)), TypeMoq.Times.never());
    });

    test('Register the correct handler', async () => {
        const service = new InterpreterService(serviceContainer, pyenvs.object);
        const documentManager = createTypeMoq<IDocumentManager>();

        workspace.setup((w) => w.workspaceFolders).returns(() => [{ uri: '' }] as any);
        let interpreterPathServiceHandler: (e: InterpreterConfigurationScope) => any | undefined = () => 0;
        documentManager
            .setup((d) => d.onDidChangeActiveTextEditor(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => ({ dispose: noop }));
        const i: InterpreterConfigurationScope = {
            uri: Uri.parse('a'),
            configTarget: ConfigurationTarget.Workspace,
        };
        configService.reset();
        configService
            .setup((c) => c.getSettings(i.uri))
            .returns(() => pythonSettings.object)
            .verifiable(TypeMoq.Times.once());
        interpreterPathService
            .setup((d) => d.onDidChange(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .callback((cb) => {
                interpreterPathServiceHandler = cb;
            })
            .returns(() => ({ dispose: noop }));
        serviceManager.addSingletonInstance(IDocumentManager, documentManager.object);
        interpreterDisplay.setup((a) => a.refresh()).returns(() => Promise.resolve());

        service.initialize();
        expect(interpreterPathServiceHandler).to.not.equal(undefined, 'Handler not set');

        await interpreterPathServiceHandler!(i);

        // Ensure correct handler was invoked
        configService.verifyAll();
    });

    test('If stored setting is an empty string, refresh the interpreter display', async () => {
        const service = new InterpreterService(serviceContainer, pyenvs.object);
        const resource = Uri.parse('a');
        const workspaceFolder = { uri: resource, name: '', index: 0 };
        workspace.setup((w) => w.getWorkspaceFolder(resource)).returns(() => workspaceFolder);
        service._pythonPathSetting = '';
        configService.reset();
        configService.setup((c) => c.getSettings(resource)).returns(() => ({ pythonPath: 'current path' } as any));
        interpreterDisplay
            .setup((i) => i.refresh())
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());
        await service._onConfigChanged(resource);
        interpreterDisplay.verifyAll();
        sinon.assert.calledOnceWithExactly(reportActiveInterpreterChangedStub, {
            path: 'current path',
            resource: workspaceFolder,
        });
    });

    test('If stored setting is not equal to current interpreter path setting, refresh the interpreter display', async () => {
        const service = new InterpreterService(serviceContainer, pyenvs.object);
        const resource = Uri.parse('a');
        const workspaceFolder = { uri: resource, name: '', index: 0 };
        workspace.setup((w) => w.getWorkspaceFolder(resource)).returns(() => workspaceFolder);
        service._pythonPathSetting = 'stored setting';
        configService.reset();
        configService.setup((c) => c.getSettings(resource)).returns(() => ({ pythonPath: 'current path' } as any));
        interpreterDisplay
            .setup((i) => i.refresh())
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());
        await service._onConfigChanged(resource);
        interpreterDisplay.verifyAll();
        sinon.assert.calledOnceWithExactly(reportActiveInterpreterChangedStub, {
            path: 'current path',
            resource: workspaceFolder,
        });
    });

    test('If stored setting is equal to current interpreter path setting, do not refresh the interpreter display', async () => {
        const service = new InterpreterService(serviceContainer, pyenvs.object);
        const resource = Uri.parse('a');
        service._pythonPathSetting = 'setting';
        configService.reset();
        configService.setup((c) => c.getSettings(resource)).returns(() => ({ pythonPath: 'setting' } as any));
        interpreterDisplay
            .setup((i) => i.refresh())
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.never());
        await service._onConfigChanged(resource);
        interpreterDisplay.verifyAll();
        expect(reportActiveInterpreterChangedStub.notCalled).to.be.equal(true);
    });
});
