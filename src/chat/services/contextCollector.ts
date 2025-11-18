import * as vscode from 'vscode';
import { WorkspaceContext } from '../promptProcessor';

/**
 * Collect context from visible text editors. For each open editor we include
 * its file path and either the current selection or the first ~200 lines of
 * the file.
 */
export async function collectContext(): Promise<WorkspaceContext> {
    const editors = vscode.window.visibleTextEditors;
    const filePaths: string[] = [];
    const summaries: string[] = [];

    console.debug('[chat] collecting context from', editors.length, 'editors');

    for (const editor of editors) {
        const doc = editor.document;
        filePaths.push(doc.uri.fsPath);
        console.debug('[chat] collecting context for', doc.uri.fsPath);
        let text: string;
        if (editor.selection && !editor.selection.isEmpty) {
            text = doc.getText(editor.selection);
        } else {
            const maxLine = Math.min(200, doc.lineCount);
            text = doc.getText(new vscode.Range(0, 0, maxLine, 0));
        }
        const lines = text.split(/\r?\n/).slice(0, 200);
        summaries.push(`File: ${doc.uri.fsPath}\n${lines.join('\n')}`);
    }

    console.debug('[chat] collected context for files', filePaths);
    return { filePaths, summaries };
}
