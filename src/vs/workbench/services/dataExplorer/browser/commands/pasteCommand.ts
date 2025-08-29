/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';
import { ClipboardManager, ClipboardData } from '../clipboardManager.js';

/**
 * Command for pasting cells from the clipboard
 * Applies clipboard data starting at the specified target position
 */
export class PasteCommand implements Command {
	
	private readonly oldValues: Map<string, any>;
	private readonly clipboardData: ClipboardData;
	private readonly targetCellPositions: Array<{row: number, col: number}>;

	constructor(
		private readonly dataStore: DataStore,
		private readonly clipboardManager: ClipboardManager,
		private readonly targetStartRow: number,
		private readonly targetStartColumn: number
	) {
		// Get clipboard data at construction time
		const clipboardData = this.clipboardManager.getClipboardData();
		if (!clipboardData) {
			throw new Error('No data in clipboard to paste');
		}
		this.clipboardData = clipboardData;

		// Calculate target cell positions based on clipboard data size
		this.targetCellPositions = [];
		this.oldValues = new Map();

		const sourceRange = this.clipboardData.sourceRange;
		const sourceRows = sourceRange.endRow - sourceRange.startRow + 1;
		const sourceColumns = sourceRange.endColumn - sourceRange.startColumn + 1;

		for (let r = 0; r < sourceRows; r++) {
			for (let c = 0; c < sourceColumns; c++) {
				const targetRow = this.targetStartRow + r;
				const targetCol = this.targetStartColumn + c;
				this.targetCellPositions.push({ row: targetRow, col: targetCol });

				// Capture old values for undo
				const key = `${targetRow},${targetCol}`;
				this.oldValues.set(key, this.dataStore.getCell(targetRow, targetCol));
			}
		}
	}

	execute(): void {
		const sourceRange = this.clipboardData.sourceRange;
		
		// Apply clipboard values to target positions
		this.clipboardData.values.forEach((value, sourceKey) => {
			const [sourceRowStr, sourceColStr] = sourceKey.split(',');
			const sourceRow = parseInt(sourceRowStr, 10);
			const sourceCol = parseInt(sourceColStr, 10);

			// Calculate relative position within the source range
			const relativeRow = sourceRow - sourceRange.startRow;
			const relativeCol = sourceCol - sourceRange.startColumn;

			// Calculate target position
			const targetRow = this.targetStartRow + relativeRow;
			const targetCol = this.targetStartColumn + relativeCol;

			this.dataStore.setCell(targetRow, targetCol, value);
		});

		// Notify clipboard manager of paste operation
		this.clipboardManager.notifyPaste({
			startRow: this.targetStartRow,
			startColumn: this.targetStartColumn
		});

		// If this was a cut operation, clear the clipboard after paste
		if (this.clipboardData.operation === 'cut') {
			this.clipboardManager.clear();
		}
	}

	undo(): void {
		// Restore original values in target positions
		this.targetCellPositions.forEach(({ row, col }) => {
			const key = `${row},${col}`;
			const oldValue = this.oldValues.get(key);
			this.dataStore.setCell(row, col, oldValue);
		});

		// If this was originally a cut operation, restore clipboard data
		if (this.clipboardData.operation === 'cut') {
			this.clipboardManager.cut(this.clipboardData.values, this.clipboardData.sourceRange);
		}
	}

	canMerge(other: Command): boolean {
		// Don't merge paste operations - each paste should be a discrete action
		return false;
	}

	merge(other: Command): Command {
		throw new Error('PasteCommand cannot be merged');
	}

	getDescription(): string {
		const sourceRange = this.clipboardData.sourceRange;
		const sourceRows = sourceRange.endRow - sourceRange.startRow + 1;
		const sourceColumns = sourceRange.endColumn - sourceRange.startColumn + 1;
		const operation = this.clipboardData.operation === 'cut' ? 'cut' : 'copied';
		
		if (sourceRows === 1 && sourceColumns === 1) {
			return `Paste ${operation} cell to (${this.targetStartRow}, ${this.targetStartColumn})`;
		}
		return `Paste ${sourceRows}x${sourceColumns} ${operation} cells to (${this.targetStartRow}, ${this.targetStartColumn})`;
	}

	/**
	 * Get the target cell positions affected by this command
	 */
	getTargetCellPositions(): Array<{row: number, col: number}> {
		return [...this.targetCellPositions];
	}

	/**
	 * Get the clipboard data used for this paste operation
	 */
	getClipboardData(): ClipboardData {
		return {
			values: new Map(this.clipboardData.values),
			sourceRange: { ...this.clipboardData.sourceRange },
			operation: this.clipboardData.operation,
			timestamp: this.clipboardData.timestamp
		};
	}

	/**
	 * Get the old values that were overwritten
	 */
	getOldValues(): Map<string, any> {
		return new Map(this.oldValues);
	}
}

