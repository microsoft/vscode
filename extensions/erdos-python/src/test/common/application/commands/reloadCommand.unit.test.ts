// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { ApplicationShell } from '../../../../client/common/application/applicationShell';
import { CommandManager } from '../../../../client/common/application/commandManager';
import { ReloadVSCodeCommandHandler } from '../../../../client/common/application/commands/reloadCommand';
import { IApplicationShell, ICommandManager } from '../../../../client/common/application/types';
import { Common } from '../../../../client/common/utils/localize';

// Defines a Mocha test suite to group tests of similar kind together
suite('Common Commands ReloadCommand', () => {
    let reloadCommandHandler: ReloadVSCodeCommandHandler;
    let appShell: IApplicationShell;
    let cmdManager: ICommandManager;
    setup(async () => {
        appShell = mock(ApplicationShell);
        cmdManager = mock(CommandManager);
        reloadCommandHandler = new ReloadVSCodeCommandHandler(instance(cmdManager), instance(appShell));
        when(cmdManager.executeCommand(anything())).thenResolve();
        await reloadCommandHandler.activate();
    });

    test('Confirm command handler is added', async () => {
        verify(cmdManager.registerCommand('python.reloadVSCode', anything(), anything())).once();
    });
    test('Display prompt to reload VS Code with message passed into command', async () => {
        const message = 'Hello World!';

        const commandHandler = capture(cmdManager.registerCommand as any).first()[1] as Function;

        await commandHandler.call(reloadCommandHandler, message);

        verify(appShell.showInformationMessage(message, Common.reload)).once();
    });
    test('Do not reload VS Code if user selects `Reload` option', async () => {
        const message = 'Hello World!';

        const commandHandler = capture(cmdManager.registerCommand as any).first()[1] as Function;

        when(appShell.showInformationMessage(message, Common.reload)).thenResolve(Common.reload as any);

        await commandHandler.call(reloadCommandHandler, message);

        verify(appShell.showInformationMessage(message, Common.reload)).once();
        verify(cmdManager.executeCommand('workbench.action.reloadWindow')).once();
    });
    test('Do not reload VS Code if user does not select `Reload` option', async () => {
        const message = 'Hello World!';

        const commandHandler = capture(cmdManager.registerCommand as any).first()[1] as Function;
        when(appShell.showInformationMessage(message, Common.reload)).thenResolve();

        await commandHandler.call(reloadCommandHandler, message);

        verify(appShell.showInformationMessage(message, Common.reload)).once();
        verify(cmdManager.executeCommand('workbench.action.reloadWindow')).never();
    });
});
