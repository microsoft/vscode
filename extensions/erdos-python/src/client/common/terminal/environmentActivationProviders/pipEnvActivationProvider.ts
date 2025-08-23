// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, named } from 'inversify';
import { Uri } from 'vscode';
import '../../extensions';
import { IInterpreterService } from '../../../interpreter/contracts';
import { isPipenvEnvironmentRelatedToFolder } from '../../../pythonEnvironments/common/environmentManagers/pipenv';
import { EnvironmentType } from '../../../pythonEnvironments/info';
import { IWorkspaceService } from '../../application/types';
import { IToolExecutionPath, ToolExecutionPath } from '../../types';
import { ITerminalActivationCommandProvider } from '../types';

@injectable()
export class PipEnvActivationCommandProvider implements ITerminalActivationCommandProvider {
    constructor(
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IToolExecutionPath)
        @named(ToolExecutionPath.pipenv)
        private readonly pipEnvExecution: IToolExecutionPath,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
    ) {}

    // eslint-disable-next-line class-methods-use-this
    public isShellSupported(): boolean {
        return false;
    }

    public async getActivationCommands(resource: Uri | undefined): Promise<string[] | undefined> {
        const interpreter = await this.interpreterService.getActiveInterpreter(resource);
        if (!interpreter || interpreter.envType !== EnvironmentType.Pipenv) {
            return undefined;
        }
        // Activate using `pipenv shell` only if the current folder relates pipenv environment.
        const workspaceFolder = resource ? this.workspaceService.getWorkspaceFolder(resource) : undefined;
        if (workspaceFolder) {
            if (!(await isPipenvEnvironmentRelatedToFolder(interpreter.path, workspaceFolder?.uri.fsPath))) {
                return undefined;
            }
        }
        const execName = this.pipEnvExecution.executable;
        return [`${execName.fileToCommandArgumentForPythonExt()} shell`];
    }

    public async getActivationCommandsForInterpreter(pythonPath: string): Promise<string[] | undefined> {
        const interpreter = await this.interpreterService.getInterpreterDetails(pythonPath);
        if (!interpreter || interpreter.envType !== EnvironmentType.Pipenv) {
            return undefined;
        }

        const execName = this.pipEnvExecution.executable;
        return [`${execName.fileToCommandArgumentForPythonExt()} shell`];
    }
}
