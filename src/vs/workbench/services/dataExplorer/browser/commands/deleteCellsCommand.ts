/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';

/**
 * Command for deleting multiple cells in the data grid
 * Supports undo/redo for bulk delete operations
 */
export class DeleteCellsCommand implements Command {
	
	constructor(
		private readonly dataStore: DataStore,
		private readonly cellPositions: Array<{row: number, col: number}>,
		private readonly oldValues: Map<string, any>
	) {}

	execute(): void {
		this.cellPositions.forEach(({row, col}) => {
			this.dataStore.setCell(row, col, '');
		});
	}

	undo(): void {
		this.cellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			const oldValue = this.oldValues.get(key);
			this.dataStore.setCell(row, col, oldValue);
		});
	}

	canMerge(other: Command): boolean {
		// Don't merge delete operations to keep them as discrete user actions
		return false;
	}

	merge(other: Command): Command {
		throw new Error('DeleteCellsCommand cannot be merged');
	}

	getDescription(): string {
		if (this.cellPositions.length === 1) {
			const {row, col} = this.cellPositions[0];
			return `Delete cell (${row}, ${col})`;
		}
		return `Delete ${this.cellPositions.length} cells`;
	}

	/**
	 * Get the cell positions affected by this command
	 */
	getCellPositions(): Array<{row: number, col: number}> {
		return [...this.cellPositions];
	}

	/**
	 * Get the old values that were deleted
	 */
	getOldValues(): Map<string, any> {
		return new Map(this.oldValues);
	}
}






