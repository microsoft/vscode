/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';
import { ClipboardManager } from '../clipboardManager.js';

/**
 * Command for cutting cells to the clipboard
 * Stores data in clipboard and clears the original cells
 */
export class CutCommand implements Command {
	
	private readonly oldValues: Map<string, any>;

	constructor(
		private readonly dataStore: DataStore,
		private readonly clipboardManager: ClipboardManager,
		private readonly cellPositions: Array<{row: number, col: number}>,
		private readonly sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}
	) {
		// Capture old values before execution
		this.oldValues = new Map();
		this.cellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			this.oldValues.set(key, this.dataStore.getCell(row, col));
		});
	}

	execute(): void {
		const values = new Map<string, any>();
		
		// Store values in clipboard
		this.cellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			const value = this.dataStore.getCell(row, col);
			values.set(key, value);
		});

		this.clipboardManager.cut(values, this.sourceRange);

		// Clear the original cells
		this.cellPositions.forEach(({row, col}) => {
			this.dataStore.setCell(row, col, '');
		});
	}

	undo(): void {
		// Restore original values
		this.cellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			const oldValue = this.oldValues.get(key);
			this.dataStore.setCell(row, col, oldValue);
		});

		// Clear the clipboard to return to previous state
		this.clipboardManager.clear();
	}

	canMerge(other: Command): boolean {
		// Don't merge cut operations - each cut should be a discrete action
		return false;
	}

	merge(other: Command): Command {
		throw new Error('CutCommand cannot be merged');
	}

	getDescription(): string {
		if (this.cellPositions.length === 1) {
			const {row, col} = this.cellPositions[0];
			return `Cut cell (${row}, ${col})`;
		}
		return `Cut ${this.cellPositions.length} cells`;
	}

	/**
	 * Get the cell positions affected by this command
	 */
	getCellPositions(): Array<{row: number, col: number}> {
		return [...this.cellPositions];
	}

	/**
	 * Get the source range of the cut operation
	 */
	getSourceRange(): {startRow: number, endRow: number, startColumn: number, endColumn: number} {
		return { ...this.sourceRange };
	}

	/**
	 * Get the old values that were cut
	 */
	getOldValues(): Map<string, any> {
		return new Map(this.oldValues);
	}
}




