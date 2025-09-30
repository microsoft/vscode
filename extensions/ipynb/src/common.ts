/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as nbformat from '@jupyterlab/nbformat';

/**
 * Metadata we store in VS Code cell output items.
 * This contains the original metadata from the Jupyter outputs.
 */
export interface CellOutputMetadata {
	/**
	 * Cell output metadata.
	 */
	metadata?: any;

	/**
	 * Transient data from Jupyter.
	 */
	transient?: {
		/**
		 * This is used for updating the output in other cells.
		 * We don't know of other properties, but this is definitely used.
		 */
		display_id?: string;
	} & any;

	/**
	 * Original cell output type
	 */
	outputType: nbformat.OutputType | string;

	executionCount?: nbformat.IExecuteResult['ExecutionCount'];

	/**
	 * Whether the original Mime data is JSON or not.
	 * This properly only exists in metadata for NotebookCellOutputItems
	 * (this is something we have added)
	 */
	__isJson?: boolean;
}


/**
 * Metadata we store in VS Code cells.
 * This contains the original metadata from the Jupyter cells.
 * 
 * IMPORTANT: erdosAi_cellId should ONLY be in the nested 'metadata' property,
 * never at the top level of CellMetadata.
 */
export interface CellMetadata {
	/**
	 * Cell id for notebooks created with the new 4.5 version of nbformat.
	*/
	id?: string;
	/**
	 * Stores attachments for cells.
	 */
	attachments?: nbformat.IAttachments;
	/**
	 * Stores cell metadata (nested structure from .ipynb).
	 * This includes erdosAi_cellId and other Jupyter cell metadata.
	 */
	metadata?: Partial<nbformat.ICellMetadata> & { vscode?: { languageId?: string }, erdosAi_cellId?: string };
	/**
	 * The code cell's prompt number. Will be null if the cell has not been run.
	 */
	execution_count?: number | null;
	/**
	 * Explicitly disallow erdosAi_cellId at top level - it belongs in nested metadata.
	 */
	erdosAi_cellId?: never;
}

