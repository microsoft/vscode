// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';
import { anything, deepEqual, instance, mock, reset, verify, when } from 'ts-mockito';
import { ConfigurationTarget, Disposable, Uri } from 'vscode';
import { ApplicationShell } from '../../../client/common/application/applicationShell';
import { IApplicationShell } from '../../../client/common/application/types';
import { PersistentStateFactory } from '../../../client/common/persistentState';
import { IPersistentState, IPersistentStateFactory } from '../../../client/common/types';
import { Common } from '../../../client/common/utils/localize';
import { PythonPathUpdaterService } from '../../../client/interpreter/configuration/pythonPathUpdaterService';
import { IPythonPathUpdaterServiceManager } from '../../../client/interpreter/configuration/types';
import { IComponentAdapter, IInterpreterHelper, IInterpreterService } from '../../../client/interpreter/contracts';
import { InterpreterHelper } from '../../../client/interpreter/helpers';
import { VirtualEnvironmentPrompt } from '../../../client/interpreter/virtualEnvs/virtualEnvPrompt';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';
import * as createEnvApi from '../../../client/pythonEnvironments/creation/createEnvApi';

suite('Virtual Environment Prompt', () => {
    class VirtualEnvironmentPromptTest extends VirtualEnvironmentPrompt {
        public async handleNewEnvironment(resource: Uri): Promise<void> {
            await super.handleNewEnvironment(resource);
        }

        public async notifyUser(interpreter: PythonEnvironment, resource: Uri): Promise<void> {
            await super.notifyUser(interpreter, resource);
        }
    }
    let persistentStateFactory: IPersistentStateFactory;
    let helper: IInterpreterHelper;
    let pythonPathUpdaterService: IPythonPathUpdaterServiceManager;
    let disposable: Disposable;
    let appShell: IApplicationShell;
    let componentAdapter: IComponentAdapter;
    let interpreterService: IInterpreterService;
    let environmentPrompt: VirtualEnvironmentPromptTest;
    let isCreatingEnvironmentStub: sinon.SinonStub;
    setup(() => {
        persistentStateFactory = mock(PersistentStateFactory);
        helper = mock(InterpreterHelper);
        pythonPathUpdaterService = mock(PythonPathUpdaterService);
        componentAdapter = mock<IComponentAdapter>();
        interpreterService = mock<IInterpreterService>();
        isCreatingEnvironmentStub = sinon.stub(createEnvApi, 'isCreatingEnvironment');
        isCreatingEnvironmentStub.returns(false);
        when(interpreterService.getActiveInterpreter(anything())).thenResolve(({
            id: 'selected',
            path: 'path/to/selected',
        } as unknown) as PythonEnvironment);
        disposable = mock(Disposable);
        appShell = mock(ApplicationShell);
        environmentPrompt = new VirtualEnvironmentPromptTest(
            instance(persistentStateFactory),
            instance(helper),
            instance(pythonPathUpdaterService),
            [instance(disposable)],
            instance(appShell),
            instance(componentAdapter),
            instance(interpreterService),
        );
    });

    teardown(() => {
        sinon.restore();
    });

    test('User is notified if interpreter exists and only python path to global interpreter is specified in settings', async () => {
        const resource = Uri.file('a');
        const interpreter1 = { path: 'path/to/interpreter1' };
        const interpreter2 = { path: 'path/to/interpreter2' };
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const notificationPromptEnabled = TypeMoq.Mock.ofType<IPersistentState<boolean>>();

        when(componentAdapter.getWorkspaceVirtualEnvInterpreters(resource)).thenResolve([
            interpreter1,
            interpreter2,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(helper.getBestInterpreter(deepEqual([interpreter1, interpreter2] as any))).thenReturn(interpreter2 as any);
        when(persistentStateFactory.createWorkspacePersistentState(anything(), true)).thenReturn(
            notificationPromptEnabled.object,
        );
        notificationPromptEnabled.setup((n) => n.value).returns(() => true);
        when(appShell.showInformationMessage(anything(), ...prompts)).thenResolve();

        await environmentPrompt.handleNewEnvironment(resource);

        verify(appShell.showInformationMessage(anything(), ...prompts)).once();
    });

    test('User is not notified if currently selected interpreter is the same as new interpreter', async () => {
        const resource = Uri.file('a');
        const interpreter1 = { path: 'path/to/interpreter1' };
        const interpreter2 = { path: 'path/to/interpreter2' };
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const notificationPromptEnabled = TypeMoq.Mock.ofType<IPersistentState<boolean>>();

        // Return interpreters using the component adapter instead
        when(componentAdapter.getWorkspaceVirtualEnvInterpreters(resource)).thenResolve([
            interpreter1,
            interpreter2,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(helper.getBestInterpreter(deepEqual([interpreter1, interpreter2] as any))).thenReturn(interpreter2 as any);
        reset(interpreterService);
        when(interpreterService.getActiveInterpreter(anything())).thenResolve(
            (interpreter2 as unknown) as PythonEnvironment,
        );
        when(persistentStateFactory.createWorkspacePersistentState(anything(), true)).thenReturn(
            notificationPromptEnabled.object,
        );
        notificationPromptEnabled.setup((n) => n.value).returns(() => true);
        when(appShell.showInformationMessage(anything(), ...prompts)).thenResolve();

        await environmentPrompt.handleNewEnvironment(resource);

        verify(appShell.showInformationMessage(anything(), ...prompts)).never();
    });
    test('User is notified if interpreter exists and only python path to global interpreter is specified in settings', async () => {
        const resource = Uri.file('a');
        const interpreter1 = { path: 'path/to/interpreter1' };
        const interpreter2 = { path: 'path/to/interpreter2' };
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const notificationPromptEnabled = TypeMoq.Mock.ofType<IPersistentState<boolean>>();

        // Return interpreters using the component adapter instead
        when(componentAdapter.getWorkspaceVirtualEnvInterpreters(resource)).thenResolve([
            interpreter1,
            interpreter2,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(helper.getBestInterpreter(deepEqual([interpreter1, interpreter2] as any))).thenReturn(interpreter2 as any);
        when(persistentStateFactory.createWorkspacePersistentState(anything(), true)).thenReturn(
            notificationPromptEnabled.object,
        );
        notificationPromptEnabled.setup((n) => n.value).returns(() => true);
        when(appShell.showInformationMessage(anything(), ...prompts)).thenResolve();

        await environmentPrompt.handleNewEnvironment(resource);

        verify(appShell.showInformationMessage(anything(), ...prompts)).once();
    });

    test("If user selects 'Yes', python path is updated", async () => {
        const resource = Uri.file('a');
        const interpreter1 = { path: 'path/to/interpreter1' };
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const notificationPromptEnabled = TypeMoq.Mock.ofType<IPersistentState<boolean>>();
        when(persistentStateFactory.createWorkspacePersistentState(anything(), true)).thenReturn(
            notificationPromptEnabled.object,
        );
        notificationPromptEnabled.setup((n) => n.value).returns(() => true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(appShell.showInformationMessage(anything(), ...prompts)).thenResolve(prompts[0] as any);
        when(
            pythonPathUpdaterService.updatePythonPath(
                interpreter1.path,
                ConfigurationTarget.WorkspaceFolder,
                'ui',
                resource,
            ),
        ).thenResolve();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await environmentPrompt.notifyUser(interpreter1 as any, resource);

        verify(persistentStateFactory.createWorkspacePersistentState(anything(), true)).once();
        verify(appShell.showInformationMessage(anything(), ...prompts)).once();
        verify(
            pythonPathUpdaterService.updatePythonPath(
                interpreter1.path,
                ConfigurationTarget.WorkspaceFolder,
                'ui',
                resource,
            ),
        ).once();
    });

    test("If user selects 'No', no operation is performed", async () => {
        const resource = Uri.file('a');
        const interpreter1 = { path: 'path/to/interpreter1' };
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const notificationPromptEnabled = TypeMoq.Mock.ofType<IPersistentState<boolean>>();
        when(persistentStateFactory.createWorkspacePersistentState(anything(), true)).thenReturn(
            notificationPromptEnabled.object,
        );
        notificationPromptEnabled.setup((n) => n.value).returns(() => true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(appShell.showInformationMessage(anything(), ...prompts)).thenResolve(prompts[1] as any);
        when(
            pythonPathUpdaterService.updatePythonPath(
                interpreter1.path,
                ConfigurationTarget.WorkspaceFolder,
                'ui',
                resource,
            ),
        ).thenResolve();
        notificationPromptEnabled
            .setup((n) => n.updateValue(false))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.never());

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await environmentPrompt.notifyUser(interpreter1 as any, resource);

        verify(persistentStateFactory.createWorkspacePersistentState(anything(), true)).once();
        verify(appShell.showInformationMessage(anything(), ...prompts)).once();
        verify(
            pythonPathUpdaterService.updatePythonPath(
                interpreter1.path,
                ConfigurationTarget.WorkspaceFolder,
                'ui',
                resource,
            ),
        ).never();
        notificationPromptEnabled.verifyAll();
    });

    test('If user selects "Don\'t show again", prompt is disabled', async () => {
        const resource = Uri.file('a');
        const interpreter1 = { path: 'path/to/interpreter1' };
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const notificationPromptEnabled = TypeMoq.Mock.ofType<IPersistentState<boolean>>();
        when(persistentStateFactory.createWorkspacePersistentState(anything(), true)).thenReturn(
            notificationPromptEnabled.object,
        );
        notificationPromptEnabled.setup((n) => n.value).returns(() => true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(appShell.showInformationMessage(anything(), ...prompts)).thenResolve(prompts[2] as any);
        notificationPromptEnabled
            .setup((n) => n.updateValue(false))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await environmentPrompt.notifyUser(interpreter1 as any, resource);

        verify(persistentStateFactory.createWorkspacePersistentState(anything(), true)).once();
        verify(appShell.showInformationMessage(anything(), ...prompts)).once();
        notificationPromptEnabled.verifyAll();
    });

    test('If prompt is disabled, no notification is shown', async () => {
        const resource = Uri.file('a');
        const interpreter1 = { path: 'path/to/interpreter1' };
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const notificationPromptEnabled = TypeMoq.Mock.ofType<IPersistentState<boolean>>();
        when(persistentStateFactory.createWorkspacePersistentState(anything(), true)).thenReturn(
            notificationPromptEnabled.object,
        );
        notificationPromptEnabled.setup((n) => n.value).returns(() => false);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(appShell.showInformationMessage(anything(), ...prompts)).thenResolve(prompts[0] as any);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await environmentPrompt.notifyUser(interpreter1 as any, resource);

        verify(persistentStateFactory.createWorkspacePersistentState(anything(), true)).once();
        verify(appShell.showInformationMessage(anything(), ...prompts)).never();
    });

    test('If environment is being created, no notification is shown', async () => {
        isCreatingEnvironmentStub.reset();
        isCreatingEnvironmentStub.returns(true);

        const resource = Uri.file('a');
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];

        await environmentPrompt.handleNewEnvironment(resource);

        verify(persistentStateFactory.createWorkspacePersistentState(anything(), true)).never();
        verify(appShell.showInformationMessage(anything(), ...prompts)).never();
    });
});
