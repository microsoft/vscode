// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { isPoetryEnvironmentRelatedToFolder } from '../../pythonEnvironments/common/environmentManagers/poetry';
import { EnvironmentType, ModuleInstallerType } from '../../pythonEnvironments/info';
import { IWorkspaceService } from '../application/types';
import { ExecutionInfo, IConfigurationService } from '../types';
import { isResource } from '../utils/misc';
import { ModuleInstaller } from './moduleInstaller';
import { InterpreterUri } from './types';

export const poetryName = 'poetry';

@injectable()
export class PoetryInstaller extends ModuleInstaller {
    // eslint-disable-next-line class-methods-use-this
    public get name(): string {
        return 'poetry';
    }

    // eslint-disable-next-line class-methods-use-this
    public get type(): ModuleInstallerType {
        return ModuleInstallerType.Poetry;
    }

    // eslint-disable-next-line class-methods-use-this
    public get displayName(): string {
        return poetryName;
    }

    // eslint-disable-next-line class-methods-use-this
    public get priority(): number {
        return 10;
    }

    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
    ) {
        super(serviceContainer);
    }

    public async isSupported(resource?: InterpreterUri): Promise<boolean> {
        if (!resource) {
            return false;
        }
        if (!isResource(resource)) {
            return false;
        }
        const interpreter = await this.serviceContainer
            .get<IInterpreterService>(IInterpreterService)
            .getActiveInterpreter(resource);
        const workspaceFolder = resource ? this.workspaceService.getWorkspaceFolder(resource) : undefined;
        if (!interpreter || !workspaceFolder || interpreter.envType !== EnvironmentType.Poetry) {
            return false;
        }
        // Install using poetry CLI only if the active poetry environment is related to the current folder.
        return isPoetryEnvironmentRelatedToFolder(
            interpreter.path,
            workspaceFolder.uri.fsPath,
            this.configurationService.getSettings(resource).poetryPath,
        );
    }

    protected async getExecutionInfo(moduleName: string, resource?: InterpreterUri): Promise<ExecutionInfo> {
        const execPath = this.configurationService.getSettings(isResource(resource) ? resource : undefined).poetryPath;
        const args = ['add', '--group', 'dev', moduleName];
        return {
            args,
            execPath,
        };
    }
}
