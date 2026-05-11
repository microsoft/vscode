/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequest, NotebookCell, NotebookDocument, TextDocument, Uri } from 'vscode';
import { isLocation, isUri } from '../../../util/common/types';
import { StringSHA1 } from '../../../util/vs/base/common/hash';
import { removeAnsiEscapeCodes } from '../../../util/vs/base/common/strings';
import { isUriComponents, URI } from '../../../util/vs/base/common/uri';
import { NotebookCellData, NotebookCellKind } from '../../../vscodeTypes';
import { INotebookService } from './notebookService';


export class LineOfText {
	readonly __lineOfTextBrand: void = undefined;
	public readonly value: string;
	constructor(
		value: string
	) {
		this.value = value.replace(/\r$/, '');
	}
}

/** End of Line for alternative Notebook contnt is always \n */
export const EOL = '\n';
export type LineOfCellText = {
	type: 'start';
	/**
	 * The cell index of the cell that this line belongs to.
	*/
	index: number;
	id?: string;
	/**
	 * The Uri of the cell that this line belongs to.
	 * Undefined if this is a cell that doesn't belong in the actual notebook.
	*/
	uri?: Uri;
	/**
	 * Language of the cell.
	*/
	language?: string;
	/**
	 * The type of cell.
	*/
	kind: NotebookCellKind;
} | {
	type: 'line';
	/**
	 * A line of text from a cell. Does not include the newline character.
	 */
	line: string;
	/**
	 * The cell index of the cell that this line belongs to.
	 */
	index: number;
} | {
	type: 'end';
	/**
	 *
	 * The cell index of the cell that this line belongs to.
	 */
	index: number;
};

export type SummaryCell = {
	cell_type: 'code' | 'markdown';
	language: string;
	id: string;
	source: string[];
	index: number;
};

export function summarize(cell: NotebookCell): SummaryCell {
	const cellType = cell.kind === NotebookCellKind.Code ? 'code' : 'markdown';
	const id = getCellId(cell);
	const source = getCellCode(cell.document);
	return { cell_type: cellType, id, language: cell.document.languageId, source, index: cell.index };
}

export function notebookCellToCellData(cell: NotebookCell): NotebookCellData {
	const cellData = new NotebookCellData(cell.kind, cell.document.getText(), cell.document.languageId);
	cellData.metadata = cell.metadata;
	cellData.executionSummary = cell.executionSummary;
	if (cell.outputs.length) {
		cellData.outputs = [...cell.outputs];
	}
	return cellData;
}

export function getCellIdMap(notebook: NotebookDocument): Map<string, NotebookCell> {
	const cellIdMap = new Map<string, NotebookCell>();
	notebook.getCells().forEach(cell => {
		cellIdMap.set(getCellId(cell), cell);
	});
	return cellIdMap;
}

const cellIdCache = new WeakMap<NotebookCell, string>();

/** The length of the hash portion of cell IDs */
const CELL_ID_HASH_LENGTH = 8;

/** Use a unique enough cell id prefix so that we can easily identify cell ids*/
const CELL_ID_PREFIX = '#VSC-';

/** RegExp to match all Cell Ids */
export const CellIdPatternRe = new RegExp(`(\\s+|^|\\b|\\W)(#VSC-[a-f0-9]{${CELL_ID_HASH_LENGTH}})\\b`, 'gi');

/**
 * Sometimes the model may return a cellId that is not in the expected format.
 * This function attempts to convert such cellIds to the expected format.
 */
export function normalizeCellId(cellId: string): string {
	if (cellId.startsWith(CELL_ID_PREFIX)) {
		return cellId;
	}
	if (cellId.startsWith('VSC-')) {
		return `#${cellId}`;
	}
	if (cellId.startsWith('#V-') && cellId.length === (CELL_ID_HASH_LENGTH + 3)) {
		return `${CELL_ID_PREFIX}${cellId.substring(3)}`;
	}
	if (cellId.toLowerCase().startsWith('vscode-') && cellId.length === (CELL_ID_HASH_LENGTH + 7)) {
		return `${CELL_ID_PREFIX}${cellId.substring(7)}`;
	}
	if (cellId.startsWith('-')) {
		return `#VSC${cellId}`;
	}
	// Possible case where the cellId is just a hash without the prefix
	return cellId.length === CELL_ID_HASH_LENGTH ? `${CELL_ID_PREFIX}${cellId}` : cellId;
}

const notebookIdCache = new WeakMap<NotebookDocument, string>();
export function getNotebookId(notebook: NotebookDocument): string {
	let id = notebookIdCache.get(notebook);
	if (id) {
		return id;
	}
	const hash = new StringSHA1();
	hash.update(notebook.uri.toString());
	id = hash.digest();
	notebookIdCache.set(notebook, id);
	return id;
}

/**
 * Given a Notebook cell returns a unique identifier for the cell.
 * The identifier is based on the cell's URI and is cached for performance.
 * This is useful for tracking cells across sessions or for referencing cells in a consistent manner.
 * The cell Id will have a specicial prefix as well do as to easily identify it as a cell Id.
 */
export function getCellId(cell: NotebookCell): string {
	let oldId = cellIdCache.get(cell);
	if (oldId) {
		return oldId;
	}
	const hash = new StringSHA1();
	hash.update(cell.document.uri.toString());
	oldId = `${CELL_ID_PREFIX}${hash.digest().substring(0, CELL_ID_HASH_LENGTH)}`;
	cellIdCache.set(cell, oldId);
	return oldId;
}

function getCellCode(document: TextDocument): string[] {
	if (document.lineCount === 0) {
		return [];
	}
	return new Array(document.lineCount).fill('').map((_, i) => document.lineAt(i).text);
}

export function getDefaultLanguage(notebook: NotebookDocument): string | undefined {
	const codeCell = notebook.getCells().find(cell => cell.kind === NotebookCellKind.Code);
	if (codeCell) {
		return codeCell.document.languageId;
	}
	// Fallback for Jupyter Notebooks that do not have a code cell.
	if (notebook.notebookType === 'jupyter-notebook') {
		return notebook.metadata?.language_info?.name || notebook.metadata?.kernelspec?.language || 'python';
	}
}


const notebookTermsToLookFor = ['jupyter', 'notebook', 'cell.', 'cells.', ' cell ', 'cells', 'notebook cell'];
export function requestHasNotebookRefs(request: ChatRequest, notebookService: INotebookService, options?: { checkPromptAsWell: boolean }): boolean {
	const prompt = (request.prompt || '').toLowerCase();
	if (options?.checkPromptAsWell && notebookTermsToLookFor.some(term => prompt.includes(term))) {
		return true;
	}
	return request.references.some(ref => {
		if (isLocation(ref.value)) {
			return notebookService.hasSupportedNotebooks(ref.value.uri);
		}
		if (isUriComponents(ref.value)) {
			return notebookService.hasSupportedNotebooks(URI.revive(ref.value));
		}
		if (isUri(ref.value)) {
			return notebookService.hasSupportedNotebooks(ref.value);
		}
		return false;
	});
}

export function parseAndCleanStack(jsonString: string): string {
	try {
		// Parse the JSON string
		const parsed = JSON.parse(jsonString) as Partial<Error>;
		return removeAnsiEscapeCodes(parsed?.stack || parsed.message || '') || parsed.message || parsed.name || jsonString;
	} catch {
		return jsonString; // Return the original string if parsing fails
	}
}
