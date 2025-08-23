// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import { assert } from 'chai';
import * as typemoq from 'typemoq';
import {
    Disposable,
    Terminal,
    TerminalShellExecution,
    TerminalShellExecutionStartEvent,
    TerminalShellIntegration,
    Uri,
} from 'vscode';
import * as triggerUtils from '../../../client/pythonEnvironments/creation/common/createEnvTriggerUtils';
import * as windowApis from '../../../client/common/vscodeApis/windowApis';
import * as workspaceApis from '../../../client/common/vscodeApis/workspaceApis';
import * as commandApis from '../../../client/common/vscodeApis/commandApis';
import { registerTriggerForPipInTerminal } from '../../../client/pythonEnvironments/creation/globalPipInTerminalTrigger';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../constants';
import { Common, CreateEnv } from '../../../client/common/utils/localize';

suite('Global Pip in Terminal Trigger', () => {
    let shouldPromptToCreateEnvStub: sinon.SinonStub;
    let getWorkspaceFoldersStub: sinon.SinonStub;
    let getWorkspaceFolderStub: sinon.SinonStub;
    let isGlobalPythonSelectedStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;
    let disableCreateEnvironmentTriggerStub: sinon.SinonStub;
    let onDidStartTerminalShellExecutionStub: sinon.SinonStub;
    let handler: undefined | ((e: TerminalShellExecutionStartEvent) => Promise<void>);
    let execEvent: typemoq.IMock<TerminalShellExecutionStartEvent>;
    let shellIntegration: typemoq.IMock<TerminalShellIntegration>;

    const workspace1 = {
        uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
        name: 'workspace1',
        index: 0,
    };

    const outsideWorkspace = Uri.file(
        path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'outsideWorkspace'),
    );

    setup(() => {
        shouldPromptToCreateEnvStub = sinon.stub(triggerUtils, 'shouldPromptToCreateEnv');

        getWorkspaceFoldersStub = sinon.stub(workspaceApis, 'getWorkspaceFolders');
        getWorkspaceFoldersStub.returns([workspace1]);

        getWorkspaceFolderStub = sinon.stub(workspaceApis, 'getWorkspaceFolder');
        getWorkspaceFolderStub.returns(workspace1);

        isGlobalPythonSelectedStub = sinon.stub(triggerUtils, 'isGlobalPythonSelected');
        showWarningMessageStub = sinon.stub(windowApis, 'showWarningMessage');

        executeCommandStub = sinon.stub(commandApis, 'executeCommand');
        executeCommandStub.resolves({ path: 'some/python' });

        disableCreateEnvironmentTriggerStub = sinon.stub(triggerUtils, 'disableCreateEnvironmentTrigger');

        onDidStartTerminalShellExecutionStub = sinon.stub(windowApis, 'onDidStartTerminalShellExecution');
        onDidStartTerminalShellExecutionStub.callsFake((cb) => {
            handler = cb;
            return {
                dispose: () => {
                    handler = undefined;
                },
            };
        });

        shellIntegration = typemoq.Mock.ofType<TerminalShellIntegration>();
        execEvent = typemoq.Mock.ofType<TerminalShellExecutionStartEvent>();
        execEvent.setup((e) => e.shellIntegration).returns(() => shellIntegration.object);
        shellIntegration
            .setup((s) => s.executeCommand(typemoq.It.isAnyString()))
            .returns(() => (({} as unknown) as TerminalShellExecution));
    });

    teardown(() => {
        sinon.restore();
    });

    test('Should not prompt to create environment if setting is off', async () => {
        shouldPromptToCreateEnvStub.returns(false);

        const disposables: Disposable[] = [];
        registerTriggerForPipInTerminal(disposables);

        assert.strictEqual(disposables.length, 0);
        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
    });

    test('Should not prompt to create environment if no workspace folders', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        getWorkspaceFoldersStub.returns([]);

        const disposables: Disposable[] = [];
        registerTriggerForPipInTerminal(disposables);

        assert.strictEqual(disposables.length, 0);
        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(getWorkspaceFoldersStub);
    });

    test('Should not prompt to create environment if workspace folder is not found', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        getWorkspaceFolderStub.returns(undefined);

        const disposables: Disposable[] = [];
        registerTriggerForPipInTerminal(disposables);

        shellIntegration.setup((s) => s.cwd).returns(() => outsideWorkspace);
        await handler?.(({ shellIntegration: shellIntegration.object } as unknown) as TerminalShellExecutionStartEvent);

        assert.strictEqual(disposables.length, 1);
        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(getWorkspaceFolderStub);
        sinon.assert.notCalled(isGlobalPythonSelectedStub);
        sinon.assert.notCalled(showWarningMessageStub);
    });

    test('Should not prompt to create environment if global python is not selected', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        isGlobalPythonSelectedStub.returns(false);

        const disposables: Disposable[] = [];
        registerTriggerForPipInTerminal(disposables);

        await handler?.(({ shellIntegration: shellIntegration.object } as unknown) as TerminalShellExecutionStartEvent);

        assert.strictEqual(disposables.length, 1);
        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(getWorkspaceFolderStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);

        sinon.assert.notCalled(showWarningMessageStub);
    });

    test('Should not prompt to create environment if command is not trusted', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        isGlobalPythonSelectedStub.returns(true);

        const disposables: Disposable[] = [];
        registerTriggerForPipInTerminal(disposables);

        await handler?.({
            terminal: ({} as unknown) as Terminal,
            shellIntegration: shellIntegration.object,
            execution: {
                cwd: workspace1.uri,
                commandLine: {
                    isTrusted: false,
                    value: 'pip install',
                    confidence: 0,
                },
                read: () =>
                    (async function* () {
                        yield Promise.resolve('pip install');
                    })(),
            },
        });

        assert.strictEqual(disposables.length, 1);
        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(getWorkspaceFolderStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);

        sinon.assert.notCalled(showWarningMessageStub);
    });

    test('Should not prompt to create environment if command does not start with pip install', async () => {
        shouldPromptToCreateEnvStub.returns(true);
        isGlobalPythonSelectedStub.returns(true);

        const disposables: Disposable[] = [];
        registerTriggerForPipInTerminal(disposables);

        await handler?.({
            terminal: ({} as unknown) as Terminal,
            shellIntegration: shellIntegration.object,
            execution: {
                cwd: workspace1.uri,
                commandLine: {
                    isTrusted: false,
                    value: 'some command pip install',
                    confidence: 0,
                },
                read: () =>
                    (async function* () {
                        yield Promise.resolve('pip install');
                    })(),
            },
        });

        assert.strictEqual(disposables.length, 1);
        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(getWorkspaceFolderStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);

        sinon.assert.notCalled(showWarningMessageStub);
    });

    ['pip install', 'pip3 install', 'python -m pip install', 'python3 -m pip install'].forEach((command) => {
        test(`Should prompt to create environment if all conditions are met: ${command}`, async () => {
            shouldPromptToCreateEnvStub.returns(true);
            isGlobalPythonSelectedStub.returns(true);
            showWarningMessageStub.resolves(CreateEnv.Trigger.createEnvironment);

            const disposables: Disposable[] = [];
            registerTriggerForPipInTerminal(disposables);

            await handler?.({
                terminal: ({} as unknown) as Terminal,
                shellIntegration: shellIntegration.object,
                execution: {
                    cwd: workspace1.uri,
                    commandLine: {
                        isTrusted: true,
                        value: command,
                        confidence: 0,
                    },
                    read: () =>
                        (async function* () {
                            yield Promise.resolve(command);
                        })(),
                },
            });

            assert.strictEqual(disposables.length, 1);
            sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
            sinon.assert.calledOnce(getWorkspaceFolderStub);
            sinon.assert.calledOnce(isGlobalPythonSelectedStub);
            sinon.assert.calledOnce(showWarningMessageStub);
            sinon.assert.calledOnce(executeCommandStub);
            sinon.assert.notCalled(disableCreateEnvironmentTriggerStub);

            shellIntegration.verify((s) => s.executeCommand(typemoq.It.isAnyString()), typemoq.Times.once());
        });
    });

    test("Should disable create environment trigger if user selects don't show again", async () => {
        shouldPromptToCreateEnvStub.returns(true);

        isGlobalPythonSelectedStub.returns(true);
        showWarningMessageStub.resolves(Common.doNotShowAgain);

        const disposables: Disposable[] = [];
        registerTriggerForPipInTerminal(disposables);

        await handler?.({
            terminal: ({} as unknown) as Terminal,
            shellIntegration: shellIntegration.object,
            execution: {
                cwd: workspace1.uri,
                commandLine: {
                    isTrusted: true,
                    value: 'pip install',
                    confidence: 0,
                },
                read: () =>
                    (async function* () {
                        yield Promise.resolve('pip install');
                    })(),
            },
        });

        assert.strictEqual(disposables.length, 1);
        sinon.assert.calledOnce(shouldPromptToCreateEnvStub);
        sinon.assert.calledOnce(getWorkspaceFolderStub);
        sinon.assert.calledOnce(isGlobalPythonSelectedStub);
        sinon.assert.calledOnce(showWarningMessageStub);
        sinon.assert.notCalled(executeCommandStub);
        sinon.assert.calledOnce(disableCreateEnvironmentTriggerStub);
    });
});
