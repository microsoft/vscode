// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Disposable } from 'vscode';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../common/application/types';
import { IPlatformService } from '../../common/platform/types';
import { ITerminalServiceFactory } from '../../common/terminal/types';
import { IConfigurationService, IDisposableRegistry } from '../../common/types';
import { IInterpreterService } from '../../interpreter/contracts';
import { TerminalCodeExecutionProvider } from './terminalCodeExecution';

@injectable()
export class ReplProvider extends TerminalCodeExecutionProvider {
    constructor(
        @inject(ITerminalServiceFactory) terminalServiceFactory: ITerminalServiceFactory,
        @inject(IConfigurationService) configurationService: IConfigurationService,
        @inject(IWorkspaceService) workspace: IWorkspaceService,
        @inject(IDisposableRegistry) disposableRegistry: Disposable[],
        @inject(IPlatformService) platformService: IPlatformService,
        @inject(IInterpreterService) interpreterService: IInterpreterService,
        @inject(ICommandManager) commandManager: ICommandManager,
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
        this.terminalTitle = 'REPL';
    }
}
