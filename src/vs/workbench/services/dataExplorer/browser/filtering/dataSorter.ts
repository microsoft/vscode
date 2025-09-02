/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GridData } from '../../common/dataExplorerTypes.js';
import { SortKey } from './sortManager.js';

export class DataSorter {
	static sortData(data: GridData, sortKeys: SortKey[]): GridData {

		
		if (sortKeys.length === 0) {

			return data;
		}
		
		const sortedRows = [...data.rows].sort((a, b) => {
			for (const sortKey of sortKeys.sort((x, y) => x.priority - y.priority)) {
				const aVal = a[sortKey.columnIndex];
				const bVal = b[sortKey.columnIndex];
				const comparison = this.compareValues(aVal, bVal);
				
				if (comparison !== 0) {
					const result = sortKey.ascending ? comparison : -comparison;

					return result;
				}
			}
			return 0;
		});
		

		return { ...data, rows: sortedRows };
	}
	
	private static compareValues(a: any, b: any): number {
		if (a === null || a === undefined) return -1;
		if (b === null || b === undefined) return 1;

		return String(a).localeCompare(String(b));
	}
}
