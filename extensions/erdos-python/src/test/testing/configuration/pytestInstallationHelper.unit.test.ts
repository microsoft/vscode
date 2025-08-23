// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as TypeMoq from 'typemoq';
import { IApplicationShell } from '../../../client/common/application/types';
import { PytestInstallationHelper } from '../../../client/testing/configuration/pytestInstallationHelper';
import * as envExtApi from '../../../client/envExt/api.internal';

suite('PytestInstallationHelper', () => {
    let appShell: TypeMoq.IMock<IApplicationShell>;
    let helper: PytestInstallationHelper;
    let useEnvExtensionStub: sinon.SinonStub;
    let getEnvExtApiStub: sinon.SinonStub;
    let getEnvironmentStub: sinon.SinonStub;

    const workspaceUri = Uri.file('/test/workspace');

    setup(() => {
        appShell = TypeMoq.Mock.ofType<IApplicationShell>();
        helper = new PytestInstallationHelper(appShell.object);

        useEnvExtensionStub = sinon.stub(envExtApi, 'useEnvExtension');
        getEnvExtApiStub = sinon.stub(envExtApi, 'getEnvExtApi');
        getEnvironmentStub = sinon.stub(envExtApi, 'getEnvironment');
    });

    teardown(() => {
        sinon.restore();
    });

    test('promptToInstallPytest should return false if user selects ignore', async () => {
        appShell
            .setup((a) =>
                a.showInformationMessage(
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                ),
            )
            .returns(() => Promise.resolve('Ignore'))
            .verifiable(TypeMoq.Times.once());

        const result = await helper.promptToInstallPytest(workspaceUri);

        expect(result).to.be.false;
        appShell.verifyAll();
    });

    test('promptToInstallPytest should return false if user cancels', async () => {
        appShell
            .setup((a) =>
                a.showInformationMessage(
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                ),
            )
            .returns(() => Promise.resolve(undefined))
            .verifiable(TypeMoq.Times.once());

        const result = await helper.promptToInstallPytest(workspaceUri);

        expect(result).to.be.false;
        appShell.verifyAll();
    });

    test('isEnvExtensionAvailable should return result from useEnvExtension', () => {
        useEnvExtensionStub.returns(true);

        const result = helper.isEnvExtensionAvailable();

        expect(result).to.be.true;
        expect(useEnvExtensionStub.calledOnce).to.be.true;
    });

    test('promptToInstallPytest should return false if env extension not available', async () => {
        useEnvExtensionStub.returns(false);

        appShell
            .setup((a) =>
                a.showInformationMessage(
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                ),
            )
            .returns(() => Promise.resolve('Install pytest'))
            .verifiable(TypeMoq.Times.once());

        const result = await helper.promptToInstallPytest(workspaceUri);

        expect(result).to.be.false;
        appShell.verifyAll();
    });

    test('promptToInstallPytest should attempt installation when env extension is available', async () => {
        useEnvExtensionStub.returns(true);

        const mockEnvironment = { envId: { id: 'test-env', managerId: 'test-manager' } };
        const mockEnvExtApi = {
            managePackages: sinon.stub().resolves(),
        };

        getEnvExtApiStub.resolves(mockEnvExtApi);
        getEnvironmentStub.resolves(mockEnvironment);

        appShell
            .setup((a) =>
                a.showInformationMessage(
                    TypeMoq.It.is((msg: string) => msg.includes('pytest selected but not installed')),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                ),
            )
            .returns(() => Promise.resolve('Install pytest'))
            .verifiable(TypeMoq.Times.once());

        const result = await helper.promptToInstallPytest(workspaceUri);

        expect(result).to.be.true;
        expect(mockEnvExtApi.managePackages.calledOnceWithExactly(mockEnvironment, { install: ['pytest'] })).to.be.true;
        appShell.verifyAll();
    });
});
