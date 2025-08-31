/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { ColumnSchema } from '../../common/dataExplorerTypes.js';
import { DataStore } from '../core/dataStore.js';
import { ClipboardManager, ClipboardData } from './clipboardManager.js';

/**
 * Represents a single cell replacement operation
 */
export interface CellReplacement {
	row: number;
	col: number;
	oldValue: any;
	newValue: any;
}

/**
 * Command for editing a cell value in the data grid
 * Supports undo/redo and command merging for consecutive edits to the same cell
 */
export class EditCellCommand implements Command {
	
	constructor(
		private readonly dataStore: DataStore,
		private readonly row: number,
		private readonly col: number,
		private readonly newValue: any,
		private readonly oldValue: any
	) {}

	execute(): void {
		this.dataStore.setCell(this.row, this.col, this.newValue);
	}

	undo(): void {
		this.dataStore.setCell(this.row, this.col, this.oldValue);
	}

	canMerge(other: Command): boolean {
		if (!(other instanceof EditCellCommand)) {
			return false;
		}

		// Can merge if editing the same cell
		return other.row === this.row && other.col === this.col;
	}

	merge(other: Command): Command {
		if (!(other instanceof EditCellCommand)) {
			throw new Error('Cannot merge with non-EditCellCommand');
		}

		if (!this.canMerge(other)) {
			throw new Error('Commands cannot be merged');
		}

		// Create a new command that combines both edits
		// Keep the original old value but use the new command's new value
		return new EditCellCommand(
			this.dataStore,
			this.row,
			this.col,
			other.newValue,
			this.oldValue // Keep original old value
		);
	}

	getDescription(): string {
		return `Edit cell (${this.row}, ${this.col}) from "${this.oldValue}" to "${this.newValue}"`;
	}

	/**
	 * Get the row index of this edit
	 */
	getRow(): number {
		return this.row;
	}

	/**
	 * Get the column index of this edit
	 */
	getColumn(): number {
		return this.col;
	}

	/**
	 * Get the new value being set
	 */
	getNewValue(): any {
		return this.newValue;
	}

	/**
	 * Get the old value being replaced
	 */
	getOldValue(): any {
		return this.oldValue;
	}
}

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

/**
 * Command for inserting a new row in the data grid
 */
export class InsertRowCommand implements Command {
	
	constructor(
		private readonly dataStore: DataStore,
		private readonly index: number,
		private readonly rowData?: any[]
	) {}

	execute(): void {
		this.dataStore.insertRow(this.index, this.rowData);
	}

	undo(): void {
		this.dataStore.removeRow(this.index);
	}

	getDescription(): string {
		return `Insert row at index ${this.index}`;
	}
}

/**
 * Command for inserting a new column in the data grid
 */
export class InsertColumnCommand implements Command {
	
	constructor(
		private readonly dataStore: DataStore,
		private readonly index: number,
		private readonly columnSchema?: ColumnSchema
	) {}

	execute(): void {
		this.dataStore.insertColumn(this.index, this.columnSchema);
	}

	undo(): void {
		this.dataStore.removeColumn(this.index);
	}

	getDescription(): string {
		return `Insert column at index ${this.index}`;
	}
}

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

/**
 * Command for replacing all occurrences in the data grid as a single operation
 * Supports undo/redo as an atomic operation
 */
export class ReplaceAllCommand implements Command {
	
	constructor(
		private readonly dataStore: DataStore,
		private readonly replacements: CellReplacement[]
	) {}

	execute(): void {
		for (const replacement of this.replacements) {
			this.dataStore.setCell(replacement.row, replacement.col, replacement.newValue);
		}
	}

	undo(): void {
		// Undo in reverse order
		for (let i = this.replacements.length - 1; i >= 0; i--) {
			const replacement = this.replacements[i];
			this.dataStore.setCell(replacement.row, replacement.col, replacement.oldValue);
		}
	}

	canMerge(other: Command): boolean {
		// Replace all commands should not be merged
		return false;
	}

	getDescription(): string {
		return `Replace all (${this.replacements.length} cells)`;
	}

	/**
	 * Get the number of replacements performed
	 */
	getReplacementCount(): number {
		return this.replacements.length;
	}

	/**
	 * Get all the cell replacements
	 */
	getReplacements(): readonly CellReplacement[] {
		return this.replacements;
	}
}
