/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Uri, Event } from 'vscode';
import { BaseLanguageClient, LanguageClientOptions } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';
import { PythonRuntimeSession } from './erdos/session';
import { PYLANCE_NAME } from './activation/node/languageClientFactory';
import { ILanguageServerOutputChannel } from './activation/types';
import { PythonExtension } from './api/types';
import { isTestExecution, PYTHON_LANGUAGE } from './common/constants';
import { IConfigurationService, Resource } from './common/types';
import { getDebugpyLauncherArgs } from './debugger/extension/adapter/remoteLaunchers';
import { IInterpreterService } from './interpreter/contracts';
import { IServiceContainer, IServiceManager } from './ioc/types';
import {
    JupyterExtensionIntegration,
    JupyterExtensionPythonEnvironments,
    JupyterPythonEnvironmentApi,
} from './jupyter/jupyterIntegration';
import { traceError } from './logging';
import { IDiscoveryAPI } from './pythonEnvironments/base/locator';
import { buildEnvironmentApi } from './environmentApi';
import { ApiForPylance } from './pylanceApi';
import { getTelemetryReporter } from './telemetry';
import { TensorboardExtensionIntegration } from './tensorBoard/tensorboardIntegration';
import { getDebugpyPath } from './debugger/pythonDebugger';

export function buildApi(
    ready: Promise<void>,
    serviceManager: IServiceManager,
    serviceContainer: IServiceContainer,
    discoveryApi: IDiscoveryAPI,
): PythonExtension {
    const configurationService = serviceContainer.get<IConfigurationService>(IConfigurationService);
    const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
    serviceManager.addSingleton<JupyterExtensionIntegration>(JupyterExtensionIntegration, JupyterExtensionIntegration);
    serviceManager.addSingleton<JupyterExtensionPythonEnvironments>(
        JupyterExtensionPythonEnvironments,
        JupyterExtensionPythonEnvironments,
    );
    serviceManager.addSingleton<TensorboardExtensionIntegration>(
        TensorboardExtensionIntegration,
        TensorboardExtensionIntegration,
    );
    const jupyterPythonEnvApi = serviceContainer.get<JupyterPythonEnvironmentApi>(JupyterExtensionPythonEnvironments);
    const environments = buildEnvironmentApi(discoveryApi, serviceContainer, jupyterPythonEnvApi);
    const jupyterIntegration = serviceContainer.get<JupyterExtensionIntegration>(JupyterExtensionIntegration);
    jupyterIntegration.registerEnvApi(environments);
    const tensorboardIntegration = serviceContainer.get<TensorboardExtensionIntegration>(
        TensorboardExtensionIntegration,
    );
    const outputChannel = serviceContainer.get<ILanguageServerOutputChannel>(ILanguageServerOutputChannel);

    const api: PythonExtension & {
        /**
         * Internal API just for Jupyter, hence don't include in the official types.
         */
        jupyter: {
            registerHooks(): void;
        };
        /**
         * Internal API just for Tensorboard, hence don't include in the official types.
         */
        tensorboard: {
            registerHooks(): void;
        };
    } & {
        /**
         * @deprecated Temporarily exposed for Pylance until we expose this API generally. Will be removed in an
         * iteration or two.
         */
        pylance: ApiForPylance;
    } & {
        /**
         * @deprecated Use PythonExtension.environments API instead.
         *
         * Return internal settings within the extension which are stored in VSCode storage
         */
        settings: {
            /**
             * An event that is emitted when execution details (for a resource) change. For instance, when interpreter configuration changes.
             */
            readonly onDidChangeExecutionDetails: Event<Uri | undefined>;
            /**
             * Returns all the details the consumer needs to execute code within the selected environment,
             * corresponding to the specified resource taking into account any workspace-specific settings
             * for the workspace to which this resource belongs.
             * @param {Resource} [resource] A resource for which the setting is asked for.
             * * When no resource is provided, the setting scoped to the first workspace folder is returned.
             * * If no folder is present, it returns the global setting.
             */
            getExecutionDetails(
                resource?: Resource,
            ): {
                /**
                 * E.g of execution commands returned could be,
                 * * `['<path to the interpreter set in settings>']`
                 * * `['<path to the interpreter selected by the extension when setting is not set>']`
                 * * `['conda', 'run', 'python']` which is used to run from within Conda environments.
                 * or something similar for some other Python environments.
                 *
                 * @type {(string[] | undefined)} When return value is `undefined`, it means no interpreter is set.
                 * Otherwise, join the items returned using space to construct the full execution command.
                 */
                execCommand: string[] | undefined;
            };
        };
    } = {
        // 'ready' will propagate the exception, but we must log it here first.
        ready: ready.catch((ex) => {
            traceError('Failure during activation.', ex);
            return Promise.reject(ex);
        }),
        jupyter: {
            registerHooks: () => jupyterIntegration.integrateWithJupyterExtension(),
        },
        tensorboard: {
            registerHooks: () => tensorboardIntegration.integrateWithTensorboardExtension(),
        },
        debug: {
            async getRemoteLauncherCommand(
                host: string,
                port: number,
                waitUntilDebuggerAttaches = true,
            ): Promise<string[]> {
                return getDebugpyLauncherArgs({
                    host,
                    port,
                    waitUntilDebuggerAttaches,
                });
            },
            async getDebuggerPackagePath(): Promise<string | undefined> {
                return getDebugpyPath();
            },
        },
        settings: {
            onDidChangeExecutionDetails: interpreterService.onDidChangeInterpreterConfiguration,
            getExecutionDetails(resource?: Resource) {
                const { pythonPath } = configurationService.getSettings(resource);
                // If pythonPath equals an empty string, no interpreter is set.
                return { execCommand: pythonPath === '' ? undefined : [pythonPath] };
            },
        },
        pylance: {
            createClient: (...args: any[]): BaseLanguageClient => {
                // Make sure we share output channel so that we can share one with
                // Jedi as well.
                const clientOptions = args[1] as LanguageClientOptions;
                clientOptions.outputChannel = clientOptions.outputChannel ?? outputChannel.channel;

                return new LanguageClient(PYTHON_LANGUAGE, PYLANCE_NAME, args[0], clientOptions);
            },
            start: (client: BaseLanguageClient): Promise<void> => client.start(),
            stop: (client: BaseLanguageClient): Promise<void> => client.stop(),
            getTelemetryReporter: () => getTelemetryReporter(),
        },
        environments,
    };

    // In test environment return the DI Container.
    if (isTestExecution()) {
        (api as any).serviceContainer = serviceContainer;
        (api as any).serviceManager = serviceManager;
    }
    (api as any).erdos = {
        createPythonRuntimeSession:
            (runtimeMetadata: any, sessionMetadata: any, spec: any) =>
                new PythonRuntimeSession(runtimeMetadata, sessionMetadata, serviceContainer, spec),
    };
    return api;
}
