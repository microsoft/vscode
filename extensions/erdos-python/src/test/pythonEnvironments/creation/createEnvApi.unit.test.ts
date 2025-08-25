// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { assert, use as chaiUse } from 'chai';
import { ConfigurationTarget, Uri } from 'vscode';
import { IDisposableRegistry, IPathUtils } from '../../../client/common/types';
import * as commandApis from '../../../client/common/vscodeApis/commandApis';
import {
    IInterpreterQuickPick,
    IPythonPathUpdaterServiceManager,
} from '../../../client/interpreter/configuration/types';
import { registerCreateEnvironmentFeatures } from '../../../client/pythonEnvironments/creation/createEnvApi';
import * as windowApis from '../../../client/common/vscodeApis/windowApis';
import { handleCreateEnvironmentCommand } from '../../../client/pythonEnvironments/creation/createEnvironment';
import { CreateEnvironmentProvider } from '../../../client/pythonEnvironments/creation/proposed.createEnvApis';

chaiUse(chaiAsPromised.default);

suite('Create Environment APIs', () => {
    let registerCommandStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    const disposables: IDisposableRegistry = [];
    let interpreterQuickPick: typemoq.IMock<IInterpreterQuickPick>;
    let interpreterPathService: typemoq.IMock<IPythonPathUpdaterServiceManager>;
    let pathUtils: typemoq.IMock<IPathUtils>;

    setup(() => {
        showQuickPickStub = sinon.stub(windowApis, 'showQuickPick');
        showInformationMessageStub = sinon.stub(windowApis, 'showInformationMessage');

        registerCommandStub = sinon.stub(commandApis, 'registerCommand');
        interpreterQuickPick = typemoq.Mock.ofType<IInterpreterQuickPick>();
        interpreterPathService = typemoq.Mock.ofType<IPythonPathUpdaterServiceManager>();
        pathUtils = typemoq.Mock.ofType<IPathUtils>();

        registerCommandStub.callsFake((_command: string, _callback: (...args: any[]) => any) => ({
            dispose: () => {
                // Do nothing
            },
        }));

        pathUtils.setup((p) => p.getDisplayName(typemoq.It.isAny())).returns(() => 'test');

        registerCreateEnvironmentFeatures(
            disposables,
            interpreterQuickPick.object,
            interpreterPathService.object,
            pathUtils.object,
            {} as any, // IPythonRuntimeManager mock
        );
    });
    teardown(() => {
        disposables.forEach((d) => d.dispose());
        sinon.restore();
    });

    [true, false].forEach((selectEnvironment) => {
        test(`Set environment selectEnvironment == ${selectEnvironment}`, async () => {
            const workspace1 = {
                uri: Uri.file('/path/to/env'),
                name: 'workspace1',
                index: 0,
            };
            const provider = typemoq.Mock.ofType<CreateEnvironmentProvider>();
            provider.setup((p) => p.name).returns(() => 'test');
            provider.setup((p) => p.id).returns(() => 'test-id');
            provider.setup((p) => p.description).returns(() => 'test-description');
            provider
                .setup((p) => p.createEnvironment(typemoq.It.isAny()))
                .returns(() =>
                    Promise.resolve({
                        path: '/path/to/env',
                        workspaceFolder: workspace1,
                        action: undefined,
                        error: undefined,
                    }),
                );
            provider.setup((p) => (p as any).then).returns(() => undefined);

            showQuickPickStub.resolves(provider.object);

            interpreterPathService
                .setup((p) =>
                    p.updatePythonPath(
                        typemoq.It.isValue('/path/to/env'),
                        ConfigurationTarget.WorkspaceFolder,
                        'ui',
                        typemoq.It.isAny(),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(selectEnvironment ? typemoq.Times.once() : typemoq.Times.never());

            await handleCreateEnvironmentCommand([provider.object], { selectEnvironment });

            assert.ok(showQuickPickStub.calledOnce);
            assert.ok(selectEnvironment ? showInformationMessageStub.calledOnce : showInformationMessageStub.notCalled);
            interpreterPathService.verifyAll();
        });
    });
});
