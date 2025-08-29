/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../common/commands.js';
import { DataStore } from '../../common/dataExplorerTypes.js';

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
		const data = this.dataStore.getData();
		if (this.index >= 0 && this.index < data.rows.length) {
			data.rows.splice(this.index, 1);
			data.metadata.totalRows = data.rows.length;
		}
	}

	getDescription(): string {
		return `Insert row at index ${this.index}`;
	}
}

