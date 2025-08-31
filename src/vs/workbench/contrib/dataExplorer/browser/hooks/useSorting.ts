/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useCallback } from 'react';
import { SortManager, SortKey } from '../../../../services/dataExplorer/browser/filtering/sortManager.js';

export const useSorting = () => {
	const [sortManager] = useState(() => new SortManager());
	const [sortKeys, setSortKeys] = useState<SortKey[]>([]);

	const addSort = useCallback((columnIndex: number, ascending: boolean) => {

		sortManager.addSort(columnIndex, ascending);
		const newSortKeys = sortManager.getSortKeys();

		setSortKeys(newSortKeys);
	}, [sortManager]);

	const removeSort = useCallback((columnIndex: number) => {
		sortManager.removeSort(columnIndex);
		setSortKeys(sortManager.getSortKeys());
	}, [sortManager]);

	const clearSorts = useCallback(() => {
		sortManager.clearSorts();
		setSortKeys([]);
	}, [sortManager]);

	const getSortForColumn = useCallback((columnIndex: number) => {
		return sortManager.getSortForColumn(columnIndex);
	}, [sortManager]);

	const hasSorts = useCallback(() => {
		return sortManager.hasSorts();
	}, [sortManager]);

	return {
		sortKeys,
		addSort,
		removeSort,
		clearSorts,
		getSortForColumn,
		hasSorts
	};
};

