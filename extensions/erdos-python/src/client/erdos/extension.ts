/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { IDisposableRegistry, IInstaller, InstallerResponse, Product } from '../common/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { traceError, traceInfo } from '../logging';
import { MINIMUM_PYTHON_VERSION, Commands, EXTENSION_ROOT_DIR } from '../common/constants';
import { getIpykernelBundle } from './ipykernel';
import { InstallOptions } from '../common/installer/types';

import { activateWalkthroughCommands } from './walkthroughCommands';
import { printInterpreterDebugInfo } from './interpreterSettings';
import { registerLanguageServerManager } from './languageServerManager';
import { suggestPythonHelpTopics } from './pythonHelp';
import { getNativeRepl } from '../repl/nativeRepl';
import { JupytextService } from '../repl/jupytextService';

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
            vscode.commands.registerCommand('python.getJupytextConverterPath', (): string => {
                return path.join(EXTENSION_ROOT_DIR, 'python_files', 'jupytext_converter.py');
            }),
        );

        // Check if python.interpreterPath already exists before registering
        const interpreterPathExists = await vscode.commands.getCommands(true).then(cmds => cmds.includes('python.interpreterPath'));
        if (!interpreterPathExists) {
            disposables.push(
                vscode.commands.registerCommand('python.interpreterPath', async (): Promise<string | undefined> => {
                    const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                    const interpreter = await interpreterService.getActiveInterpreter();
                    return interpreter?.path;
                }),
            );
        }
        disposables.push(
            vscode.commands.registerCommand('python.jupytextConverter', async (operation: string, args: any): Promise<string> => {
                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getActiveInterpreter();
                
                if (!interpreter) {
                    return JSON.stringify({ success: false, error: 'No Python interpreter available' });
                }
                
                try {
                    // Get the native REPL instance and its PythonServer
                    const nativeRepl = await getNativeRepl(interpreter, disposables);
                    const pythonServer = nativeRepl.getPythonServer();
                    
                    // Create the JupytextService
                    const jupytextService = new JupytextService(pythonServer);
                    
                    let result: any;
                    const options = { format_name: args.format || 'py:percent' };
                    
                    switch (operation) {
                        case 'check-installation':
                            const isAvailable = await jupytextService.checkJupytextInstallation();
                            result = { success: true, available: isAvailable };
                            break;
                            
                        case 'text-to-notebook':
                            const notebookJson = await jupytextService.convertTextToNotebook(args.textContent, options);
                            result = { success: true, notebook_json: notebookJson };
                            break;
                            
                        case 'notebook-content-to-text-with-preservation':
                            const conversionResult = await jupytextService.convertNotebookContentToText(args.notebookContent, options);
                            result = { 
                                success: true, 
                                text: conversionResult.pythonText,
                                preservation_data: conversionResult.preservationData
                            };
                            break;
                            
                        case 'text-to-notebook-with-preservation':
                            const preservedNotebookJson = await jupytextService.convertTextToNotebookWithPreservation(
                                args.textContent, 
                                args.preservationData, 
                                options
                            );
                            result = { success: true, notebook_json: preservedNotebookJson };
                            break;
                            
                        default:
                            result = { success: false, error: `Unknown operation: ${operation}` };
                    }
                    
                    return JSON.stringify(result);
                    
                } catch (error) {
                    return JSON.stringify({ 
                        success: false, 
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }),
        );
        
        // Register Python AST parser command for console auto-accept
        disposables.push(
            vscode.commands.registerCommand('python.astParser', async (code: string): Promise<string[]> => {
                try {
                    // Use the function parser service which routes through the help comm system
                    const result = await vscode.commands.executeCommand('erdosAi.parseFunctions', code, 'python') as { functions: string[], success: boolean, error?: string };
                    
                    if (result.success) {
                        return result.functions;
                    } else {
                        console.error('[python.astParser] Function parsing failed:', result.error);
                        return [];
                    }
                    
                } catch (error) {
                    console.error('[python.astParser] Error parsing Python code:', error);
                    return [];
                }
            }),
        );
        
        activateWalkthroughCommands(disposables);

        registerLanguageServerManager(serviceContainer, disposables);
        traceInfo('activateErdos: done!');
    } catch (ex) {
        traceError('activateErdos() failed.', ex);
        throw ex;
    }
}
