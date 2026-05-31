/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, NotebookCell, NotebookDocument } from 'vscode';
import { Uri } from '../../../vscodeTypes';
import { AlternativeNotebookDocument } from './alternativeNotebookDocument';
import { LineOfCellText, LineOfText } from './helpers';


export abstract class BaseAlternativeNotebookContentProvider {
	constructor(public readonly kind: 'xml' | 'text' | 'json') { }

	/**
	 * Give the code for a cell, strips the cell markers and returns the code.
	 * XML and Jupytext formats have cell markers and this allows stripped those markers.
	 */
	public abstract stripCellMarkers(text: string): string;

	/**
	 * Generate the Document of the notebook document that is LLM friendly.
	 */
	public abstract getAlternativeDocument(notebook: NotebookDocument, excludeMarkdownCells?: boolean): AlternativeNotebookDocument;

	/**
	 * Gets the alternative Document with specific text representation which
	 * may have been model-edited.
	 */
	public abstract getAlternativeDocumentFromText(text: string, notebook: NotebookDocument): AlternativeNotebookDocument;

	/**
	 * Generate the summary of the structure of the notebook document that is LLM friendly.
	 * & includes just the cells that are passed in.
	 * This is used to help the LLM understand the structure of the notebook, without including the entire code of all cells.
	 */
	public abstract getSummaryOfStructure(notebook: NotebookDocument, cellsToInclude: NotebookCell[], existingCodeMarker: string): string;

	/**
	 * Given the input stream of response parts, parse the response and return an async iterable of lines of text for a given cell.
	 * We accept a NotebookDocument or a Uri.
	 * This is because its possible the Notebook may not have been created/loaded as of yet.
	 * I.e. for new Notebooks, we can emity the Insert Cell Edits without the notebook being created.
	 */
	public abstract parseAlternateContent(notebookOrUri: NotebookDocument | Uri, inputStream: AsyncIterable<LineOfText>, token: CancellationToken): AsyncIterable<LineOfCellText>;

}
