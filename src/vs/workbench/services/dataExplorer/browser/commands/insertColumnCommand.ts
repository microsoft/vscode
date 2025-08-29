/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore, ColumnSchema } from '../../common/dataExplorerTypes.js';

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
		const data = this.dataStore.getData();
		if (this.index >= 0 && this.index < data.columns.length) {
			data.columns.splice(this.index, 1);
			data.rows.forEach(row => {
				row.splice(this.index, 1);
			});
			// Update column indices
			data.columns.forEach((col, i) => {
				col.index = i;
			});
		}
	}

	getDescription(): string {
		return `Insert column at index ${this.index}`;
	}
}

