/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IDisposableRegistry, IInstaller, InstallerResponse, Product } from '../common/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { traceError, traceInfo } from '../logging';
import { MINIMUM_PYTHON_VERSION, Commands } from '../common/constants';
import { getIpykernelBundle } from './ipykernel';
import { InstallOptions } from '../common/installer/types';

import { activateWalkthroughCommands } from './walkthroughCommands';
import { printInterpreterDebugInfo } from './interpreterSettings';
import { registerLanguageServerManager } from './languageServerManager';
import { suggestPythonHelpTopics, getPythonHelpAsMarkdown } from './pythonHelp';

export async function activateErdos(serviceContainer: IServiceContainer): Promise<void> {
    try {
        const disposables = serviceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        disposables.push(
            vscode.commands.registerCommand('python.isIpykernelBundled', async (pythonPath: string) => {
                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getInterpreterDetails(pythonPath);
                if (interpreter) {
                    const bundle = await getIpykernelBundle(interpreter, serviceContainer);
                    return bundle.disabledReason === undefined;
                }
                traceError(
                    `Could not check if ipykernel is installed due to an invalid interpreter path: ${pythonPath}`,
                );
                return false;
            }),
        );
        disposables.push(
            vscode.commands.registerCommand('python.installIpykernel', async (pythonPath: string) => {
                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getInterpreterDetails(pythonPath);
                if (interpreter) {
                    const installer = serviceContainer.get<IInstaller>(IInstaller);
                    const bundle = await getIpykernelBundle(interpreter, serviceContainer);
                    if (bundle.disabledReason !== undefined) {
                        const installOptions: InstallOptions = { installAsProcess: true };
                        const installResult = await installer.install(
                            Product.ipykernel,
                            interpreter,
                            undefined,
                            undefined,
                            installOptions,
                        );
                        if (installResult !== InstallerResponse.Installed) {
                            traceError(
                                `Could not install ipykernel for interpreter: ${pythonPath}. Install result - ${installResult}`,
                            );
                        }
                    } else {
                        traceInfo(`Already bundling ipykernel for interpreter ${pythonPath}. No need to install it.`);
                    }
                } else {
                    traceError(`Could not install ipykernel due to an invalid interpreter path: ${pythonPath}`);
                }
            }),
        );
        disposables.push(
            vscode.commands.registerCommand('python.installJupytext', async (pythonPath: string) => {
                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getInterpreterDetails(pythonPath);
                if (interpreter) {
                    const installer = serviceContainer.get<IInstaller>(IInstaller);
                    const installOptions: InstallOptions = { installAsProcess: true };
                    const installResult = await installer.install(
                        Product.jupytext,
                        interpreter,
                        undefined,
                        undefined,
                        installOptions,
                    );
                    if (installResult !== InstallerResponse.Installed) {
                        traceError(
                            `Could not install jupytext for interpreter: ${pythonPath}. Install result - ${installResult}`,
                        );
                        return false;
                    }
                    return true;
                } else {
                    traceError(`Could not install jupytext due to an invalid interpreter path: ${pythonPath}`);
                    return false;
                }
            }),
        );
        disposables.push(
            vscode.commands.registerCommand('python.getMinimumPythonVersion', (): string => MINIMUM_PYTHON_VERSION.raw),
        );
        disposables.push(
            vscode.commands.registerCommand(Commands.Show_Interpreter_Debug_Info, async () => {
                await vscode.commands.executeCommand(Commands.ViewOutput);

                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreters = interpreterService.getInterpreters();
                printInterpreterDebugInfo(interpreters);
            }),
        );

        disposables.push(
            vscode.commands.registerCommand('python.suggestHelpTopics', async (query: string): Promise<string[]> => {
                console.log('🔍 COMMAND START: python.suggestHelpTopics called with query:', query);
                const result = await suggestPythonHelpTopics(query || '');
                console.log('🔍 COMMAND END: python.suggestHelpTopics returning:', result);
                console.log('🔍 COMMAND END: result type:', typeof result, 'isArray:', Array.isArray(result));
                return result;
            }),
        );

        disposables.push(
            vscode.commands.registerCommand('python.getHelpAsMarkdown', async (topic: string): Promise<string> => {
                return await getPythonHelpAsMarkdown(topic || '');
            }),
        );



        activateWalkthroughCommands(disposables);

        registerLanguageServerManager(serviceContainer, disposables);

        traceInfo('activateErdos: done!');
    } catch (ex) {
        traceError('activateErdos() failed.', ex);
    }
}
