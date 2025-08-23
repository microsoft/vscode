// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { SwitchToDefaultLanguageServerDiagnosticService } from '../../../../client/application/diagnostics/checks/switchToDefaultLS';
import { MessageCommandPrompt } from '../../../../client/application/diagnostics/promptHandler';
import { IDiagnosticFilterService, IDiagnosticHandlerService } from '../../../../client/application/diagnostics/types';
import { IWorkspaceService } from '../../../../client/common/application/types';
import { IServiceContainer } from '../../../../client/ioc/types';
import { MockWorkspaceConfiguration } from '../../../mocks/mockWorkspaceConfig';

suite('Application Diagnostics - Switch to default LS', () => {
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    let diagnosticService: SwitchToDefaultLanguageServerDiagnosticService;
    let filterService: typemoq.IMock<IDiagnosticFilterService>;
    let messageHandler: typemoq.IMock<IDiagnosticHandlerService<MessageCommandPrompt>>;
    let workspaceService: typemoq.IMock<IWorkspaceService>;

    setup(() => {
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        filterService = typemoq.Mock.ofType<IDiagnosticFilterService>();
        messageHandler = typemoq.Mock.ofType<IDiagnosticHandlerService<MessageCommandPrompt>>();
        workspaceService = typemoq.Mock.ofType<IWorkspaceService>();

        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IDiagnosticFilterService)))
            .returns(() => filterService.object);

        diagnosticService = new SwitchToDefaultLanguageServerDiagnosticService(
            serviceContainer.object,
            workspaceService.object,
            messageHandler.object,
            [],
        );
    });

    test('When global language server is NOT Microsoft do Nothing', async () => {
        workspaceService
            .setup((w) => w.getConfiguration('python'))
            .returns(
                () =>
                    new MockWorkspaceConfiguration({
                        languageServer: {
                            globalValue: 'Default',
                            workspaceValue: undefined,
                        },
                    }),
            );

        const diagnostics = await diagnosticService.diagnose(undefined);
        expect(diagnostics.length).to.be.equals(0, 'Diagnostics should not be returned for this case');
    });
    test('When global language server is Microsoft', async () => {
        const config = new MockWorkspaceConfiguration({
            languageServer: {
                globalValue: 'Microsoft',
                workspaceValue: undefined,
            },
        });
        workspaceService.setup((w) => w.getConfiguration('python')).returns(() => config);

        const diagnostics = await diagnosticService.diagnose(undefined);
        expect(diagnostics.length).to.be.equals(1, 'Diagnostics should be returned for this case');
        const value = config.inspect<string>('languageServer');
        expect(value).to.be.equals('Default', 'Global language server value should be Default');
    });

    test('When workspace language server is NOT Microsoft do Nothing', async () => {
        workspaceService
            .setup((w) => w.getConfiguration('python'))
            .returns(
                () =>
                    new MockWorkspaceConfiguration({
                        languageServer: {
                            globalValue: undefined,
                            workspaceValue: 'Default',
                        },
                    }),
            );

        const diagnostics = await diagnosticService.diagnose(undefined);
        expect(diagnostics.length).to.be.equals(0, 'Diagnostics should not be returned for this case');
    });
    test('When workspace language server is Microsoft', async () => {
        const config = new MockWorkspaceConfiguration({
            languageServer: {
                globalValue: undefined,
                workspaceValue: 'Microsoft',
            },
        });
        workspaceService.setup((w) => w.getConfiguration('python')).returns(() => config);

        const diagnostics = await diagnosticService.diagnose(undefined);
        expect(diagnostics.length).to.be.equals(1, 'Diagnostics should be returned for this case');
        const value = config.inspect<string>('languageServer');
        expect(value).to.be.equals('Default', 'Workspace language server value should be Default');
    });
});
