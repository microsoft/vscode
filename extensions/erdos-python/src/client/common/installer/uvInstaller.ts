/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { inject, injectable } from 'inversify';
import { ModuleInstallerType } from '../../pythonEnvironments/info';
import { ExecutionInfo, IConfigurationService } from '../types';
import { ModuleInstaller } from './moduleInstaller';
import { InterpreterUri, ModuleInstallFlags } from './types';
import { isUvInstalled } from '../../pythonEnvironments/common/environmentManagers/uv';
import { IServiceContainer } from '../../ioc/types';
import { isResource } from '../utils/misc';
import { IWorkspaceService } from '../application/types';
import { IInterpreterService } from '../../interpreter/contracts';

@injectable()
export class UVInstaller extends ModuleInstaller {
    constructor(@inject(IServiceContainer) serviceContainer: IServiceContainer) {
        super(serviceContainer);
    }

    public get name(): string {
        return 'Uv';
    }

    public get displayName(): string {
        return 'uv';
    }

    public get type(): ModuleInstallerType {
        return ModuleInstallerType.Uv;
    }

    public get priority(): number {
        return 30;
    }

    public async isSupported(_resource?: InterpreterUri): Promise<boolean> {
        // uv can be used in any environment type
        try {
            return await isUvInstalled();
        } catch {
            return false;
        }
    }

    protected async getExecutionInfo(
        moduleName: string,
        resource?: InterpreterUri,
        flags: ModuleInstallFlags = 0,
    ): Promise<ExecutionInfo> {
        // If the resource isSupported, then the uv binary exists
        const execPath = 'uv';
        // TODO: should we use uv add if a pyproject.toml exists?
        const args = ['pip', 'install', '--upgrade'];

        // Get the path to the python interpreter (similar to a part in ModuleInstaller.installModule())
        const configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const settings = configService.getSettings(isResource(resource) ? resource : undefined);
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const interpreter = isResource(resource) ? await interpreterService.getActiveInterpreter(resource) : resource;
        const interpreterPath = interpreter?.path ?? settings.pythonPath;
        const pythonPath = isResource(resource) ? interpreterPath : resource.path;
        args.push('--python', pythonPath);

        const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        const proxy = workspaceService.getConfiguration('http').get('proxy', '');
        if (proxy.length > 0) {
            args.push('--proxy', proxy);
        }

        if (flags & ModuleInstallFlags.reInstall) {
            args.push('--force-reinstall');
        }

        // Support the --break-system-packages flag to temporarily work around PEP 668.
        if (flags & ModuleInstallFlags.breakSystemPackages) {
            args.push('--break-system-packages');
        }

        return {
            args: [...args, moduleName],
            execPath,
        };
    }
}
