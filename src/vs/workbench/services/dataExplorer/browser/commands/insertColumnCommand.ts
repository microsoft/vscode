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
		this.dataStore.removeColumn(this.index);
	}

	getDescription(): string {
		return `Insert column at index ${this.index}`;
	}
}

