// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import { IApplicationShell, ICommandManager } from '../common/application/types';
import { IInstaller } from '../common/types';
import { IInterpreterService } from '../interpreter/contracts';
import { TensorBoardSession } from './tensorBoardSession';

@injectable()
export class TensorboardDependencyChecker {
    constructor(
        @inject(IInstaller) private readonly installer: IInstaller,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IApplicationShell) private readonly applicationShell: IApplicationShell,
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
    ) {}

    public async ensureDependenciesAreInstalled(resource?: Uri): Promise<boolean> {
        const newSession = new TensorBoardSession(
            this.installer,
            this.interpreterService,
            this.commandManager,
            this.applicationShell,
        );
        const result = await newSession.ensurePrerequisitesAreInstalled(resource);
        return result;
    }
}
