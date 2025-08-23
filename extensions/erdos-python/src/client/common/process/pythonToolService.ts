// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import { IServiceContainer } from '../../ioc/types';
import { ExecutionInfo } from '../types';
import {
    ExecutionResult,
    IProcessServiceFactory,
    IPythonExecutionFactory,
    IPythonToolExecutionService,
    ObservableExecutionResult,
    SpawnOptions,
} from './types';

@injectable()
export class PythonToolExecutionService implements IPythonToolExecutionService {
    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {}
    public async execObservable(
        executionInfo: ExecutionInfo,
        options: SpawnOptions,
        resource: Uri,
    ): Promise<ObservableExecutionResult<string>> {
        if (options.env) {
            throw new Error('Environment variables are not supported');
        }
        if (executionInfo.moduleName && executionInfo.moduleName.length > 0) {
            const pythonExecutionService = await this.serviceContainer
                .get<IPythonExecutionFactory>(IPythonExecutionFactory)
                .create({ resource });
            return pythonExecutionService.execModuleObservable(executionInfo.moduleName, executionInfo.args, options);
        } else {
            const processService = await this.serviceContainer
                .get<IProcessServiceFactory>(IProcessServiceFactory)
                .create(resource);
            return processService.execObservable(executionInfo.execPath!, executionInfo.args, { ...options });
        }
    }
    public async exec(
        executionInfo: ExecutionInfo,
        options: SpawnOptions,
        resource: Uri,
    ): Promise<ExecutionResult<string>> {
        if (options.env) {
            throw new Error('Environment variables are not supported');
        }
        if (executionInfo.moduleName && executionInfo.moduleName.length > 0) {
            const pythonExecutionService = await this.serviceContainer
                .get<IPythonExecutionFactory>(IPythonExecutionFactory)
                .create({ resource });
            return pythonExecutionService.execModule(executionInfo.moduleName, executionInfo.args, options);
        } else {
            const processService = await this.serviceContainer
                .get<IProcessServiceFactory>(IProcessServiceFactory)
                .create(resource);
            return processService.exec(executionInfo.execPath!, executionInfo.args, { ...options });
        }
    }

    public async execForLinter(
        executionInfo: ExecutionInfo,
        options: SpawnOptions,
        resource: Uri,
    ): Promise<ExecutionResult<string>> {
        if (options.env) {
            throw new Error('Environment variables are not supported');
        }
        const pythonExecutionService = await this.serviceContainer
            .get<IPythonExecutionFactory>(IPythonExecutionFactory)
            .create({ resource });

        if (executionInfo.execPath) {
            return pythonExecutionService.exec(executionInfo.args, options);
        }

        return pythonExecutionService.execForLinter(executionInfo.moduleName!, executionInfo.args, options);
    }
}
