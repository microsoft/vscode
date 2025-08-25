// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { Disposable, Uri } from 'vscode';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../common/application/types';
import '../../common/extensions';
import { IPlatformService } from '../../common/platform/types';
import { ITerminalService, ITerminalServiceFactory } from '../../common/terminal/types';
import { IConfigurationService, IDisposable, IDisposableRegistry, Resource } from '../../common/types';
import { Diagnostics, Repl } from '../../common/utils/localize';
import { showWarningMessage } from '../../common/vscodeApis/windowApis';
import { IInterpreterService } from '../../interpreter/contracts';
import { traceInfo } from '../../logging';
import { buildPythonExecInfo, PythonExecInfo } from '../../pythonEnvironments/exec';
import { ICodeExecutionService } from '../../terminals/types';
import { EventName } from '../../telemetry/constants';
import { sendTelemetryEvent } from '../../telemetry';

@injectable()
export class TerminalCodeExecutionProvider implements ICodeExecutionService {
    private hasRanOutsideCurrentDrive = false;
    protected terminalTitle!: string;
    private replActive?: Promise<boolean>;

    constructor(
        @inject(ITerminalServiceFactory) protected readonly terminalServiceFactory: ITerminalServiceFactory,
        @inject(IConfigurationService) protected readonly configurationService: IConfigurationService,
        @inject(IWorkspaceService) protected readonly workspace: IWorkspaceService,
        @inject(IDisposableRegistry) protected readonly disposables: Disposable[],
        @inject(IPlatformService) protected readonly platformService: IPlatformService,
        @inject(IInterpreterService) protected readonly interpreterService: IInterpreterService,
        @inject(ICommandManager) protected readonly commandManager: ICommandManager,
        @inject(IApplicationShell) protected readonly applicationShell: IApplicationShell,
    ) {}

    public async executeFile(file: Uri, options?: { newTerminalPerFile: boolean }) {
        await this.setCwdForFileExecution(file, options);
        const { command, args } = await this.getExecuteFileArgs(file, [
            file.fsPath.fileToCommandArgumentForPythonExt(),
        ]);

        await this.getTerminalService(file, options).sendCommand(command, args);
    }

    public async execute(code: string, resource?: Uri): Promise<void> {
        if (!code || code.trim().length === 0) {
            return;
        }
        await this.initializeRepl(resource);
        if (code == 'deprecated') {
            // If user is trying to smart send deprecated code show warning
            const selection = await showWarningMessage(Diagnostics.invalidSmartSendMessage, Repl.disableSmartSend);
            traceInfo(`Selected file contains invalid Python or Deprecated Python 2 code`);
            if (selection === Repl.disableSmartSend) {
                // This setting is hidden in favor of the Erdos console.
                // this.configurationService.updateSetting('REPL.enableREPLSmartSend', false, resource);
            }
        } else {
            await this.getTerminalService(resource).executeCommand(code, true);
        }
    }

    public async initializeRepl(resource: Resource) {
        const terminalService = this.getTerminalService(resource);
        if (this.replActive && (await this.replActive)) {
            await terminalService.show();
            return;
        }
        sendTelemetryEvent(EventName.REPL, undefined, { replType: 'Terminal' });
        this.replActive = new Promise<boolean>(async (resolve) => {
            const replCommandArgs = await this.getExecutableInfo(resource);
            let listener: IDisposable;
            Promise.race([
                new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 3000)),
                new Promise<boolean>((resolve) => {
                    let count = 0;
                    const terminalDataTimeout = setTimeout(() => {
                        resolve(true); // Fall back for test case scenarios.
                    }, 3000);
                    // Watch TerminalData to see if REPL launched.
                    listener = this.applicationShell.onDidWriteTerminalData((e) => {
                        for (let i = 0; i < e.data.length; i++) {
                            if (e.data[i] === '>') {
                                count++;
                                if (count === 3) {
                                    clearTimeout(terminalDataTimeout);
                                    resolve(true);
                                }
                            }
                        }
                    });
                }),
            ]).then(() => {
                if (listener) {
                    listener.dispose();
                }
                resolve(true);
            });

            await terminalService.sendCommand(replCommandArgs.command, replCommandArgs.args);
        });
        this.disposables.push(
            terminalService.onDidCloseTerminal(() => {
                this.replActive = undefined;
            }),
        );

        await this.replActive;
    }

    public async getExecutableInfo(resource?: Uri, args: string[] = []): Promise<PythonExecInfo> {
        const pythonSettings = this.configurationService.getSettings(resource);
        const interpreter = await this.interpreterService.getActiveInterpreter(resource);
        const interpreterPath = interpreter?.path ?? pythonSettings.pythonPath;
        const command = this.platformService.isWindows ? interpreterPath.replace(/\\/g, '/') : interpreterPath;
        const launchArgs = pythonSettings.terminal.launchArgs;
        return buildPythonExecInfo(command, [...launchArgs, ...args]);
    }

    // Overridden in subclasses, see djangoShellCodeExecution.ts
    public async getExecuteFileArgs(resource?: Uri, executeArgs: string[] = []): Promise<PythonExecInfo> {
        return this.getExecutableInfo(resource, executeArgs);
    }
    private getTerminalService(resource: Resource, options?: { newTerminalPerFile: boolean }): ITerminalService {
        return this.terminalServiceFactory.getTerminalService({
            resource,
            title: this.terminalTitle,
            newTerminalPerFile: options?.newTerminalPerFile,
        });
    }
    private async setCwdForFileExecution(file: Uri, options?: { newTerminalPerFile: boolean }) {
        const pythonSettings = this.configurationService.getSettings(file);
        if (!pythonSettings.terminal.executeInFileDir) {
            return;
        }
        const fileDirPath = path.dirname(file.fsPath);
        if (fileDirPath.length > 0) {
            if (this.platformService.isWindows && /[a-z]\:/i.test(fileDirPath)) {
                const currentDrive =
                    typeof this.workspace.rootPath === 'string'
                        ? this.workspace.rootPath.replace(/\:.*/g, '')
                        : undefined;
                const fileDrive = fileDirPath.replace(/\:.*/g, '');
                if (fileDrive !== currentDrive || this.hasRanOutsideCurrentDrive) {
                    this.hasRanOutsideCurrentDrive = true;
                    await this.getTerminalService(file).sendText(`${fileDrive}:`);
                }
            }
            await this.getTerminalService(file, options).sendText(
                `cd ${fileDirPath.fileToCommandArgumentForPythonExt()}`,
            );
        }
    }
}
