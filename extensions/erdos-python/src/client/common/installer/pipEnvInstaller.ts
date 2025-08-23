// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { isPipenvEnvironmentRelatedToFolder } from '../../pythonEnvironments/common/environmentManagers/pipenv';
import { EnvironmentType, ModuleInstallerType } from '../../pythonEnvironments/info';
import { IWorkspaceService } from '../application/types';
import { ExecutionInfo } from '../types';
import { isResource } from '../utils/misc';
import { ModuleInstaller } from './moduleInstaller';
import { InterpreterUri, ModuleInstallFlags } from './types';

export const pipenvName = 'pipenv';

@injectable()
export class PipEnvInstaller extends ModuleInstaller {
    public get name(): string {
        return 'pipenv';
    }

    public get type(): ModuleInstallerType {
        return ModuleInstallerType.Pipenv;
    }

    public get displayName() {
        return pipenvName;
    }
    public get priority(): number {
        return 10;
    }

    constructor(@inject(IServiceContainer) serviceContainer: IServiceContainer) {
        super(serviceContainer);
    }
    public async isSupported(resource?: InterpreterUri): Promise<boolean> {
        if (isResource(resource)) {
            const interpreter = await this.serviceContainer
                .get<IInterpreterService>(IInterpreterService)
                .getActiveInterpreter(resource);
            const workspaceFolder = resource
                ? this.serviceContainer.get<IWorkspaceService>(IWorkspaceService).getWorkspaceFolder(resource)
                : undefined;
            if (!interpreter || !workspaceFolder || interpreter.envType !== EnvironmentType.Pipenv) {
                return false;
            }
            // Install using `pipenv install` only if the active environment is related to the current folder.
            return isPipenvEnvironmentRelatedToFolder(interpreter.path, workspaceFolder.uri.fsPath);
        } else {
            return resource.envType === EnvironmentType.Pipenv;
        }
    }
    protected async getExecutionInfo(
        moduleName: string,
        _resource?: InterpreterUri,
        flags: ModuleInstallFlags = 0,
    ): Promise<ExecutionInfo> {
        // In pipenv the only way to update/upgrade or re-install is update (apart from a complete uninstall and re-install).
        const update =
            flags & ModuleInstallFlags.reInstall ||
            flags & ModuleInstallFlags.updateDependencies ||
            flags & ModuleInstallFlags.upgrade;
        const args = [update ? 'update' : 'install', moduleName, '--dev'];
        return {
            args: args,
            execPath: pipenvName,
        };
    }
}
