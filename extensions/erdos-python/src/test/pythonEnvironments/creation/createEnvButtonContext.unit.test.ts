// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { assert, use as chaiUse } from 'chai';
import { WorkspaceConfiguration } from 'vscode';
import * as cmdApis from '../../../client/common/vscodeApis/commandApis';
import * as workspaceApis from '../../../client/common/vscodeApis/workspaceApis';
import { IDisposableRegistry } from '../../../client/common/types';
import { registerCreateEnvironmentButtonFeatures } from '../../../client/pythonEnvironments/creation/createEnvButtonContext';

chaiUse(chaiAsPromised.default);

class FakeDisposable {
    public dispose() {
        // Do nothing
    }
}

suite('Create Env content button settings tests', () => {
    let executeCommandStub: sinon.SinonStub;
    const disposables: IDisposableRegistry = [];
    let onDidChangeConfigurationStub: sinon.SinonStub;
    let getConfigurationStub: sinon.SinonStub;
    let configMock: typemoq.IMock<WorkspaceConfiguration>;

    setup(() => {
        executeCommandStub = sinon.stub(cmdApis, 'executeCommand');
        getConfigurationStub = sinon.stub(workspaceApis, 'getConfiguration');
        onDidChangeConfigurationStub = sinon.stub(workspaceApis, 'onDidChangeConfiguration');
        onDidChangeConfigurationStub.returns(new FakeDisposable());

        configMock = typemoq.Mock.ofType<WorkspaceConfiguration>();
        configMock.setup((c) => c.get<string>(typemoq.It.isAny(), typemoq.It.isAny())).returns(() => 'show');
        getConfigurationStub.returns(configMock.object);
    });

    teardown(() => {
        sinon.restore();
        disposables.forEach((d) => d.dispose());
    });

    test('python.createEnvironment.contentButton setting is set to "show", no files open', async () => {
        registerCreateEnvironmentButtonFeatures(disposables);

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'showCreateEnvButton', true));
    });

    test('python.createEnvironment.contentButton setting is set to "hide", no files open', async () => {
        configMock.reset();
        configMock.setup((c) => c.get<string>(typemoq.It.isAny(), typemoq.It.isAny())).returns(() => 'hide');

        registerCreateEnvironmentButtonFeatures(disposables);

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'showCreateEnvButton', false));
    });

    test('python.createEnvironment.contentButton setting changed from "hide" to "show"', async () => {
        configMock.reset();
        configMock.setup((c) => c.get<string>(typemoq.It.isAny(), typemoq.It.isAny())).returns(() => 'hide');

        let handler: () => void = () => {
            /* do nothing */
        };
        onDidChangeConfigurationStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        registerCreateEnvironmentButtonFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'showCreateEnvButton', false));
        executeCommandStub.reset();

        configMock.reset();
        configMock.setup((c) => c.get<string>(typemoq.It.isAny(), typemoq.It.isAny())).returns(() => 'show');
        handler();

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'showCreateEnvButton', true));
    });

    test('python.createEnvironment.contentButton setting changed from "show" to "hide"', async () => {
        configMock.reset();
        configMock.setup((c) => c.get<string>(typemoq.It.isAny(), typemoq.It.isAny())).returns(() => 'show');

        let handler: () => void = () => {
            /* do nothing */
        };
        onDidChangeConfigurationStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        registerCreateEnvironmentButtonFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'showCreateEnvButton', true));
        executeCommandStub.reset();

        configMock.reset();
        configMock.setup((c) => c.get<string>(typemoq.It.isAny(), typemoq.It.isAny())).returns(() => 'hide');
        handler();

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'showCreateEnvButton', false));
    });
});
