/* eslint-disable class-methods-use-this */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { ICondaService, IComponentAdapter } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { getEnvPath } from '../../pythonEnvironments/base/info/env';
import { ModuleInstallerType } from '../../pythonEnvironments/info';
import { ExecutionInfo, IConfigurationService, Product } from '../types';
import { isResource } from '../utils/misc';
import { ModuleInstaller, translateProductToModule } from './moduleInstaller';
import { InterpreterUri, ModuleInstallFlags } from './types';

/**
 * A Python module installer for a conda environment.
 */
@injectable()
export class CondaInstaller extends ModuleInstaller {
    public _isCondaAvailable: boolean | undefined;

    // Unfortunately inversify requires the number of args in constructor to be explictly
    // specified as more than its base class. So we need the constructor.
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(@inject(IServiceContainer) serviceContainer: IServiceContainer) {
        super(serviceContainer);
    }

    public get name(): string {
        return 'Conda';
    }

    public get displayName(): string {
        return 'Conda';
    }

    public get type(): ModuleInstallerType {
        return ModuleInstallerType.Conda;
    }

    public get priority(): number {
        return 10;
    }

    /**
     * Checks whether we can use Conda as module installer for a given resource.
     * We need to perform two checks:
     * 1. Ensure we have conda.
     * 2. Check if the current environment is a conda environment.
     * @param {InterpreterUri} [resource=] Resource used to identify the workspace.
     * @returns {Promise<boolean>} Whether conda is supported as a module installer or not.
     */
    public async isSupported(resource?: InterpreterUri): Promise<boolean> {
        if (this._isCondaAvailable === false) {
            return false;
        }
        const condaLocator = this.serviceContainer.get<ICondaService>(ICondaService);
        this._isCondaAvailable = await condaLocator.isCondaAvailable();
        if (!this._isCondaAvailable) {
            return false;
        }
        // Now we need to check if the current environment is a conda environment or not.
        return this.isCurrentEnvironmentACondaEnvironment(resource);
    }

    /**
     * Return the commandline args needed to install the module.
     */
    protected async getExecutionInfo(
        moduleName: string,
        resource?: InterpreterUri,
        flags: ModuleInstallFlags = 0,
    ): Promise<ExecutionInfo> {
        const condaService = this.serviceContainer.get<ICondaService>(ICondaService);
        // Installation using `conda.exe` sometimes fails with a HTTP error on Windows:
        // https://github.com/conda/conda/issues/11399
        // Execute in a shell which uses a `conda.bat` file instead, using which installation works.
        const useShell = true;
        const condaFile = await condaService.getCondaFile(useShell);

        const pythonPath = isResource(resource)
            ? this.serviceContainer.get<IConfigurationService>(IConfigurationService).getSettings(resource).pythonPath
            : getEnvPath(resource.path, resource.envPath).path ?? '';
        const condaLocatorService = this.serviceContainer.get<IComponentAdapter>(IComponentAdapter);
        const info = await condaLocatorService.getCondaEnvironment(pythonPath);
        const args = [flags & ModuleInstallFlags.upgrade ? 'update' : 'install'];

        // Found that using conda-forge is best at packages like tensorboard & ipykernel which seem to get updated first on conda-forge
        // https://github.com/microsoft/vscode-jupyter/issues/7787 & https://github.com/microsoft/vscode-python/issues/17628
        // Do this just for the datascience packages.
        if ([Product.tensorboard].map(translateProductToModule).includes(moduleName)) {
            args.push('-c', 'conda-forge');
        }
        if (info && info.name) {
            // If we have the name of the conda environment, then use that.
            args.push('--name');
            args.push(info.name.toCommandArgumentForPythonExt());
        } else if (info && info.path) {
            // Else provide the full path to the environment path.
            args.push('--prefix');
            args.push(info.path.fileToCommandArgumentForPythonExt());
        }
        if (flags & ModuleInstallFlags.updateDependencies) {
            args.push('--update-deps');
        }
        if (flags & ModuleInstallFlags.reInstall) {
            args.push('--force-reinstall');
        }
        args.push(moduleName);
        args.push('-y');
        return {
            args,
            execPath: condaFile,
            useShell,
        };
    }

    /**
     * Is the provided interprter a conda environment
     */
    private async isCurrentEnvironmentACondaEnvironment(resource?: InterpreterUri): Promise<boolean> {
        const condaService = this.serviceContainer.get<IComponentAdapter>(IComponentAdapter);
        const pythonPath = isResource(resource)
            ? this.serviceContainer.get<IConfigurationService>(IConfigurationService).getSettings(resource).pythonPath
            : getEnvPath(resource.path, resource.envPath).path ?? '';
        return condaService.isCondaEnvironment(pythonPath);
    }
}
