/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface SortKey {
	columnIndex: number;
	ascending: boolean;
	priority: number;
}

export class SortManager {
	private sortKeys: Map<number, SortKey> = new Map();
	
	addSort(columnIndex: number, ascending: boolean): void {

		const existingSort = this.sortKeys.get(columnIndex);

		
		if (existingSort) {

			existingSort.ascending = ascending;
			// Update priority to make this the most recent (highest priority)
			this.updatePriorityForMostRecent(columnIndex);
		} else {

			this.sortKeys.set(columnIndex, {
				columnIndex,
				ascending,
				priority: 0 // Most recent gets highest priority (0)
			});
			// Update all other priorities
			this.updatePriorityForMostRecent(columnIndex);
		}
		

	}
	
	removeSort(columnIndex: number): void {
		this.sortKeys.delete(columnIndex);
		this.updatePriorities();
	}
	
	clearSorts(): void {
		this.sortKeys.clear();
	}
	
	getSortKeys(): SortKey[] {
		return Array.from(this.sortKeys.values()).sort((a, b) => a.priority - b.priority);
	}
	
	getSortForColumn(columnIndex: number): SortKey | undefined {
		return this.sortKeys.get(columnIndex);
	}
	
	hasSorts(): boolean {
		return this.sortKeys.size > 0;
	}
	
	private updatePriorities(): void {
		const sortArray = Array.from(this.sortKeys.values()).sort((a, b) => a.priority - b.priority);
		sortArray.forEach((sort, index) => {
			sort.priority = index;
		});
	}

	private updatePriorityForMostRecent(recentColumnIndex: number): void {
		// Set the recent column to priority 0 (highest)
		const recentSort = this.sortKeys.get(recentColumnIndex);
		if (recentSort) {
			recentSort.priority = 0;
		}

		// Increment priority for all other columns
		for (const [columnIndex, sortKey] of this.sortKeys) {
			if (columnIndex !== recentColumnIndex) {
				sortKey.priority++;
			}
		}
	}
}

