import { NotebookDocument, TextEditor, Selection, Uri, commands, window, TabInputNotebook, ViewColumn } from 'vscode';
import { Commands } from '../common/constants';
import { noop } from '../common/utils/misc';
import { getActiveResource } from '../common/vscodeApis/windowApis';
import { getConfiguration } from '../common/vscodeApis/workspaceApis';
import { IInterpreterService } from '../interpreter/contracts';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { getMultiLineSelectionText, getSingleLineSelectionText } from '../terminals/codeExecution/helper';

/**
 * Function that executes selected code in the terminal.
 */
export async function executeInTerminal(): Promise<void> {
    await commands.executeCommand(Commands.Exec_Selection_In_Terminal);
}

/**
 * Function that returns selected text to execute in the REPL.
 * @param textEditor
 * @returns code - Code to execute in the REPL.
 */
export async function getSelectedTextToExecute(textEditor: TextEditor): Promise<string | undefined> {
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

/**
 * Function that returns user's Native REPL setting.
 * @returns boolean - True if sendToNativeREPL setting is enabled, False otherwise.
 */
export function getSendToNativeREPLSetting(): boolean {
    const uri = getActiveResource();
    const configuration = getConfiguration('python', uri);
    return configuration.get<boolean>('REPL.sendToNativeREPL', false);
}

// Function that inserts new line in the given (input) text editor
export function insertNewLineToREPLInput(activeEditor: TextEditor | undefined): void {
    if (activeEditor) {
        const position = activeEditor.selection.active;
        const newPosition = position.with(position.line, activeEditor.document.lineAt(position.line).text.length);
        activeEditor.selection = new Selection(newPosition, newPosition);

        activeEditor.edit((editBuilder) => {
            editBuilder.insert(newPosition, '\n');
        });
    }
}

export function isMultiLineText(textEditor: TextEditor): boolean {
    return (textEditor?.document?.lineCount ?? 0) > 1;
}

/**
 * Function that trigger interpreter warning if invalid interpreter.
 * Function will also return undefined or active interpreter
 */
export async function getActiveInterpreter(
    uri: Uri,
    interpreterService: IInterpreterService,
): Promise<PythonEnvironment | undefined> {
    const interpreter = await interpreterService.getActiveInterpreter(uri);
    if (!interpreter) {
        commands.executeCommand(Commands.TriggerEnvironmentSelection, uri).then(noop, noop);
        return undefined;
    }
    return interpreter;
}

/**
 * Function that will return ViewColumn for existing Native REPL that belongs to given  NotebookDocument.
 */
export function getExistingReplViewColumn(notebookDocument: NotebookDocument): ViewColumn | undefined {
    const ourNotebookUri = notebookDocument.uri.toString();
    // Use Tab groups, to locate previously opened Python REPL tab and fetch view column.
    const ourTb = window.tabGroups;
    for (const tabGroup of ourTb.all) {
        for (const tab of tabGroup.tabs) {
            if (tab.label === 'Python REPL') {
                const tabInput = (tab.input as unknown) as TabInputNotebook;
                const tabUri = tabInput.uri.toString();
                if (tab.input && tabUri === ourNotebookUri) {
                    // This is the tab we are looking for.
                    const existingReplViewColumn = tab.group.viewColumn;
                    return existingReplViewColumn;
                }
            }
        }
    }
    return undefined;
}

/**
 * Function that will return tab name for before reloading VS Code
 * This is so we can make sure tab name is still 'Python REPL' after reloading VS Code,
 * and make sure Python REPL does not get 'merged' into unaware untitled.ipynb tab.
 */
export function getTabNameForUri(uri: Uri): string | undefined {
    const tabGroups = window.tabGroups.all;

    for (const tabGroup of tabGroups) {
        for (const tab of tabGroup.tabs) {
            if (tab.input instanceof TabInputNotebook && tab.input.uri.toString() === uri.toString()) {
                return tab.label;
            }
        }
    }

    return undefined;
}

/**
 * Function that will return the minor version of current active Python interpreter.
 */
export async function getPythonMinorVersion(
    uri: Uri | undefined,
    interpreterService: IInterpreterService,
): Promise<number | undefined> {
    if (uri) {
        const pythonVersion = await getActiveInterpreter(uri, interpreterService);
        return pythonVersion?.version?.minor;
    }
    return undefined;
}
