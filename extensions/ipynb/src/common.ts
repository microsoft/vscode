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
	 * Stores cell metadata.
	 */
	metadata?: Partial<nbformat.ICellMetadata> & { vscode?: { languageId?: string } };
	/**
	 * The code cell's prompt number. Will be null if the cell has not been run.
	 */
	execution_count?: number | null;
}



type KeysOfUnionType<T> = T extends T ? keyof T : never;
type FilterType<T, TTest> = T extends TTest ? T : never;
type MakeOptionalAndBool<T extends object> = { [K in keyof T]?: boolean };

/**
 * Type guard that checks if an object has specific keys and narrows the type accordingly.
 *
 * @param x - The object to check
 * @param key - An object with boolean values indicating which keys to check for
 * @returns true if all specified keys exist in the object, false otherwise
 *
 * @example
 * ```typescript
 * type A = { a: string };
 * type B = { b: number };
 * const obj: A | B = getObject();
 *
 * if (hasKey(obj, { a: true })) {
 *   // obj is now narrowed to type A
 *   console.log(obj.a);
 * }
 * ```
 */
export function hasKey<T extends object, TKeys>(x: T, key: TKeys & MakeOptionalAndBool<T>): x is FilterType<T, { [K in KeysOfUnionType<T> & keyof TKeys]: unknown }> {
	for (const k in key) {
		if (!(k in x)) {
			return false;
		}
	}
	return true;
}
