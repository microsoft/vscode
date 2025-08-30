/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';

/**
 * Represents a single cell replacement operation
 */
interface CellReplacement {
	row: number;
	col: number;
	oldValue: any;
	newValue: any;
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

export { CellReplacement };







