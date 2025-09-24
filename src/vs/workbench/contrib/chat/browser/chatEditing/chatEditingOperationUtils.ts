/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { FileOperation, FileOperationType, IFileRenameOperation } from './chatEditingOperations.js';

/**
 * Utility class for working with operation collections
 */
export class OperationUtils {

	/**
	 * Filter operations by file URI
	 */
	static filterByFile(operations: readonly FileOperation[], uri: URI): readonly FileOperation[] {
		return operations.filter(op => op.uri.toString() === uri.toString());
	}

	/**
	 * Filter operations by request ID
	 */
	static filterByRequest(operations: readonly FileOperation[], requestId: string): readonly FileOperation[] {
		return operations.filter(op => op.requestId === requestId);
	}

	/**
	 * Filter operations by type
	 */
	static filterByType<T extends FileOperation>(operations: readonly FileOperation[], type: FileOperationType): readonly T[] {
		return operations.filter(op => op.type === type) as T[];
	}

	/**
	 * Group operations by file URI
	 */
	static groupByFile(operations: readonly FileOperation[]): Map<string, readonly FileOperation[]> {
		const grouped = new Map<string, FileOperation[]>();

		for (const operation of operations) {
			const key = operation.uri.toString();
			const existing = grouped.get(key) || [];
			existing.push(operation);
			grouped.set(key, existing);
		}

		// Convert to readonly
		const result = new Map<string, readonly FileOperation[]>();
		for (const [key, ops] of grouped) {
			result.set(key, ops);
		}

		return result;
	}

	/**
	 * Sort operations by timestamp
	 */
	static sortByTimestamp(operations: readonly FileOperation[]): readonly FileOperation[] {
		return [...operations].sort((a, b) => a.epoch - b.epoch);
	}

	/**
	 * Get the final URI for a file after all rename operations
	 */
	static getFinalUri(operations: readonly FileOperation[], initialUri: URI): URI {
		let currentUri = initialUri;

		const renameOps = OperationUtils.filterByType<IFileRenameOperation>(operations, FileOperationType.Rename);

		for (const renameOp of renameOps) {
			if (renameOp.oldUri.toString() === currentUri.toString()) {
				currentUri = renameOp.newUri;
			}
		}

		return currentUri;
	}

	/**
	 * Check if a file exists after applying all operations
	 */
	static fileExistsAfterOperations(operations: readonly FileOperation[], uri: URI): boolean {
		const fileOps = OperationUtils.filterByFile(operations, uri);
		const sortedOps = OperationUtils.sortByTimestamp(fileOps);

		let exists = false; // assume file doesn't exist initially

		for (const op of sortedOps) {
			switch (op.type) {
				case FileOperationType.Create:
					exists = true;
					break;
				case FileOperationType.Delete:
					exists = false;
					break;
				// Rename and edit operations don't change existence
			}
		}

		return exists;
	}
}
