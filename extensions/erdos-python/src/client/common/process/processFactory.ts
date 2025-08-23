// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import { IDisposableRegistry } from '../types';
import { IEnvironmentVariablesProvider } from '../variables/types';
import { ProcessService } from './proc';
import { IProcessLogger, IProcessService, IProcessServiceFactory } from './types';

@injectable()
export class ProcessServiceFactory implements IProcessServiceFactory {
    constructor(
        @inject(IEnvironmentVariablesProvider) private readonly envVarsService: IEnvironmentVariablesProvider,
        @inject(IProcessLogger) private readonly processLogger: IProcessLogger,
        @inject(IDisposableRegistry) private readonly disposableRegistry: IDisposableRegistry,
    ) {}
    public async create(resource?: Uri, options?: { doNotUseCustomEnvs: boolean }): Promise<IProcessService> {
        const customEnvVars = options?.doNotUseCustomEnvs
            ? undefined
            : await this.envVarsService.getEnvironmentVariables(resource);
        const proc: IProcessService = new ProcessService(customEnvVars);
        this.disposableRegistry.push(proc);
        return proc.on('exec', this.processLogger.logProcess.bind(this.processLogger));
    }
}
