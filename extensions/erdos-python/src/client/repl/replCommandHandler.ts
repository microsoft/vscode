import {
    NotebookEditor,
    ViewColumn,
    NotebookDocument,
    NotebookCellData,
    NotebookCellKind,
    NotebookEdit,
    WorkspaceEdit,
    Uri,
} from 'vscode';
import { getExistingReplViewColumn, getTabNameForUri } from './replUtils';
import { showNotebookDocument } from '../common/vscodeApis/windowApis';
import { openNotebookDocument, applyEdit } from '../common/vscodeApis/workspaceApis';
import { executeCommand } from '../common/vscodeApis/commandApis';

/**
 * Function that opens/show REPL using IW UI.
 */
export async function openInteractiveREPL(
    notebookDocument: NotebookDocument | Uri | undefined,
    preserveFocus: boolean = true,
): Promise<{ notebookEditor: NotebookEditor; documentCreated: boolean } | undefined> {
    let viewColumn = ViewColumn.Beside;
    let alreadyExists = false;
    if (notebookDocument instanceof Uri) {
        // Case where NotebookDocument is undefined, but workspace mementoURI exists.
        notebookDocument = await openNotebookDocument(notebookDocument);
    } else if (notebookDocument) {
        // Case where NotebookDocument (REPL document already exists in the tab)
        const existingReplViewColumn = getExistingReplViewColumn(notebookDocument);
        viewColumn = existingReplViewColumn ?? viewColumn;
        alreadyExists = true;
    } else if (!notebookDocument) {
        // Case where NotebookDocument doesnt exist, or
        // became outdated (untitled.ipynb created without Python extension knowing, effectively taking over original Python REPL's URI)
        notebookDocument = await openNotebookDocument('jupyter-notebook');
    }

    const notebookEditor = await showNotebookDocument(notebookDocument!, {
        viewColumn,
        asRepl: 'Python REPL',
        preserveFocus,
    });

    // Sanity check that we opened a Native REPL from showNotebookDocument.
    if (
        !notebookEditor ||
        !notebookEditor.notebook ||
        !notebookEditor.notebook.uri ||
        getTabNameForUri(notebookEditor.notebook.uri) !== 'Python REPL'
    ) {
        return undefined;
    }

    return { notebookEditor, documentCreated: !alreadyExists };
}

/**
 * Function that selects notebook Kernel.
 */
export async function selectNotebookKernel(
    notebookEditor: NotebookEditor,
    notebookControllerId: string,
    extensionId: string,
): Promise<void> {
    await executeCommand('notebook.selectKernel', {
        notebookEditor,
        id: notebookControllerId,
        extension: extensionId,
    });
}

/**
 * Function that executes notebook cell given code.
 */
export async function executeNotebookCell(notebookEditor: NotebookEditor, code: string): Promise<void> {
    const { notebook, replOptions } = notebookEditor;
    const cellIndex = replOptions?.appendIndex ?? notebook.cellCount;
    await addCellToNotebook(notebook, cellIndex, code);
    // Execute the cell
    executeCommand('notebook.cell.execute', {
        ranges: [{ start: cellIndex, end: cellIndex + 1 }],
        document: notebook.uri,
    });
}

/**
 * Function that adds cell to notebook.
 * This function will only get called when notebook document is defined.
 */
async function addCellToNotebook(notebookDocument: NotebookDocument, index: number, code: string): Promise<void> {
    const notebookCellData = new NotebookCellData(NotebookCellKind.Code, code as string, 'python');
    // Add new cell to interactive window document
    const notebookEdit = NotebookEdit.insertCells(index, [notebookCellData]);
    const workspaceEdit = new WorkspaceEdit();
    workspaceEdit.set(notebookDocument!.uri, [notebookEdit]);
    await applyEdit(workspaceEdit);
}
