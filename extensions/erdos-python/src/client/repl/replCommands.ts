import { commands, Uri, window } from 'vscode';
import { Disposable } from 'vscode-jsonrpc';
import { ICommandManager } from '../common/application/types';
import { Commands } from '../common/constants';
import { noop } from '../common/utils/misc';
import { IInterpreterService } from '../interpreter/contracts';
import { ICodeExecutionHelper } from '../terminals/types';
import { getNativeRepl } from './nativeRepl';
import {
    executeInTerminal,
    getActiveInterpreter,
    getSelectedTextToExecute,
    getSendToNativeREPLSetting,
    insertNewLineToREPLInput,
    isMultiLineText,
} from './replUtils';
import { registerCommand } from '../common/vscodeApis/commandApis';
import { sendTelemetryEvent } from '../telemetry';
import { EventName } from '../telemetry/constants';
import { ReplType } from './types';

/**
 * Register Start Native REPL command in the command palette
 */
export async function registerStartNativeReplCommand(
    disposables: Disposable[],
    interpreterService: IInterpreterService,
): Promise<void> {
    disposables.push(
        registerCommand(Commands.Start_Native_REPL, async (uri: Uri) => {
            sendTelemetryEvent(EventName.REPL, undefined, { replType: 'Native' });
            const interpreter = await getActiveInterpreter(uri, interpreterService);
            if (interpreter) {
                const nativeRepl = await getNativeRepl(interpreter, disposables);
                await nativeRepl.sendToNativeRepl(undefined, false);
            }
        }),
    );
}

/**
 * Registers REPL command for shift+enter if sendToNativeREPL setting is enabled.
 */
export async function registerReplCommands(
    disposables: Disposable[],
    interpreterService: IInterpreterService,
    executionHelper: ICodeExecutionHelper,
    commandManager: ICommandManager,
): Promise<void> {
    disposables.push(
        commandManager.registerCommand(Commands.Exec_In_REPL, async (uri: Uri) => {
            const nativeREPLSetting = getSendToNativeREPLSetting();

            if (!nativeREPLSetting) {
                await executeInTerminal();
                return;
            }
            const interpreter = await getActiveInterpreter(uri, interpreterService);

            if (interpreter) {
                const nativeRepl = await getNativeRepl(interpreter, disposables);
                const activeEditor = window.activeTextEditor;
                if (activeEditor) {
                    const code = await getSelectedTextToExecute(activeEditor);
                    if (code) {
                        // Smart Send
                        let wholeFileContent = '';
                        if (activeEditor && activeEditor.document) {
                            wholeFileContent = activeEditor.document.getText();
                        }
                        const normalizedCode = await executionHelper.normalizeLines(
                            code!,
                            ReplType.native,
                            wholeFileContent,
                        );
                        await nativeRepl.sendToNativeRepl(normalizedCode);
                    }
                }
            }
        }),
    );
}

/**
 * Command triggered for 'Enter': Conditionally call interactive.execute OR insert \n in text input box.
 */
export async function registerReplExecuteOnEnter(
    disposables: Disposable[],
    interpreterService: IInterpreterService,
    commandManager: ICommandManager,
): Promise<void> {
    disposables.push(
        commandManager.registerCommand(Commands.Exec_In_REPL_Enter, async (uri: Uri) => {
            await onInputEnter(uri, 'repl.execute', interpreterService, disposables);
        }),
    );
    disposables.push(
        commandManager.registerCommand(Commands.Exec_In_IW_Enter, async (uri: Uri) => {
            await onInputEnter(uri, 'interactive.execute', interpreterService, disposables);
        }),
    );
}

async function onInputEnter(
    uri: Uri,
    commandName: string,
    interpreterService: IInterpreterService,
    disposables: Disposable[],
): Promise<void> {
    const interpreter = await interpreterService.getActiveInterpreter(uri);
    if (!interpreter) {
        commands.executeCommand(Commands.TriggerEnvironmentSelection, uri).then(noop, noop);
        return;
    }

    const nativeRepl = await getNativeRepl(interpreter, disposables);
    const completeCode = await nativeRepl?.checkUserInputCompleteCode(window.activeTextEditor);
    const editor = window.activeTextEditor;

    if (editor) {
        // Execute right away when complete code and Not multi-line
        if (completeCode && !isMultiLineText(editor)) {
            await commands.executeCommand(commandName);
        } else {
            insertNewLineToREPLInput(editor);

            // Handle case when user enters on blank line, just trigger interactive.execute
            if (editor && editor.document.lineAt(editor.selection.active.line).text === '') {
                await commands.executeCommand(commandName);
            }
        }
    }
}
