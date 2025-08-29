/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';

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



