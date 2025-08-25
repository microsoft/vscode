// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import * as path from 'path';
import { CancellationToken, CancellationTokenSource, l10n, ProgressLocation, ProgressOptions } from 'vscode';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { traceError, traceLog } from '../../logging';
import { EnvironmentType, ModuleInstallerType, virtualEnvTypes } from '../../pythonEnvironments/info';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IApplicationShell, IWorkspaceService } from '../application/types';
import { wrapCancellationTokens } from '../cancellation';
import { IFileSystem } from '../platform/types';
import * as internalPython from '../process/internal/python';
import { IProcessServiceFactory } from '../process/types';
import { ITerminalServiceFactory, TerminalCreationOptions } from '../terminal/types';
import { ExecutionInfo, IConfigurationService, ILogOutputChannel, Product } from '../types';
import { isResource } from '../utils/misc';
import { ProductNames } from './productNames';
import { IModuleInstaller, InstallOptions, InterpreterUri, ModuleInstallFlags } from './types';

@injectable()
export abstract class ModuleInstaller implements IModuleInstaller {
    public abstract get priority(): number;

    public abstract get name(): string;

    public abstract get displayName(): string;

    public abstract get type(): ModuleInstallerType;

    private _waitForCompletion?: boolean;
    
    constructor(protected serviceContainer: IServiceContainer) {}

    private installModulesInTerminal(): boolean | undefined {
        const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        return workspaceService.getConfiguration('python').get<boolean>('installModulesInTerminal');
    }

    public async installModule(
        productOrModuleName: Product | string,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
    ): Promise<void> {
        const shouldExecuteInTerminal = this.installModulesInTerminal() || !options?.installAsProcess;
        this._waitForCompletion = options?.waitForCompletion;
        const name =
            typeof productOrModuleName === 'string'
                ? productOrModuleName
                : translateProductToModule(productOrModuleName);
        const productName = typeof productOrModuleName === 'string' ? name : ProductNames.get(productOrModuleName);
        sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, { installer: this.displayName, productName });
        const uri = isResource(resource) ? resource : undefined;
        const executionInfo = await this.getExecutionInfo(name, resource, flags);

        const install = async (token?: CancellationToken) => {
            const executionInfoArgs = await this.processInstallArgs(executionInfo.args, resource);
            if (executionInfo.moduleName) {
                const configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
                const settings = configService.getSettings(uri);

                const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = isResource(resource)
                    ? await interpreterService.getActiveInterpreter(resource)
                    : resource;
                const interpreterPath = interpreter?.path ?? settings.pythonPath;
                const pythonPath = isResource(resource) ? interpreterPath : resource.path;
                const args = internalPython.execModule(executionInfo.moduleName, executionInfoArgs);
                if (!interpreter || interpreter.envType !== EnvironmentType.Unknown) {
                    await this.executeCommand(
                        shouldExecuteInTerminal,
                        resource,
                        pythonPath,
                        args,
                        token,
                        executionInfo.useShell,
                    );
                } else if (settings.globalModuleInstallation) {
                    const fs = this.serviceContainer.get<IFileSystem>(IFileSystem);
                    if (await fs.isDirReadonly(path.dirname(pythonPath)).catch((_err) => true)) {
                        this.elevatedInstall(pythonPath, args);
                    } else {
                        await this.executeCommand(
                            shouldExecuteInTerminal,
                            resource,
                            pythonPath,
                            args,
                            token,
                            executionInfo.useShell,
                        );
                    }
                } else if (name === translateProductToModule(Product.pip)) {
                    // Pip should always be installed into the specified environment.
                    await this.executeCommand(
                        shouldExecuteInTerminal,
                        resource,
                        pythonPath,
                        args,
                        token,
                        executionInfo.useShell,
                    );
                } else if (virtualEnvTypes.includes(interpreter.envType)) {
                    await this.executeCommand(
                        shouldExecuteInTerminal,
                        resource,
                        pythonPath,
                        args,
                        token,
                        executionInfo.useShell,
                    );
                } else {
                    await this.executeCommand(
                        shouldExecuteInTerminal,
                        resource,
                        pythonPath,
                        args.concat(['--user']),
                        token,
                        executionInfo.useShell,
                    );
                }
            } else {
                await this.executeCommand(
                    shouldExecuteInTerminal,
                    resource,
                    executionInfo.execPath!,
                    executionInfoArgs,
                    token,
                    executionInfo.useShell,
                );
            }
        };

        // Display progress indicator if we have ability to cancel this operation from calling code.
        // This is required as its possible the installation can take a long time.
        // (i.e. if installation takes a long time in terminal or like, a progress indicator is necessary to let user know what is being waited on).
        if (cancel && !options?.hideProgress) {
            const shell = this.serviceContainer.get<IApplicationShell>(IApplicationShell);
            const options: ProgressOptions = {
                location: ProgressLocation.Notification,
                cancellable: true,
                title: l10n.t('Installing {0}', name),
            };
            await shell.withProgress(options, async (_, token: CancellationToken) =>
                install(wrapCancellationTokens(token, cancel)),
            );
        } else {
            await install(cancel);
        }
    }

    public abstract isSupported(resource?: InterpreterUri): Promise<boolean>;

    protected elevatedInstall(execPath: string, args: string[]) {
        const options = {
            name: 'VS Code Python',
        };
        const outputChannel = this.serviceContainer.get<ILogOutputChannel>(ILogOutputChannel);
        const command = `"${execPath.replace(/\\/g, '/')}" ${args.join(' ')}`;

        traceLog(`[Elevated] ${command}`);

        const sudo = require('sudo-prompt');

        sudo.exec(command, options, async (error: string, stdout: string, stderr: string) => {
            if (error) {
                const shell = this.serviceContainer.get<IApplicationShell>(IApplicationShell);
                await shell.showErrorMessage(error);
            } else {
                outputChannel.show();
                if (stdout) {
                    traceLog(stdout);
                }
                if (stderr) {
                    traceError(`Warning: ${stderr}`);
                }
            }
        });
    }

    protected abstract getExecutionInfo(
        moduleName: string,
        resource?: InterpreterUri,
        flags?: ModuleInstallFlags,
    ): Promise<ExecutionInfo>;

    private async processInstallArgs(args: string[], resource?: InterpreterUri): Promise<string[]> {
        const indexOfPylint = args.findIndex((arg) => arg.toUpperCase() === 'PYLINT');
        if (indexOfPylint === -1) {
            return args;
        }
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const interpreter = isResource(resource) ? await interpreterService.getActiveInterpreter(resource) : resource;
        // If installing pylint on python 2.x, then use pylint~=1.9.0
        if (interpreter && interpreter.version && interpreter.version.major === 2) {
            const newArgs = [...args];
            // This command could be sent to the terminal, hence '<' needs to be escaped for UNIX.
            newArgs[indexOfPylint] = '"pylint<2.0.0"';
            return newArgs;
        }
        return args;
    }

    private async executeCommand(
        executeInTerminal: boolean,
        resource: InterpreterUri | undefined,
        command: string,
        args: string[],
        token: CancellationToken | undefined,
        useShell: boolean | undefined,
    ) {
        const options: TerminalCreationOptions = {};
        if (isResource(resource)) {
            options.resource = resource;
        } else {
            options.interpreter = resource;
        }
        if (executeInTerminal) {
            const terminalService = this.serviceContainer
                .get<ITerminalServiceFactory>(ITerminalServiceFactory)
                .getTerminalService(options);

            if (this.installModulesInTerminal() || this._waitForCompletion) {
                const cancelToken = token ?? new CancellationTokenSource().token;
                this._waitForCompletion = undefined;
                await terminalService.sendCommand(command, args, token ?? cancelToken);
                return;
            }
            terminalService.sendCommand(command, args, token);
        } else {
            const processServiceFactory = this.serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory);
            const processService = await processServiceFactory.create(options.resource);
            if (useShell) {
                const argv = [command, ...args];
                // Concat these together to make a set of quoted strings
                const quoted = argv.reduce(
                    (p, c) =>
                        p ? `${p} ${c.toCommandArgumentForPythonExt()}` : `${c.toCommandArgumentForPythonExt()}`,
                    '',
                );
                await processService.shellExec(quoted);
            } else {
                await processService.exec(command, args);
            }
        }
    }
}

export function translateProductToModule(product: Product): string {
    switch (product) {
        case Product.pytest:
            return 'pytest';
        case Product.unittest:
            return 'unittest';
        case Product.tensorboard:
            return 'tensorboard';
        case Product.torchProfilerInstallName:
            return 'torch-tb-profiler';
        case Product.torchProfilerImportName:
            return 'torch_tb_profiler';
        case Product.pip:
            return 'pip';
        case Product.ensurepip:
            return 'ensurepip';
        case Product.python:
            return 'python';
        default: {
            throw new Error(`Product ${product} cannot be installed as a Python Module.`);
        }
    }
}
