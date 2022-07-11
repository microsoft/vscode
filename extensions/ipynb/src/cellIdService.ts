/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, NotebookDocument, NotebookDocumentChangeEvent, NotebookEdit, workspace, WorkspaceEdit } from 'vscode';
import { v4 as uuid } from 'uuid';
import { getCellMetadata } from './serializers';
import { CellMetadata } from './common';
import { getNotebookMetadata } from './notebookSerializer';
import * as nbformat from '@jupyterlab/nbformat';

/**
 * Ensure all new cells in notebooks with nbformat >= 4.5 have an id.
 * Details of the spec can be found here https://jupyter.org/enhancement-proposals/62-cell-id/cell-id.html#
 */
export function ensureAllNewCellsHaveCellIds(context: ExtensionContext) {
	workspace.onDidChangeNotebookDocument(onDidChangeNotebookCells, undefined, context.subscriptions);
}

function onDidChangeNotebookCells(e: NotebookDocumentChangeEvent) {
	const nbMetadata = getNotebookMetadata(e.notebook);
	if (!isCellIdRequired(nbMetadata)) {
		return;
	}
	e.contentChanges.forEach(change => {
		change.addedCells.forEach(cell => {
			const cellMetadata = getCellMetadata(cell);
			if (cellMetadata?.id) {
				return;
			}
			const id = generateCellId(e.notebook);
			const edit = new WorkspaceEdit();
			// Don't edit the metadata directly, always get a clone (prevents accidental singletons and directly editing the objects).
			const updatedMetadata: CellMetadata = { ...JSON.parse(JSON.stringify(cellMetadata || {})) };
			updatedMetadata.id = id;
			edit.set(cell.notebook.uri, [NotebookEdit.updateCellMetadata(cell.index, { ...(cell.metadata), custom: updatedMetadata })]);
			workspace.applyEdit(edit);
		});
	});
}

/**
 * Cell ids are required in notebooks only in notebooks with nbformat >= 4.5
 */
function isCellIdRequired(metadata: Pick<Partial<nbformat.INotebookContent>, 'nbformat' | 'nbformat_minor'>) {
	if ((metadata.nbformat || 0) >= 5) {
		return true;
	}
	if ((metadata.nbformat || 0) === 4 && (metadata.nbformat_minor || 0) >= 5) {
		return true;
	}
	return false;
}

function generateCellId(notebook: NotebookDocument) {
	while (true) {
		// Details of the id can be found here https://jupyter.org/enhancement-proposals/62-cell-id/cell-id.html#adding-an-id-field,
		// & here https://jupyter.org/enhancement-proposals/62-cell-id/cell-id.html#updating-older-formats
		const id = uuid().replace(/-/g, '').substring(0, 8);
		let duplicate = false;
		for (let index = 0; index < notebook.cellCount; index++) {
			const cell = notebook.cellAt(index);
			const existingId = getCellMetadata(cell)?.id;
			if (!existingId) {
				continue;
			}
			if (existingId === id) {
				duplicate = true;
				break;
			}
		}
		if (!duplicate) {
			return id;
		}
	}
}
