// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { Disposable, Uri } from 'vscode';
import {
    IApplicationShell,
    ICommandManager,
    IDocumentManager,
    IWorkspaceService,
} from '../../common/application/types';
import '../../common/extensions';
import { IFileSystem, IPlatformService } from '../../common/platform/types';
import { ITerminalServiceFactory } from '../../common/terminal/types';
import { IConfigurationService, IDisposableRegistry } from '../../common/types';
import { IInterpreterService } from '../../interpreter/contracts';
import { copyPythonExecInfo, PythonExecInfo } from '../../pythonEnvironments/exec';
import { DjangoContextInitializer } from './djangoContext';
import { TerminalCodeExecutionProvider } from './terminalCodeExecution';

@injectable()
export class DjangoShellCodeExecutionProvider extends TerminalCodeExecutionProvider {
    constructor(
        @inject(ITerminalServiceFactory) terminalServiceFactory: ITerminalServiceFactory,
        @inject(IConfigurationService) configurationService: IConfigurationService,
        @inject(IWorkspaceService) workspace: IWorkspaceService,
        @inject(IDocumentManager) documentManager: IDocumentManager,
        @inject(IPlatformService) platformService: IPlatformService,
        @inject(ICommandManager) commandManager: ICommandManager,
        @inject(IFileSystem) fileSystem: IFileSystem,
        @inject(IDisposableRegistry) disposableRegistry: Disposable[],
        @inject(IInterpreterService) interpreterService: IInterpreterService,
        @inject(IApplicationShell) applicationShell: IApplicationShell,
    ) {
        super(
            terminalServiceFactory,
            configurationService,
            workspace,
            disposableRegistry,
            platformService,
            interpreterService,
            commandManager,
            applicationShell,
        );
        this.terminalTitle = 'Django Shell';
        disposableRegistry.push(new DjangoContextInitializer(documentManager, workspace, fileSystem, commandManager));
    }

    public async getExecutableInfo(resource?: Uri, args: string[] = []): Promise<PythonExecInfo> {
        const info = await super.getExecutableInfo(resource, args);

        const workspaceUri = resource ? this.workspace.getWorkspaceFolder(resource) : undefined;
        const defaultWorkspace =
            Array.isArray(this.workspace.workspaceFolders) && this.workspace.workspaceFolders.length > 0
                ? this.workspace.workspaceFolders[0].uri.fsPath
                : '';
        const workspaceRoot = workspaceUri ? workspaceUri.uri.fsPath : defaultWorkspace;
        const managePyPath = workspaceRoot.length === 0 ? 'manage.py' : path.join(workspaceRoot, 'manage.py');

        return copyPythonExecInfo(info, [managePyPath.fileToCommandArgumentForPythonExt(), 'shell']);
    }

    public async getExecuteFileArgs(resource?: Uri, executeArgs: string[] = []): Promise<PythonExecInfo> {
        // We need the executable info but not the 'manage.py shell' args
        const info = await super.getExecutableInfo(resource);
        return copyPythonExecInfo(info, executeArgs);
    }
}
