/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { nbformat } from '@jupyterlab/coreutils';
import detectIndent = require('detect-indent');
import * as vscode from 'vscode';
import { defaultNotebookFormat } from './constants';
import { createJupyterCellFromVSCNotebookCell, getPreferredLanguage, notebookModelToVSCNotebookData, pruneCell } from './helpers';

export function registerNotebookSerializer(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer('jupyter-notebook', new NotebookSerializer(), {
        transientOutputs: false,
        transientCellMetadata: {
            breakpointMargin: true,
            inputCollapsed: true,
            outputCollapsed: true,
            custom: false
        }
    }));
}

export class NotebookSerializer implements vscode.NotebookSerializer {
    public deserializeNotebook(content: Uint8Array, _token: vscode.CancellationToken): vscode.NotebookData {
        const contents = new TextDecoder().decode(content.buffer.slice(content.byteOffset));
        const json = contents ? (JSON.parse(contents) as Partial<nbformat.INotebookContent>) : {};

        // Then compute indent. It's computed from the contents
        const indentAmount = contents ? detectIndent(contents).indent : ' ';

        const preferredCellLanguage = getPreferredLanguage(json?.metadata);
        // Ensure we always have a blank cell.
        if ((json?.cells || []).length === 0) {
            json.cells = [
                {
                    cell_type: 'code',
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: ''
                }
            ];
        }
        // For notebooks without metadata default the language in metadata to the preferred language.
        if (!json.metadata || (!json.metadata.kernelspec && !json.metadata.language_info)) {
            json.metadata = json?.metadata || { orig_nbformat: defaultNotebookFormat.major };
            json.metadata.language_info = json.metadata.language_info || { name: preferredCellLanguage };
        }
        const data = notebookModelToVSCNotebookData(
            { ...json, cells: [] },
            json?.cells || [],
            preferredCellLanguage,
            json || {}
        );
        data.metadata = data.metadata || {};
        data.metadata.indentAmount = indentAmount;

        return data;
    }
    public serializeNotebookDocument(data: vscode.NotebookDocument): string {
        return this.serialize(data);
    }
    public serializeNotebook(data: vscode.NotebookData, _token: vscode.CancellationToken): Uint8Array {
        return new TextEncoder().encode(this.serialize(data));
    }
    private serialize(data: vscode.NotebookDocument | vscode.NotebookData): string {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const notebookContent: Partial<nbformat.INotebookContent> = (data.metadata?.custom as any) || {};
        notebookContent.cells = notebookContent.cells || [];
        notebookContent.nbformat = notebookContent.nbformat || 4;
        notebookContent.nbformat_minor = notebookContent.nbformat_minor || 2;
        notebookContent.metadata = notebookContent.metadata || { orig_nbformat: 4 };

        // Override with what ever is in the metadata.
        const indentAmount =
            data.metadata && 'indentAmount' in data.metadata && typeof data.metadata.indentAmount === 'string'
                ? data.metadata.indentAmount
                : ' ';

        if ('notebookType' in data) {
            notebookContent.cells = data
                .getCells()
                .map((cell) => createJupyterCellFromVSCNotebookCell(cell))
                .map(pruneCell);
        } else {
            notebookContent.cells = data.cells.map((cell) => createJupyterCellFromVSCNotebookCell(cell)).map(pruneCell);
        }

        return JSON.stringify(notebookContent, undefined, indentAmount);
    }
}
