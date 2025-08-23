// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IServiceContainer } from '../../ioc/types';
import { EnvironmentType, ModuleInstallerType } from '../../pythonEnvironments/info';
import { IWorkspaceService } from '../application/types';
import { IPythonExecutionFactory } from '../process/types';
import { ExecutionInfo, IInstaller, Product } from '../types';
import { isResource } from '../utils/misc';
import { ModuleInstaller, translateProductToModule } from './moduleInstaller';
import { InterpreterUri, ModuleInstallFlags } from './types';
import * as path from 'path';
import { _SCRIPTS_DIR } from '../process/internal/scripts/constants';
import { ProductNames } from './productNames';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IInterpreterService } from '../../interpreter/contracts';
import { isParentPath } from '../platform/fs-paths';

async function doesEnvironmentContainPython(serviceContainer: IServiceContainer, resource: InterpreterUri) {
    const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
    const environment = isResource(resource) ? await interpreterService.getActiveInterpreter(resource) : resource;
    if (!environment) {
        return undefined;
    }
    if (
        environment.envPath?.length &&
        environment.envType === EnvironmentType.Conda &&
        !isParentPath(environment?.path, environment.envPath)
    ) {
        // For conda environments not containing a python interpreter, do not use pip installer due to bugs in `conda run`:
        // https://github.com/microsoft/vscode-python/issues/18479#issuecomment-1044427511
        // https://github.com/conda/conda/issues/11211
        return false;
    }
    return true;
}

@injectable()
export class PipInstaller extends ModuleInstaller {
    public get name(): string {
        return 'Pip';
    }

    public get type(): ModuleInstallerType {
        return ModuleInstallerType.Pip;
    }

    public get displayName() {
        return 'Pip';
    }
    public get priority(): number {
        return 0;
    }
    constructor(@inject(IServiceContainer) serviceContainer: IServiceContainer) {
        super(serviceContainer);
    }
    public async isSupported(resource?: InterpreterUri): Promise<boolean> {
        if ((await doesEnvironmentContainPython(this.serviceContainer, resource)) === false) {
            return false;
        }
        return this.isPipAvailable(resource);
    }
    protected async getExecutionInfo(
        moduleName: string,
        resource?: InterpreterUri,
        flags: ModuleInstallFlags = 0,
    ): Promise<ExecutionInfo> {
        if (moduleName === translateProductToModule(Product.pip)) {
            const version = isResource(resource)
                ? ''
                : `${resource.version?.major || ''}.${resource.version?.minor || ''}.${resource.version?.patch || ''}`;
            const envType = isResource(resource) ? undefined : resource.envType;

            sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                installer: 'unavailable',
                requiredInstaller: ModuleInstallerType.Pip,
                productName: ProductNames.get(Product.pip),
                version,
                envType,
            });

            // If `ensurepip` is available, if not, then install pip using the script file.
            const installer = this.serviceContainer.get<IInstaller>(IInstaller);
            if (await installer.isInstalled(Product.ensurepip, resource)) {
                return {
                    args: [],
                    moduleName: 'ensurepip',
                };
            }

            sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                installer: 'unavailable',
                requiredInstaller: ModuleInstallerType.Pip,
                productName: ProductNames.get(Product.ensurepip),
                version,
                envType,
            });

            // Return script to install pip.
            const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
            const interpreter = isResource(resource)
                ? await interpreterService.getActiveInterpreter(resource)
                : resource;
            return {
                execPath: interpreter ? interpreter.path : 'python',
                args: [path.join(_SCRIPTS_DIR, 'get-pip.py')],
            };
        }

        const args: string[] = [];
        const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        const proxy = workspaceService.getConfiguration('http').get('proxy', '');
        if (proxy.length > 0) {
            args.push('--proxy');
            args.push(proxy);
        }
        args.push(...['install', '-U']);
        if (flags & ModuleInstallFlags.reInstall) {
            args.push('--force-reinstall');
        }
        return {
            args: [...args, moduleName],
            moduleName: 'pip',
        };
    }
    private isPipAvailable(info?: InterpreterUri): Promise<boolean> {
        const pythonExecutionFactory = this.serviceContainer.get<IPythonExecutionFactory>(IPythonExecutionFactory);
        const resource = isResource(info) ? info : undefined;
        const pythonPath = isResource(info) ? undefined : info.path;
        return pythonExecutionFactory
            .create({ resource, pythonPath })
            .then((proc) => proc.isModuleInstalled('pip'))
            .catch(() => false);
    }
}
