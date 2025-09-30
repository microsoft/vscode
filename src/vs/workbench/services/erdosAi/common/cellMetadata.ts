/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/**
 * Metadata structure for Jupyter notebook cells.
 * This matches the ipynb extension's CellMetadata interface but is defined
 * locally to avoid cross-extension dependencies.
 */
export interface CellMetadata {
	/**
	 * Cell id for notebooks created with the new 4.5 version of nbformat.
	 */
	id?: string;
	/**
	 * Stores attachments for cells.
	 */
	attachments?: any;
	/**
	 * Stores cell metadata including erdosAi_cellId.
	 */
	metadata?: { erdosAi_cellId?: string, [key: string]: any };
	/**
	 * The code cell's prompt number. Will be null if the cell has not been run.
	 */
	execution_count?: number | null;
}
