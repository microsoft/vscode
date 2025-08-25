// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Disposable, EventEmitter, Terminal, Uri } from 'vscode';
import * as vscode from 'vscode';
import * as erdos from 'erdos';
import { ICommandManager, IDocumentManager } from '../../common/application/types';
import { Commands } from '../../common/constants';
import '../../common/extensions';
import { IDisposableRegistry, IConfigurationService, Resource } from '../../common/types';
import { noop } from '../../common/utils/misc';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { traceError, traceVerbose } from '../../logging';
import { captureTelemetry, sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { ICodeExecutionHelper, ICodeExecutionManager, ICodeExecutionService } from '../../terminals/types';
import {
    CreateEnvironmentCheckKind,
    triggerCreateEnvironmentCheckNonBlocking,
} from '../../pythonEnvironments/creation/createEnvironmentTrigger';
import { ReplType } from '../../repl/types';
import { runInDedicatedTerminal, runInTerminal, useEnvExtension } from '../../envExt/api.internal';

@injectable()
export class CodeExecutionManager implements ICodeExecutionManager {
    private eventEmitter: EventEmitter<string> = new EventEmitter<string>();
    constructor(
        @inject(ICommandManager) private commandManager: ICommandManager,
        @inject(IDocumentManager) private documentManager: IDocumentManager,
        @inject(IDisposableRegistry) private disposableRegistry: Disposable[],
        @inject(IConfigurationService) private readonly configSettings: IConfigurationService,
        @inject(IServiceContainer) private serviceContainer: IServiceContainer,
    ) {}

    public registerCommands() {
        [Commands.Exec_In_Terminal, Commands.Exec_In_Terminal_Icon, Commands.Exec_In_Separate_Terminal].forEach(
            (cmd) => {
                this.disposableRegistry.push(
                    this.commandManager.registerCommand(cmd as any, async (file: Resource) => {
                        traceVerbose(`Attempting to run Python file`, file?.fsPath);
                        const trigger = cmd === Commands.Exec_In_Terminal ? 'command' : 'icon';
                        const newTerminalPerFile = cmd === Commands.Exec_In_Separate_Terminal;

                        if (useEnvExtension()) {
                            try {
                                await this.executeUsingExtension(file, cmd === Commands.Exec_In_Separate_Terminal);
                            } catch (ex) {
                                traceError('Failed to execute file in terminal', ex);
                            }
                            sendTelemetryEvent(EventName.ENVIRONMENT_CHECK_TRIGGER, undefined, {
                                trigger: 'run-in-terminal',
                            });
                            sendTelemetryEvent(EventName.EXECUTION_CODE, undefined, {
                                scope: 'file',
                                trigger,
                                newTerminalPerFile,
                            });
                            return;
                        }

                        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
                        const interpreter = await interpreterService.getActiveInterpreter(file);
                        if (!interpreter) {
                            this.commandManager
                                .executeCommand(Commands.TriggerEnvironmentSelection, file)
                                .then(noop, noop);
                            return;
                        }
                        sendTelemetryEvent(EventName.ENVIRONMENT_CHECK_TRIGGER, undefined, {
                            trigger: 'run-in-terminal',
                        });
                        triggerCreateEnvironmentCheckNonBlocking(CreateEnvironmentCheckKind.File, file);

                        await this.executeFileInTerminal(file, trigger, {
                            newTerminalPerFile,
                        })
                            .then(() => {
                                if (this.shouldTerminalFocusOnStart(file))
                                    this.commandManager.executeCommand('workbench.action.terminal.focus');
                            })
                            .catch((ex) => traceError('Failed to execute file in terminal', ex));
                    }),
                );
            },
        );
        this.disposableRegistry.push(
            this.commandManager.registerCommand(Commands.Exec_Selection_In_Terminal as any, async (file: Resource) => {
                const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getActiveInterpreter(file);
                if (!interpreter) {
                    this.commandManager.executeCommand(Commands.TriggerEnvironmentSelection, file).then(noop, noop);
                    return;
                }
                sendTelemetryEvent(EventName.ENVIRONMENT_CHECK_TRIGGER, undefined, { trigger: 'run-selection' });
                triggerCreateEnvironmentCheckNonBlocking(CreateEnvironmentCheckKind.File, file);
                await this.executeSelectionInTerminal().then(() => {
                    if (this.shouldTerminalFocusOnStart(file))
                        this.commandManager.executeCommand('workbench.action.terminal.focus');
                });
            }),
        );
        this.disposableRegistry.push(
            this.commandManager.registerCommand(
                Commands.Exec_Selection_In_Django_Shell as any,
                async (file: Resource) => {
                    const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
                    const interpreter = await interpreterService.getActiveInterpreter(file);
                    if (!interpreter) {
                        this.commandManager.executeCommand(Commands.TriggerEnvironmentSelection, file).then(noop, noop);
                        return;
                    }
                    sendTelemetryEvent(EventName.ENVIRONMENT_CHECK_TRIGGER, undefined, { trigger: 'run-selection' });
                    triggerCreateEnvironmentCheckNonBlocking(CreateEnvironmentCheckKind.File, file);
                    await this.executeSelectionInDjangoShell().then(() => {
                        if (this.shouldTerminalFocusOnStart(file))
                            this.commandManager.executeCommand('workbench.action.terminal.focus');
                    });
                },
            ),
        );
        this.disposableRegistry.push(
            this.commandManager.registerCommand(Commands.Exec_In_Console as any, async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    return;
                }

                const filePath = editor.document.uri.fsPath;
                if (!filePath) {
                    vscode.window.showWarningMessage('Cannot source unsaved file.');
                    return;
                }

                await vscode.commands.executeCommand('workbench.action.files.save');

                try {
                    const fsStat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));

                    if (fsStat) {
                        const command = `%run ${JSON.stringify(filePath)}`;
                        erdos.runtime.executeCode('python', command, false, true);
                    }
                } catch (e) {
                }
            }),
        );
        this.disposableRegistry.push(
            this.commandManager.registerCommand(Commands.Exec_Selection_In_Console as any, async () => {
                await vscode.commands.executeCommand('workbench.action.erdosConsole.executeCode', {
                    allowIncomplete: true,
                });
            }),
        );
    }

    private async executeUsingExtension(file: Resource, dedicated: boolean): Promise<void> {
        const codeExecutionHelper = this.serviceContainer.get<ICodeExecutionHelper>(ICodeExecutionHelper);
        file = file instanceof Uri ? file : undefined;
        let fileToExecute = file ? file : await codeExecutionHelper.getFileToExecute();
        if (!fileToExecute) {
            return;
        }



        const fileAfterSave = await codeExecutionHelper.saveFileIfDirty(fileToExecute);
        if (fileAfterSave) {
            fileToExecute = fileAfterSave;
        }

        const show = this.shouldTerminalFocusOnStart(fileToExecute);
        let terminal: Terminal | undefined;
        if (dedicated) {
            terminal = await runInDedicatedTerminal(
                fileToExecute,
                [fileToExecute.fsPath.fileToCommandArgumentForPythonExt()],
                undefined,
                show,
            );
        } else {
            terminal = await runInTerminal(
                fileToExecute,
                [fileToExecute.fsPath.fileToCommandArgumentForPythonExt()],
                undefined,
                show,
            );
        }

        if (terminal) {
            terminal.show();
        }
    }

    private async executeFileInTerminal(
        file: Resource,
        trigger: 'command' | 'icon',
        options?: { newTerminalPerFile: boolean },
    ): Promise<void> {
        sendTelemetryEvent(EventName.EXECUTION_CODE, undefined, {
            scope: 'file',
            trigger,
            newTerminalPerFile: options?.newTerminalPerFile,
        });
        const codeExecutionHelper = this.serviceContainer.get<ICodeExecutionHelper>(ICodeExecutionHelper);
        file = file instanceof Uri ? file : undefined;
        let fileToExecute = file ? file : await codeExecutionHelper.getFileToExecute();
        if (!fileToExecute) {
            return;
        }
        const fileAfterSave = await codeExecutionHelper.saveFileIfDirty(fileToExecute);
        if (fileAfterSave) {
            fileToExecute = fileAfterSave;
        }

        const executionService = this.serviceContainer.get<ICodeExecutionService>(ICodeExecutionService, 'standard');
        await executionService.executeFile(fileToExecute, options);
    }

    @captureTelemetry(EventName.EXECUTION_CODE, { scope: 'selection' }, false)
    private async executeSelectionInTerminal(): Promise<void> {
        const executionService = this.serviceContainer.get<ICodeExecutionService>(ICodeExecutionService, 'standard');

        await this.executeSelection(executionService);
    }

    @captureTelemetry(EventName.EXECUTION_DJANGO, { scope: 'selection' }, false)
    private async executeSelectionInDjangoShell(): Promise<void> {
        const executionService = this.serviceContainer.get<ICodeExecutionService>(ICodeExecutionService, 'djangoShell');
        await this.executeSelection(executionService);
    }

    private async executeSelection(executionService: ICodeExecutionService): Promise<void> {
        const activeEditor = this.documentManager.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const codeExecutionHelper = this.serviceContainer.get<ICodeExecutionHelper>(ICodeExecutionHelper);
        const codeToExecute = await codeExecutionHelper.getSelectedTextToExecute(activeEditor);
        let wholeFileContent = '';
        if (activeEditor && activeEditor.document) {
            wholeFileContent = activeEditor.document.getText();
        }
        const normalizedCode = await codeExecutionHelper.normalizeLines(
            codeToExecute!,
            ReplType.terminal,
            wholeFileContent,
        );
        if (!normalizedCode || normalizedCode.trim().length === 0) {
            return;
        }

        try {
            this.eventEmitter.fire(normalizedCode);
        } catch {
            // Ignore any errors that occur for firing this event. It's only used
            // for telemetry
            noop();
        }

        await executionService.execute(normalizedCode, activeEditor.document.uri);
    }

    private shouldTerminalFocusOnStart(uri: Uri | undefined): boolean {
        return this.configSettings.getSettings(uri)?.terminal.focusAfterLaunch;
    }
}
