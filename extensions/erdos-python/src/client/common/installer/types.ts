// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CancellationToken, Uri } from 'vscode';
import { ModuleInstallerType, PythonEnvironment } from '../../pythonEnvironments/info';
import { InstallerResponse, Product, ProductInstallStatus, ProductType, Resource } from '../types';

export type InterpreterUri = Resource | PythonEnvironment;

export const IModuleInstaller = Symbol('IModuleInstaller');
export interface IModuleInstaller {
    readonly name: string;
    readonly displayName: string;
    readonly priority: number;
    readonly type: ModuleInstallerType;
    /**
     * Installs a module
     * If a cancellation token is provided, then a cancellable progress message is dispalyed.
     *  At this point, this method would resolve only after the module has been successfully installed.
     * If cancellation token is not provided, its not guaranteed that module installation has completed.
     */
    installModule(
        productOrModuleName: Product | string,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
    ): Promise<void>;
    isSupported(resource?: InterpreterUri): Promise<boolean>;
}

export const IBaseInstaller = Symbol('IBaseInstaller');
export interface IBaseInstaller {
    install(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
    ): Promise<InstallerResponse>;
    promptToInstall(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
        message?: string,
    ): Promise<InstallerResponse>;
    isProductVersionCompatible(
        product: Product,
        semVerRequirement: string,
        resource?: InterpreterUri,
    ): Promise<ProductInstallStatus>;
    isInstalled(product: Product, resource?: InterpreterUri): Promise<boolean>;
}

export const IPythonInstallation = Symbol('IPythonInstallation');
export interface IPythonInstallation {
    checkInstallation(): Promise<boolean>;
}

export const IInstallationChannelManager = Symbol('IInstallationChannelManager');
export interface IInstallationChannelManager {
    getInstallationChannel(product: Product, resource?: InterpreterUri): Promise<IModuleInstaller | undefined>;
    getInstallationChannels(resource?: InterpreterUri): Promise<IModuleInstaller[]>;
    showNoInstallersMessage(): void;
}
export const IProductService = Symbol('IProductService');
export interface IProductService {
    getProductType(product: Product): ProductType;
}
export const IProductPathService = Symbol('IProductPathService');
export interface IProductPathService {
    getExecutableNameFromSettings(product: Product, resource?: Uri): string;
    isExecutableAModule(product: Product, resource?: Uri): boolean;
}

export enum ModuleInstallFlags {
    none = 0,
    upgrade = 1,
    updateDependencies = 2,
    reInstall = 4,
    installPipIfRequired = 8,
    breakSystemPackages = 16,
}

export type InstallOptions = {
    installAsProcess?: boolean;
    waitForCompletion?: boolean;
};
