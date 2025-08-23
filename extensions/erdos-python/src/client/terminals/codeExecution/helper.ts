// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import '../../common/extensions';

import { inject, injectable } from 'inversify';
import { l10n, Position, Range, TextEditor, Uri } from 'vscode';

import {
    IActiveResourceService,
    IApplicationShell,
    ICommandManager,
    IDocumentManager,
    IWorkspaceService,
} from '../../common/application/types';
import { PYTHON_LANGUAGE } from '../../common/constants';
import * as internalScripts from '../../common/process/internal/scripts';
import { IProcessServiceFactory } from '../../common/process/types';
import { createDeferred } from '../../common/utils/async';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { ICodeExecutionHelper } from '../types';
import { traceError } from '../../logging';
import { IConfigurationService, Resource } from '../../common/types';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { ReplType } from '../../repl/types';

@injectable()
export class CodeExecutionHelper implements ICodeExecutionHelper {
    private readonly documentManager: IDocumentManager;

    private readonly applicationShell: IApplicationShell;

    private readonly processServiceFactory: IProcessServiceFactory;

    private readonly interpreterService: IInterpreterService;

    private readonly commandManager: ICommandManager;

    private activeResourceService: IActiveResourceService;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error TS6133: 'configSettings' is declared but its value is never read.
    private readonly configSettings: IConfigurationService;

    constructor(@inject(IServiceContainer) private readonly serviceContainer: IServiceContainer) {
        this.documentManager = serviceContainer.get<IDocumentManager>(IDocumentManager);
        this.applicationShell = serviceContainer.get<IApplicationShell>(IApplicationShell);
        this.processServiceFactory = serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory);
        this.interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
        this.configSettings = serviceContainer.get<IConfigurationService>(IConfigurationService);
        this.commandManager = serviceContainer.get<ICommandManager>(ICommandManager);
        this.activeResourceService = this.serviceContainer.get<IActiveResourceService>(IActiveResourceService);
    }

    public async normalizeLines(
        code: string,
        _replType: ReplType,
        wholeFileContent?: string,
        resource?: Uri,
    ): Promise<string> {
        try {
            if (code.trim().length === 0) {
                return '';
            }
            // On windows cr is not handled well by python when passing in/out via stdin/stdout.
            // So just remove cr from the input.
            code = code.replace(new RegExp('\\r', 'g'), '');

            const activeEditor = this.documentManager.activeTextEditor;
            const interpreter = await this.interpreterService.getActiveInterpreter(resource);
            const processService = await this.processServiceFactory.create(resource);

            const [args, parse] = internalScripts.normalizeSelection();
            const observable = processService.execObservable(interpreter?.path || 'python', args, {
                throwOnStdErr: true,
            });
            const normalizeOutput = createDeferred<string>();

            // Read result from the normalization script from stdout, and resolve the promise when done.
            let normalized = '';
            observable.out.subscribe({
                next: (output) => {
                    if (output.source === 'stdout') {
                        normalized += output.out;
                    }
                },
                complete: () => {
                    normalizeOutput.resolve(normalized);
                },
            });
            // If there is no explicit selection, we are exeucting 'line' or 'block'.
            if (activeEditor?.selection?.isEmpty) {
                sendTelemetryEvent(EventName.EXECUTION_CODE, undefined, { scope: 'line' });
            }
            // The normalization script expects a serialized JSON object, with the selection under the "code" key.
            // We're using a JSON object so that we don't have to worry about encoding, or escaping non-ASCII characters.
            const startLineVal = activeEditor?.selection?.start.line ?? 0;
            const endLineVal = activeEditor?.selection?.end.line ?? 0;
            const emptyHighlightVal = activeEditor?.selection?.isEmpty ?? true;
            let smartSendSettingsEnabledVal = true;
            let shellIntegrationEnabled = false;
            const configuration = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
            if (configuration) {
                const pythonSettings = configuration.getSettings(this.activeResourceService.getActiveResource());
                smartSendSettingsEnabledVal = pythonSettings.REPL.enableREPLSmartSend;
                shellIntegrationEnabled = pythonSettings.terminal.shellIntegration.enabled;
            }

            const input = JSON.stringify({
                code,
                wholeFileContent,
                startLine: startLineVal,
                endLine: endLineVal,
                emptyHighlight: emptyHighlightVal,
                smartSendSettingsEnabled: smartSendSettingsEnabledVal,
            });
            observable.proc?.stdin?.write(input);
            observable.proc?.stdin?.end();

            // We expect a serialized JSON object back, with the normalized code under the "normalized" key.
            const result = await normalizeOutput.promise;
            const object = JSON.parse(result);

            if (activeEditor?.selection && smartSendSettingsEnabledVal && object.normalized !== 'deprecated') {
                const lineOffset = object.nextBlockLineno - activeEditor!.selection.start.line - 1;
                await this.moveToNextBlock(lineOffset, activeEditor);
            }

            // For new _pyrepl for Python3.13+ && !shellIntegration, we need to send code via bracketed paste mode.
            if (object.attach_bracket_paste && !shellIntegrationEnabled && _replType === ReplType.terminal) {
                let trimmedNormalized = object.normalized.replace(/\n$/, '');
                if (trimmedNormalized.endsWith(':\n')) {
                    // In case where statement is unfinished via :, truncate so auto-indentation lands nicely.
                    trimmedNormalized = trimmedNormalized.replace(/\n$/, '');
                }
                return `\u001b[200~${trimmedNormalized}\u001b[201~`;
            }

            return parse(object.normalized);
        } catch (ex) {
            traceError(ex, 'Python: Failed to normalize code for execution in terminal');
            return code;
        }
    }

    /**
     * Depending on whether or not user is in experiment for smart send,
     * dynamically move the cursor to the next block of code.
     * The cursor movement is not moved by one everytime,
     * since with the smart selection, the next executable code block
     * can be multiple lines away.
     * Intended to provide smooth shift+enter user experience
     * bringing user's cursor to the next executable block of code when used with smart selection.
     */
    // eslint-disable-next-line class-methods-use-this
    private async moveToNextBlock(lineOffset: number, activeEditor?: TextEditor): Promise<void> {
        if (activeEditor?.selection?.isEmpty) {
            await this.commandManager.executeCommand('cursorMove', {
                to: 'down',
                by: 'line',
                value: Number(lineOffset),
            });
            await this.commandManager.executeCommand('cursorEnd');
        }

        return Promise.resolve();
    }

    public async getFileToExecute(): Promise<Uri | undefined> {
        const activeEditor = this.documentManager.activeTextEditor;
        if (!activeEditor) {
            this.applicationShell.showErrorMessage(l10n.t('No open file to run in terminal'));
            return undefined;
        }
        if (activeEditor.document.isUntitled) {
            this.applicationShell.showErrorMessage(l10n.t('The active file needs to be saved before it can be run'));
            return undefined;
        }
        if (activeEditor.document.languageId !== PYTHON_LANGUAGE) {
            this.applicationShell.showErrorMessage(l10n.t('The active file is not a Python source file'));
            return undefined;
        }
        if (activeEditor.document.isDirty) {
            await activeEditor.document.save();
        }

        return activeEditor.document.uri;
    }

    // eslint-disable-next-line class-methods-use-this
    public async getSelectedTextToExecute(textEditor: TextEditor): Promise<string | undefined> {
        if (!textEditor) {
            return undefined;
        }

        const { selection } = textEditor;
        let code: string;

        if (selection.isEmpty) {
            code = textEditor.document.lineAt(selection.start.line).text;
        } else if (selection.isSingleLine) {
            code = getSingleLineSelectionText(textEditor);
        } else {
            code = getMultiLineSelectionText(textEditor);
        }

        return code;
    }

    public async saveFileIfDirty(file: Uri): Promise<Resource> {
        const docs = this.documentManager.textDocuments.filter((d) => d.uri.path === file.path);
        if (docs.length === 1 && (docs[0].isDirty || docs[0].isUntitled)) {
            const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
            return workspaceService.save(docs[0].uri);
        }
        return undefined;
    }
}

export function getSingleLineSelectionText(textEditor: TextEditor): string {
    const { selection } = textEditor;
    const selectionRange = new Range(selection.start, selection.end);
    const selectionText = textEditor.document.getText(selectionRange);
    const fullLineText = textEditor.document.lineAt(selection.start.line).text;

    if (selectionText.trim() === fullLineText.trim()) {
        // This handles the following case:
        // if (x):
        //     print(x)
        //     ↑------↑   <--- selection range
        //
        // We should return:
        //     print(x)
        // ↑----------↑    <--- text including the initial white space
        return fullLineText;
    }

    // This is where part of the line is selected:
    // if(isPrime(x) || isFibonacci(x)):
    //    ↑--------↑    <--- selection range
    //
    // We should return just the selection:
    // isPrime(x)
    return selectionText;
}

export function getMultiLineSelectionText(textEditor: TextEditor): string {
    const { selection } = textEditor;
    const selectionRange = new Range(selection.start, selection.end);
    const selectionText = textEditor.document.getText(selectionRange);

    const fullTextRange = new Range(
        new Position(selection.start.line, 0),
        new Position(selection.end.line, textEditor.document.lineAt(selection.end.line).text.length),
    );
    const fullText = textEditor.document.getText(fullTextRange);

    // This handles case where:
    // def calc(m, n):
    //     ↓<------------------------------- selection start
    //     print(m)
    //     print(n)
    //            ↑<------------------------ selection end
    //     if (m == 0):
    //         return n + 1
    //     if (m > 0 and n == 0):
    //         return calc(m - 1 , 1)
    //     return calc(m - 1, calc(m, n - 1))
    //
    // We should return:
    // ↓<---------------------------------- From here
    //     print(m)
    //     print(n)
    //            ↑<----------------------- To here
    if (selectionText.trim() === fullText.trim()) {
        return fullText;
    }

    const fullStartLineText = textEditor.document.lineAt(selection.start.line).text;
    const selectionFirstLineRange = new Range(
        selection.start,
        new Position(selection.start.line, fullStartLineText.length),
    );
    const selectionFirstLineText = textEditor.document.getText(selectionFirstLineRange);

    // This handles case where:
    // def calc(m, n):
    //     ↓<------------------------------ selection start
    //     if (m == 0):
    //         return n + 1
    //                ↑<------------------- selection end (notice " + 1" is not selected)
    //     if (m > 0 and n == 0):
    //         return calc(m - 1 , 1)
    //     return calc(m - 1, calc(m, n - 1))
    //
    // We should return:
    // ↓<---------------------------------- From here
    //     if (m == 0):
    //         return n + 1
    //                ↑<------------------- To here (notice " + 1" is not selected)
    if (selectionFirstLineText.trimLeft() === fullStartLineText.trimLeft()) {
        return fullStartLineText + selectionText.substr(selectionFirstLineText.length);
    }

    // If you are here then user has selected partial start and partial end lines:
    // def calc(m, n):

    //     if (m == 0):
    //         return n + 1

    //        ↓<------------------------------- selection start
    //     if (m > 0
    //         and n == 0):
    //                   ↑<-------------------- selection end
    //         return calc(m - 1 , 1)
    //     return calc(m - 1, calc(m, n - 1))
    //
    // We should return:
    // ↓<---------------------------------- From here
    // (m > 0
    //         and n == 0)
    //                   ↑<---------------- To here
    return selectionText;
}
