/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { forwardRef } from 'react';
import { ColumnSchema } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { SortKey } from '../../../../services/dataExplorer/browser/sortManager.js';
import { getColumnLetter } from '../../../../services/dataExplorer/common/columnUtils.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { IAction } from '../../../../../base/common/actions.js';
import { SortIndicator } from './sortIndicator.js';



interface ColumnHeadersProps {
	columns: ColumnSchema[];
	onSort?: (index: number, ascending: boolean) => void;
	onColumnMouseDown?: (index: number, event: React.MouseEvent) => void;
	onColumnMouseEnter?: (index: number) => void;
	onSelectAll?: () => void;
	isFrozen?: boolean;
	sortKeys?: SortKey[];
	selectedColumns?: Set<number>;
}

export const ColumnHeaders = forwardRef<HTMLDivElement, ColumnHeadersProps>(({ columns, onSort, onColumnMouseDown, onColumnMouseEnter, onSelectAll, isFrozen, sortKeys = [], selectedColumns = new Set() }, ref) => {
	// Calculate total width to match grid rows (including row number column)
	const ROW_NUMBER_WIDTH = 60;
	const totalWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0) + ROW_NUMBER_WIDTH;
	
	const getSortKeyForColumn = (columnIndex: number): SortKey | undefined => {
		const sortKey = sortKeys.find(sortKey => sortKey.columnIndex === columnIndex);

		return sortKey;
	};

	const services = useErdosReactServicesContext();

	const handleColumnLetterContextMenu = (event: React.MouseEvent, columnIndex: number) => {
		event.preventDefault();

		
		if (!onSort) return;

		const actions: IAction[] = [
			{
				id: `sortAscending_${columnIndex}`,
				label: 'Sort Increasing',
				tooltip: '',
				class: undefined,
				enabled: true,
				run: () => {

					onSort(columnIndex, true);
					return Promise.resolve();
				}
			},
			{
				id: `sortDescending_${columnIndex}`,
				label: 'Sort Decreasing', 
				tooltip: '',
				class: undefined,
				enabled: true,
				run: () => {

					onSort(columnIndex, false);
					return Promise.resolve();
				}
			}
		];

		services.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => ({ x: event.clientX, y: event.clientY })
		});
	};

	const handleChevronClick = (event: React.MouseEvent, columnIndex: number) => {
		event.stopPropagation();
		const sortKey = getSortKeyForColumn(columnIndex);
		if (sortKey && onSort) {

			onSort(columnIndex, !sortKey.ascending);
		}
	};



	return (
		<div 
			ref={ref}
			className={`column-headers-container ${isFrozen ? 'frozen' : ''}`}
			style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}
		>
			{/* Column Letters Row */}
			<div className="column-letters-row">
				{/* Top-left corner - click to select all */}
				<div 
					className="column-letter-header row-number-space select-all-corner"
					style={{ width: `${ROW_NUMBER_WIDTH}px` }}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onSelectAll?.();
					}}
					title="Select all"
				>
					<span className="select-all-icon">⬜</span>
				</div>
				
				{columns.map((column, index) => {
					const sortKey = getSortKeyForColumn(index);
					return (
						<div
							key={`letter-${index}`}
							className={`column-letter-header sortable-column-letter ${selectedColumns.has(index) ? 'selected' : ''}`}
							style={{ width: `${column.width || 100}px` }}
							onMouseDown={(e) => {
								e.stopPropagation();
								onColumnMouseDown?.(index, e);
							}}
							onMouseEnter={() => {
								onColumnMouseEnter?.(index);
							}}
							onContextMenu={(e) => handleColumnLetterContextMenu(e, index)}
						>
							<div className="column-letter-content">
								<span className="column-letter-text">{getColumnLetter(index)}</span>
								<div onClick={(e) => handleChevronClick(e, index)}>
									<SortIndicator 
										ascending={sortKey?.ascending}
										priority={sortKey?.priority}
										visible={!!sortKey}
									/>
								</div>
							</div>
						</div>
					);
				})}
					</div>
		</div>
	);
});
