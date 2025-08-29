/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';
import { ClipboardManager } from '../clipboardManager.js';

/**
 * Command for copying cells to the clipboard
 * This command doesn't modify data, only stores it in the clipboard
 */
export class CopyCommand implements Command {
	
	constructor(
		private readonly dataStore: DataStore,
		private readonly clipboardManager: ClipboardManager,
		private readonly cellPositions: Array<{row: number, col: number}>,
		private readonly sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}
	) {}

	execute(): void {
		const values = new Map<string, any>();
		
		this.cellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			const value = this.dataStore.getCell(row, col);
			values.set(key, value);
		});

		this.clipboardManager.copy(values, this.sourceRange);
	}

	undo(): void {
		// Copy operations don't need to be undone as they don't modify data
		// Just clear the clipboard to return to previous state
		this.clipboardManager.clear();
	}

	canMerge(other: Command): boolean {
		// Don't merge copy operations - each copy should be a discrete action
		return false;
	}

	merge(other: Command): Command {
		throw new Error('CopyCommand cannot be merged');
	}

	getDescription(): string {
		if (this.cellPositions.length === 1) {
			const {row, col} = this.cellPositions[0];
			return `Copy cell (${row}, ${col})`;
		}
		return `Copy ${this.cellPositions.length} cells`;
	}

	/**
	 * Get the cell positions affected by this command
	 */
	getCellPositions(): Array<{row: number, col: number}> {
		return [...this.cellPositions];
	}

	/**
	 * Get the source range of the copy operation
	 */
	getSourceRange(): {startRow: number, endRow: number, startColumn: number, endColumn: number} {
		return { ...this.sourceRange };
	}
}




