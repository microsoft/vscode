/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, NotebookCellKind, NotebookDocument, NotebookDocumentChangeEvent, NotebookEdit, workspace, WorkspaceEdit, type NotebookCell, type NotebookDocumentWillSaveEvent } from 'vscode';
import { getCellMetadata, getVSCodeCellLanguageId, removeVSCodeCellLanguageId, setVSCodeCellLanguageId, sortObjectPropertiesRecursively } from './serializers';
import { CellMetadata, useCustomPropertyInMetadata } from './common';
import { getNotebookMetadata } from './notebookSerializer';
import type * as nbformat from '@jupyterlab/nbformat';

const noop = () => {
	//
};

/**
 * Code here is used to ensure the Notebook Model is in sync the the ipynb JSON file.
 * E.g. assume you add a new cell, this new cell will not have any metadata at all.
 * However when we save the ipynb, the metadata will be an empty object `{}`.
 * Now thats completely different from the metadata os being `empty/undefined` in the model.
 * As a result, when looking at things like diff view or accessing metadata, we'll see differences.
*
* This code ensures that the model is in sync with the ipynb file.
*/
export const pendingNotebookCellModelUpdates = new WeakMap<NotebookDocument, Set<Thenable<void>>>();
export function activate(context: ExtensionContext) {
	workspace.onDidChangeNotebookDocument(onDidChangeNotebookCells, undefined, context.subscriptions);
	workspace.onWillSaveNotebookDocument(waitForPendingModelUpdates, undefined, context.subscriptions);
}

function isSupportedNotebook(notebook: NotebookDocument) {
	return notebook.notebookType === 'jupyter-notebook' || notebook.notebookType === 'interactive';
}

function waitForPendingModelUpdates(e: NotebookDocumentWillSaveEvent) {
	if (!isSupportedNotebook(e.notebook)) {
		return;
	}

	const promises = pendingNotebookCellModelUpdates.get(e.notebook);
	if (!promises) {
		return;
	}
	e.waitUntil(Promise.all(promises));
}

function cleanup(notebook: NotebookDocument, promise: PromiseLike<void>) {
	const pendingUpdates = pendingNotebookCellModelUpdates.get(notebook);
	if (pendingUpdates) {
		pendingUpdates.delete(promise);
		if (!pendingUpdates.size) {
			pendingNotebookCellModelUpdates.delete(notebook);
		}
	}
}
function trackAndUpdateCellMetadata(notebook: NotebookDocument, updates: { cell: NotebookCell; metadata: CellMetadata & { vscode?: { languageId: string } } }[]) {
	const pendingUpdates = pendingNotebookCellModelUpdates.get(notebook) ?? new Set<Thenable<void>>();
	pendingNotebookCellModelUpdates.set(notebook, pendingUpdates);
	const edit = new WorkspaceEdit();
	updates.forEach(({ cell, metadata }) => {
		let newMetadata: any = {};
		if (useCustomPropertyInMetadata()) {
			newMetadata = { ...(cell.metadata), custom: metadata };
		} else {
			newMetadata = { ...cell.metadata, ...metadata };
			if (!metadata.execution_count && newMetadata.execution_count) {
				delete newMetadata.execution_count;
			}
			if (!metadata.attachments && newMetadata.attachments) {
				delete newMetadata.attachments;
			}
		}
		edit.set(cell.notebook.uri, [NotebookEdit.updateCellMetadata(cell.index, sortObjectPropertiesRecursively(newMetadata))]);
	});
	const promise = workspace.applyEdit(edit).then(noop, noop);
	pendingUpdates.add(promise);
	const clean = () => cleanup(notebook, promise);
	promise.then(clean, clean);
}

function onDidChangeNotebookCells(e: NotebookDocumentChangeEvent) {
	if (!isSupportedNotebook(e.notebook)) {
		return;
	}

	const notebook = e.notebook;
	const notebookMetadata = getNotebookMetadata(e.notebook);

	// use the preferred language from document metadata or the first cell language as the notebook preferred cell language
	const preferredCellLanguage = notebookMetadata.metadata?.language_info?.name;
	const updates: { cell: NotebookCell; metadata: CellMetadata & { vscode?: { languageId: string } } }[] = [];
	// When we change the language of a cell,
	// Ensure the metadata in the notebook cell has been updated as well,
	// Else model will be out of sync with ipynb https://github.com/microsoft/vscode/issues/207968#issuecomment-2002858596
	e.cellChanges.forEach(e => {
		if (!preferredCellLanguage || e.cell.kind !== NotebookCellKind.Code) {
			return;
		}
		const currentMetadata = e.metadata ? getCellMetadata({ metadata: e.metadata }) : getCellMetadata({ cell: e.cell });
		const languageIdInMetadata = getVSCodeCellLanguageId(currentMetadata);
		const metadata: CellMetadata = JSON.parse(JSON.stringify(currentMetadata));
		metadata.metadata = metadata.metadata || {};
		let metadataUpdated = false;
		if (e.executionSummary?.executionOrder && typeof e.executionSummary.success === 'boolean' && currentMetadata.execution_count !== e.executionSummary?.executionOrder) {
			metadata.execution_count = e.executionSummary.executionOrder;
			metadataUpdated = true;
		} else if (!e.executionSummary && !e.metadata && e.outputs?.length === 0 && currentMetadata.execution_count) {
			// Clear all.
			delete metadata.execution_count;
			metadataUpdated = true;
		}

		if (e.document?.languageId && e.document?.languageId !== preferredCellLanguage && e.document?.languageId !== languageIdInMetadata) {
			setVSCodeCellLanguageId(metadata, e.document.languageId);
			metadataUpdated = true;
		} else if (e.document?.languageId && e.document.languageId === preferredCellLanguage && languageIdInMetadata) {
			removeVSCodeCellLanguageId(metadata);
			metadataUpdated = true;
		} else if (e.document?.languageId && e.document.languageId === preferredCellLanguage && e.document.languageId === languageIdInMetadata) {
			removeVSCodeCellLanguageId(metadata);
			metadataUpdated = true;
		}

		if (metadataUpdated) {
			updates.push({ cell: e.cell, metadata });
		}
	});

	// Ensure all new cells in notebooks with nbformat >= 4.5 have an id.
	// Details of the spec can be found here https://jupyter.org/enhancement-proposals/62-cell-id/cell-id.html#
	e.contentChanges.forEach(change => {
		change.addedCells.forEach(cell => {
			// When ever a cell is added, always update the metadata
			// as metadata is always an empty `{}` in ipynb JSON file
			const cellMetadata = getCellMetadata({ cell });

			// Avoid updating the metadata if it's not required.
			if (cellMetadata.metadata) {
				if (!isCellIdRequired(notebookMetadata)) {
					return;
				}
				if (isCellIdRequired(notebookMetadata) && cellMetadata?.id) {
					return;
				}
			}

			// Don't edit the metadata directly, always get a clone (prevents accidental singletons and directly editing the objects).
			const metadata: CellMetadata = { ...JSON.parse(JSON.stringify(cellMetadata || {})) };
			metadata.metadata = metadata.metadata || {};

			if (isCellIdRequired(notebookMetadata) && !cellMetadata?.id) {
				metadata.id = generateCellId(e.notebook);
			}
			updates.push({ cell, metadata });
		});
	});

	if (updates.length) {
		trackAndUpdateCellMetadata(notebook, updates);
	}
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
		const id = generateUuid().replace(/-/g, '').substring(0, 8);
		let duplicate = false;
		for (let index = 0; index < notebook.cellCount; index++) {
			const cell = notebook.cellAt(index);
			const existingId = getCellMetadata({ cell })?.id;
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


/**
 * Copied from src/vs/base/common/uuid.ts
 */
function generateUuid() {
	// use `randomValues` if possible
	function getRandomValues(bucket: Uint8Array): Uint8Array {
		for (let i = 0; i < bucket.length; i++) {
			bucket[i] = Math.floor(Math.random() * 256);
		}
		return bucket;
	}

	// prep-work
	const _data = new Uint8Array(16);
	const _hex: string[] = [];
	for (let i = 0; i < 256; i++) {
		_hex.push(i.toString(16).padStart(2, '0'));
	}

	// get data
	getRandomValues(_data);

	// set version bits
	_data[6] = (_data[6] & 0x0f) | 0x40;
	_data[8] = (_data[8] & 0x3f) | 0x80;

	// print as string
	let i = 0;
	let result = '';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	return result;
}
