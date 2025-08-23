/* eslint-disable class-methods-use-this */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { getEnvPath } from '../../pythonEnvironments/base/info/env';
import { EnvironmentType, ModuleInstallerType } from '../../pythonEnvironments/info';
import { ExecutionInfo, IConfigurationService } from '../types';
import { isResource } from '../utils/misc';
import { ModuleInstaller } from './moduleInstaller';
import { InterpreterUri } from './types';
import { getPixiEnvironmentFromInterpreter } from '../../pythonEnvironments/common/environmentManagers/pixi';

/**
 * A Python module installer for a pixi project.
 */
@injectable()
export class PixiInstaller extends ModuleInstaller {
    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
    ) {
        super(serviceContainer);
    }

    public get name(): string {
        return 'Pixi';
    }

    public get displayName(): string {
        return 'pixi';
    }

    public get type(): ModuleInstallerType {
        return ModuleInstallerType.Pixi;
    }

    public get priority(): number {
        return 20;
    }

    public async isSupported(resource?: InterpreterUri): Promise<boolean> {
        if (isResource(resource)) {
            const interpreter = await this.serviceContainer
                .get<IInterpreterService>(IInterpreterService)
                .getActiveInterpreter(resource);
            if (!interpreter || interpreter.envType !== EnvironmentType.Pixi) {
                return false;
            }

            const pixiEnv = await getPixiEnvironmentFromInterpreter(interpreter.path);
            return pixiEnv !== undefined;
        }
        return resource.envType === EnvironmentType.Pixi;
    }

    /**
     * Return the commandline args needed to install the module.
     */
    protected async getExecutionInfo(moduleName: string, resource?: InterpreterUri): Promise<ExecutionInfo> {
        const pythonPath = isResource(resource)
            ? this.configurationService.getSettings(resource).pythonPath
            : getEnvPath(resource.path, resource.envPath).path ?? '';

        const pixiEnv = await getPixiEnvironmentFromInterpreter(pythonPath);
        const execPath = pixiEnv?.pixi.command;

        let args = ['add', moduleName];
        const manifestPath = pixiEnv?.manifestPath;
        if (manifestPath !== undefined) {
            args = args.concat(['--manifest-path', manifestPath]);
        }

        return {
            args,
            execPath,
        };
    }
}
