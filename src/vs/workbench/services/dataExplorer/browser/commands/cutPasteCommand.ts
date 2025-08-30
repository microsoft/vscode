/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';
import { ClipboardManager } from '../clipboardManager.js';

/**
 * Compound command that handles cut-paste operations as a single undoable action.
 * This ensures that cut-paste operations are undone together, not separately.
 */
export class CutPasteCommand implements Command {
	
	private readonly sourceCellOldValues: Map<string, any>;
	private readonly targetCellOldValues: Map<string, any>;
	private readonly targetCellPositions: Array<{row: number, col: number}>;
	private readonly previousClipboardData: any; // Store the clipboard state before this operation

	constructor(
		private readonly dataStore: DataStore,
		private readonly clipboardManager: ClipboardManager,
		private readonly sourceCellPositions: Array<{row: number, col: number}>,
		private readonly sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number},
		private readonly targetStartRow: number,
		private readonly targetStartColumn: number
	) {
		// Store the current clipboard state to restore on undo
		this.previousClipboardData = this.clipboardManager.getClipboardData();
		
		// Capture source cell values before they're cut
		this.sourceCellOldValues = new Map();
		this.sourceCellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			this.sourceCellOldValues.set(key, this.dataStore.getCell(row, col));
		});

		// Calculate target cell positions based on source range size
		this.targetCellPositions = [];
		this.targetCellOldValues = new Map();

		const sourceRows = this.sourceRange.endRow - this.sourceRange.startRow + 1;
		const sourceColumns = this.sourceRange.endColumn - this.sourceRange.startColumn + 1;

		for (let r = 0; r < sourceRows; r++) {
			for (let c = 0; c < sourceColumns; c++) {
				const targetRow = this.targetStartRow + r;
				const targetCol = this.targetStartColumn + c;
				this.targetCellPositions.push({ row: targetRow, col: targetCol });

				// Capture target cell values before they're overwritten
				const key = `${targetRow},${targetCol}`;
				this.targetCellOldValues.set(key, this.dataStore.getCell(targetRow, targetCol));
			}
		}
	}

	execute(): void {
		// This compound command performs both cut and paste operations atomically
		
		// Step 1: Cut - Clear the source cells
		this.sourceCellPositions.forEach(({row, col}) => {
			this.dataStore.setCell(row, col, '');
		});

		// Step 2: Paste - Get clipboard data and paste to target locations
		const clipboardData = this.clipboardManager.getClipboardData();
		if (!clipboardData || clipboardData.operation !== 'cut') {
			throw new Error('Expected cut data in clipboard');
		}

		clipboardData.values.forEach((value, sourceKey) => {
			const [sourceRowStr, sourceColStr] = sourceKey.split(',');
			const sourceRow = parseInt(sourceRowStr, 10);
			const sourceCol = parseInt(sourceColStr, 10);

			// Calculate relative position within the source range
			const relativeRow = sourceRow - this.sourceRange.startRow;
			const relativeCol = sourceCol - this.sourceRange.startColumn;

			// Calculate target position
			const targetRow = this.targetStartRow + relativeRow;
			const targetCol = this.targetStartColumn + relativeCol;

			// Set the target cell value
			this.dataStore.setCell(targetRow, targetCol, value);
		});

		// Clear clipboard since this was a completed cut-paste operation
		this.clipboardManager.clear();
	}

	undo(): void {
		// Step 1: Restore target cells to their original values
		this.targetCellPositions.forEach(({ row, col }) => {
			const key = `${row},${col}`;
			const oldValue = this.targetCellOldValues.get(key);
			this.dataStore.setCell(row, col, oldValue);
		});

		// Step 2: Restore source cells to their original values
		this.sourceCellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			const oldValue = this.sourceCellOldValues.get(key);
			this.dataStore.setCell(row, col, oldValue);
		});

		// Step 3: Restore clipboard to its previous state
		if (this.previousClipboardData) {
			// Restore the previous clipboard data
			if (this.previousClipboardData.operation === 'copy') {
				this.clipboardManager.copy(this.previousClipboardData.values, this.previousClipboardData.sourceRange);
			} else {
				this.clipboardManager.cut(this.previousClipboardData.values, this.previousClipboardData.sourceRange);
			}
		} else {
			// No previous clipboard data, so clear it
			this.clipboardManager.clear();
		}
	}

	canMerge(other: Command): boolean {
		// Cut-paste operations should not be merged
		return false;
	}

	merge(other: Command): Command {
		throw new Error('CutPasteCommand cannot be merged');
	}

	getDescription(): string {
		const sourceRows = this.sourceRange.endRow - this.sourceRange.startRow + 1;
		const sourceColumns = this.sourceRange.endColumn - this.sourceRange.startColumn + 1;
		
		if (sourceRows === 1 && sourceColumns === 1) {
			return `Cut-paste cell from (${this.sourceRange.startRow}, ${this.sourceRange.startColumn}) to (${this.targetStartRow}, ${this.targetStartColumn})`;
		}
		return `Cut-paste ${sourceRows}x${sourceColumns} cells from (${this.sourceRange.startRow}, ${this.sourceRange.startColumn}) to (${this.targetStartRow}, ${this.targetStartColumn})`;
	}

	/**
	 * Get the source cell positions that were cut
	 */
	getSourceCellPositions(): Array<{row: number, col: number}> {
		return [...this.sourceCellPositions];
	}

	/**
	 * Get the target cell positions that were pasted to
	 */
	getTargetCellPositions(): Array<{row: number, col: number}> {
		return [...this.targetCellPositions];
	}

	/**
	 * Get the source range that was cut
	 */
	getSourceRange(): {startRow: number, endRow: number, startColumn: number, endColumn: number} {
		return { ...this.sourceRange };
	}

	/**
	 * Get the old value of a source cell before it was cut
	 */
	getSourceCellOldValue(row: number, col: number): any {
		const key = `${row},${col}`;
		return this.sourceCellOldValues.get(key);
	}

	/**
	 * Get the old value of a target cell before it was pasted to
	 */
	getTargetCellOldValue(row: number, col: number): any {
		const key = `${row},${col}`;
		return this.targetCellOldValues.get(key);
	}
}
