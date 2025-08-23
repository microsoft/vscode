// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { ExecuteVSCCommand } from '../../../../client/application/diagnostics/commands/execVSCCommand';
import { DiagnosticsCommandFactory } from '../../../../client/application/diagnostics/commands/factory';
import { IDiagnosticsCommandFactory } from '../../../../client/application/diagnostics/commands/types';
import { IDiagnostic } from '../../../../client/application/diagnostics/types';
import { ICommandManager } from '../../../../client/common/application/types';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Exec VSC Commands', () => {
    let commandFactory: IDiagnosticsCommandFactory;
    let commandManager: typemoq.IMock<ICommandManager>;
    setup(() => {
        const serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        commandManager = typemoq.Mock.ofType<ICommandManager>();
        serviceContainer
            .setup((svc) => svc.get<ICommandManager>(typemoq.It.isValue(ICommandManager), typemoq.It.isAny()))
            .returns(() => commandManager.object);
        commandFactory = new DiagnosticsCommandFactory(serviceContainer.object);
    });

    test('Test creation of VSC Command', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();

        const command = commandFactory.createCommand(diagnostic.object, {
            type: 'executeVSCCommand',
            options: 'editor.action.formatDocument',
        });
        expect(command).to.be.instanceOf(ExecuteVSCCommand);
    });

    test('Test execution of VSC Command', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        commandManager
            .setup((cmd) => cmd.executeCommand('editor.action.formatDocument'))
            .returns(() => Promise.resolve(undefined))
            .verifiable(typemoq.Times.once());

        const command = commandFactory.createCommand(diagnostic.object, {
            type: 'executeVSCCommand',
            options: 'editor.action.formatDocument',
        });
        await command.invoke();

        expect(command).to.be.instanceOf(ExecuteVSCCommand);
        commandManager.verifyAll();
    });
});
