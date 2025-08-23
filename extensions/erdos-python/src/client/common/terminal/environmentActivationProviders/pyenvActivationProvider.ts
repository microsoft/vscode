// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import { IInterpreterService } from '../../../interpreter/contracts';
import { IServiceContainer } from '../../../ioc/types';
import { EnvironmentType } from '../../../pythonEnvironments/info';
import { ITerminalActivationCommandProvider, TerminalShellType } from '../types';

@injectable()
export class PyEnvActivationCommandProvider implements ITerminalActivationCommandProvider {
    constructor(@inject(IServiceContainer) private readonly serviceContainer: IServiceContainer) {}

    // eslint-disable-next-line class-methods-use-this
    public isShellSupported(_targetShell: TerminalShellType): boolean {
        return true;
    }

    public async getActivationCommands(resource: Uri | undefined, _: TerminalShellType): Promise<string[] | undefined> {
        const interpreter = await this.serviceContainer
            .get<IInterpreterService>(IInterpreterService)
            .getActiveInterpreter(resource);
        if (!interpreter || interpreter.envType !== EnvironmentType.Pyenv || !interpreter.envName) {
            return undefined;
        }

        return [`pyenv shell ${interpreter.envName.toCommandArgumentForPythonExt()}`];
    }

    public async getActivationCommandsForInterpreter(
        pythonPath: string,
        _targetShell: TerminalShellType,
    ): Promise<string[] | undefined> {
        const interpreter = await this.serviceContainer
            .get<IInterpreterService>(IInterpreterService)
            .getInterpreterDetails(pythonPath);
        if (!interpreter || interpreter.envType !== EnvironmentType.Pyenv || !interpreter.envName) {
            return undefined;
        }

        return [`pyenv shell ${interpreter.envName.toCommandArgumentForPythonExt()}`];
    }
}
