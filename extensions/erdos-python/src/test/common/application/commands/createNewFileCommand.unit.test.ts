// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { TextDocument } from 'vscode';
import { Commands } from '../../../../client/common/constants';
import { CommandManager } from '../../../../client/common/application/commandManager';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../../../client/common/application/types';
import { WorkspaceService } from '../../../../client/common/application/workspace';
import { ApplicationShell } from '../../../../client/common/application/applicationShell';
import { CreatePythonFileCommandHandler } from '../../../../client/common/application/commands/createPythonFile';

suite('Create New Python File Commmand', () => {
    let createNewFileCommandHandler: CreatePythonFileCommandHandler;
    let cmdManager: ICommandManager;
    let workspaceService: IWorkspaceService;
    let appShell: IApplicationShell;

    setup(async () => {
        cmdManager = mock(CommandManager);
        workspaceService = mock(WorkspaceService);
        appShell = mock(ApplicationShell);

        createNewFileCommandHandler = new CreatePythonFileCommandHandler(
            instance(cmdManager),
            instance(workspaceService),
            instance(appShell),
            [],
        );
        when(workspaceService.openTextDocument(deepEqual({ language: 'python' }))).thenReturn(
            Promise.resolve(({} as unknown) as TextDocument),
        );
        await createNewFileCommandHandler.activate();
    });

    test('Create Python file command is registered', async () => {
        verify(cmdManager.registerCommand(Commands.CreateNewFile, anything(), anything())).once();
    });
    test('Create a Python file if command is executed', async () => {
        await createNewFileCommandHandler.createPythonFile();
        verify(workspaceService.openTextDocument(deepEqual({ language: 'python' }))).once();
        verify(appShell.showTextDocument(anything())).once();
    });
});
