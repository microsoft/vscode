// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CancellationToken,
    l10n,
    LanguageModelTextPart,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    PreparedToolInvocation,
    Uri,
} from 'vscode';
import { PythonExtension } from '../api/types';
import { IServiceContainer } from '../ioc/types';
import {
    getEnvDisplayName,
    getToolResponseIfNotebook,
    IResourceReference,
    isCancellationError,
    isCondaEnv,
    raceCancellationError,
} from './utils';
import { IModuleInstaller } from '../common/installer/types';
import { ModuleInstallerType } from '../pythonEnvironments/info';
import { IDiscoveryAPI } from '../pythonEnvironments/base/locator';
import { getEnvExtApi, useEnvExtension } from '../envExt/api.internal';
import { ErrorWithTelemetrySafeReason } from '../common/errors/errorUtils';
import { BaseTool } from './baseTool';

export interface IInstallPackageArgs extends IResourceReference {
    packageList: string[];
}

export class InstallPackagesTool extends BaseTool<IInstallPackageArgs>
    implements LanguageModelTool<IInstallPackageArgs> {
    public static readonly toolName = 'install_python_packages';
    constructor(
        private readonly api: PythonExtension['environments'],
        private readonly serviceContainer: IServiceContainer,
        private readonly discovery: IDiscoveryAPI,
    ) {
        super(InstallPackagesTool.toolName);
    }

    async invokeImpl(
        options: LanguageModelToolInvocationOptions<IInstallPackageArgs>,
        resourcePath: Uri | undefined,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult> {
        const packageCount = options.input.packageList.length;
        const packagePlurality = packageCount === 1 ? 'package' : 'packages';
        const notebookResponse = getToolResponseIfNotebook(resourcePath);
        if (notebookResponse) {
            return notebookResponse;
        }

        if (useEnvExtension()) {
            const api = await getEnvExtApi();
            const env = await api.getEnvironment(resourcePath);
            if (env) {
                await raceCancellationError(api.managePackages(env, { install: options.input.packageList }), token);
                const resultMessage = `Successfully installed ${packagePlurality}: ${options.input.packageList.join(
                    ', ',
                )}`;
                return new LanguageModelToolResult([new LanguageModelTextPart(resultMessage)]);
            } else {
                return new LanguageModelToolResult([
                    new LanguageModelTextPart(
                        `Packages not installed. No environment found for: ${resourcePath?.fsPath}`,
                    ),
                ]);
            }
        }

        try {
            // environment
            const envPath = this.api.getActiveEnvironmentPath(resourcePath);
            const environment = await raceCancellationError(this.api.resolveEnvironment(envPath), token);
            if (!environment || !environment.version) {
                throw new ErrorWithTelemetrySafeReason(
                    'No environment found for the provided resource path: ' + resourcePath?.fsPath,
                    'noEnvFound',
                );
            }
            const isConda = isCondaEnv(environment);
            const installers = this.serviceContainer.getAll<IModuleInstaller>(IModuleInstaller);
            const installerType = isConda ? ModuleInstallerType.Conda : ModuleInstallerType.Pip;
            const installer = installers.find((i) => i.type === installerType);
            if (!installer) {
                throw new ErrorWithTelemetrySafeReason(
                    `No installer found for the environment type: ${installerType}`,
                    'noInstallerFound',
                );
            }
            if (!installer.isSupported(resourcePath)) {
                throw new ErrorWithTelemetrySafeReason(
                    `Installer ${installerType} not supported for the environment type: ${installerType}`,
                    'installerNotSupported',
                );
            }
            for (const packageName of options.input.packageList) {
                await installer.installModule(packageName, resourcePath, token, undefined, {
                    installAsProcess: true,
                    hideProgress: true,
                });
            }
            // format and return
            const resultMessage = `Successfully installed ${packagePlurality}: ${options.input.packageList.join(', ')}`;
            return new LanguageModelToolResult([new LanguageModelTextPart(resultMessage)]);
        } catch (error) {
            if (isCancellationError(error)) {
                throw error;
            }
            const errorMessage = `An error occurred while installing ${packagePlurality}: ${error}`;
            return new LanguageModelToolResult([new LanguageModelTextPart(errorMessage)]);
        }
    }

    async prepareInvocationImpl(
        options: LanguageModelToolInvocationPrepareOptions<IInstallPackageArgs>,
        resourcePath: Uri | undefined,
        token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        const packageCount = options.input.packageList.length;
        if (getToolResponseIfNotebook(resourcePath)) {
            return {};
        }

        const envName = await raceCancellationError(getEnvDisplayName(this.discovery, resourcePath, this.api), token);
        let title = '';
        let invocationMessage = '';
        const message =
            packageCount === 1
                ? ''
                : l10n.t(`The following packages will be installed: {0}`, options.input.packageList.sort().join(', '));
        if (envName) {
            title =
                packageCount === 1
                    ? l10n.t(`Install {0} in {1}?`, options.input.packageList[0], envName)
                    : l10n.t(`Install packages in {0}?`, envName);
            invocationMessage =
                packageCount === 1
                    ? l10n.t(`Installing {0} in {1}`, options.input.packageList[0], envName)
                    : l10n.t(`Installing packages {0} in {1}`, options.input.packageList.sort().join(', '), envName);
        } else {
            title =
                options.input.packageList.length === 1
                    ? l10n.t(`Install Python package '{0}'?`, options.input.packageList[0])
                    : l10n.t(`Install Python packages?`);
            invocationMessage =
                packageCount === 1
                    ? l10n.t(`Installing Python package '{0}'`, options.input.packageList[0])
                    : l10n.t(`Installing Python packages: {0}`, options.input.packageList.sort().join(', '));
        }

        return {
            confirmationMessages: { title, message },
            invocationMessage,
        };
    }
}
