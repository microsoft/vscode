/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { ColumnSchema } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { SortKey } from '../../../../services/dataExplorer/browser/sortManager.js';
import { getColumnLetter } from '../../../../services/dataExplorer/common/columnUtils.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { IAction } from '../../../../../base/common/actions.js';
import { SortIndicator } from './sortIndicator.js';
import { ColumnViewportInfo } from '../../../../../workbench/services/dataExplorer/browser/viewportCalculator.js';
import { FreezeState } from './dataGrid.js';

interface ColumnHeadersProps {
	columns: ColumnSchema[];
	onSort?: (index: number, ascending: boolean) => void;
	onColumnMouseDown?: (index: number, event: React.MouseEvent) => void;
	onColumnMouseEnter?: (index: number, event?: React.MouseEvent) => void;
	onSelectAll?: () => void;
	sortKeys?: SortKey[];
	selectedCells?: Set<string>;
	data?: { rows: any[] }; // Need row count to check if entire column is selected
	getColumnWidth?: (index: number) => number;
	onColumnResizeStart?: (index: number, event: React.MouseEvent) => void;
	resizingColumnIndex?: number | null;
	resizingColumns?: Set<number>;
	dataExplorerService?: any;
	hideSelectAllCorner?: boolean;
	columnViewport?: ColumnViewportInfo;
	freezeState?: FreezeState;
	onFreezeColumn?: (columnIndex: number) => void;
	onUnfreezeColumn?: (columnIndex: number) => void;
	onUnfreezeAllColumns?: () => void;
	// Selection prop to detect multiple column selections
	selection?: any;
}

export const ColumnHeaders: React.FC<ColumnHeadersProps> = ({ columns, onSort, onColumnMouseDown, onColumnMouseEnter, onSelectAll, sortKeys = [], selectedCells = new Set(), data, getColumnWidth, onColumnResizeStart, resizingColumnIndex, resizingColumns = new Set(), dataExplorerService, hideSelectAllCorner = false, columnViewport, freezeState, onFreezeColumn, onUnfreezeColumn, onUnfreezeAllColumns, selection }) => {
	// Calculate total width to match grid rows (including row number column)
	const ROW_NUMBER_WIDTH = 60;
	const totalWidth = columns.reduce((sum, col, index) => sum + (getColumnWidth ? getColumnWidth(index) : col.width || 100), 0) + ROW_NUMBER_WIDTH;
	
	const getSortKeyForColumn = (columnIndex: number): SortKey | undefined => {
		const sortKey = sortKeys.find(sortKey => sortKey.columnIndex === columnIndex);

		return sortKey;
	};

	const services = useErdosReactServicesContext();

	const handleColumnLetterContextMenu = (event: React.MouseEvent, columnIndex: number) => {
		event.preventDefault();

		const actions: IAction[] = [];

		// Determine if we're dealing with multiple selected columns
		const isColumnRangeSelected = selection?.selectedRange && 
			selection.selectedRange.startRow === 0 && 
			selection.selectedRange.endRow === (data?.rows.length || 1) - 1;
		
		const selectedColumnIndices: number[] = [];
		if (isColumnRangeSelected && selection.selectedRange) {
			// Multiple columns selected
			for (let c = selection.selectedRange.startColumn; c <= selection.selectedRange.endColumn; c++) {
				selectedColumnIndices.push(c);
			}
		} else {
			// Single column (the clicked one)
			selectedColumnIndices.push(columnIndex);
		}

		// Add freeze/unfreeze options
		if (freezeState && onFreezeColumn && onUnfreezeColumn && selectedColumnIndices.length > 0) {
			const allSelectedFrozen = selectedColumnIndices.every(c => freezeState.frozenColumns.has(c));
			const someSelectedFrozen = selectedColumnIndices.some(c => freezeState.frozenColumns.has(c));
			
			if (selectedColumnIndices.length === 1) {
				// Single column operations
				const isColumnFrozen = freezeState.frozenColumns.has(columnIndex);
				if (isColumnFrozen) {
					actions.push({
						id: `unfreezeColumn_${columnIndex}`,
						label: 'Unfreeze column',
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							onUnfreezeColumn(columnIndex);
							return Promise.resolve();
						}
					});
				} else {
					actions.push({
						id: `freezeColumn_${columnIndex}`,
						label: 'Freeze column',
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							onFreezeColumn(columnIndex);
							return Promise.resolve();
						}
					});
				}
			} else {
				// Multiple columns operations
				if (!allSelectedFrozen) {
					actions.push({
						id: `freezeSelectedColumns`,
						label: `Freeze ${selectedColumnIndices.length} columns`,
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							selectedColumnIndices.forEach(c => {
								if (!freezeState.frozenColumns.has(c)) {
									onFreezeColumn(c);
								}
							});
							return Promise.resolve();
						}
					});
				}
				
				if (someSelectedFrozen) {
					actions.push({
						id: `unfreezeSelectedColumns`,
						label: `Unfreeze selected columns`,
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							selectedColumnIndices.forEach(c => {
								if (freezeState.frozenColumns.has(c)) {
									onUnfreezeColumn(c);
								}
							});
							return Promise.resolve();
						}
					});
				}
			}

			// Add unfreeze all columns option if there are frozen columns
			if (freezeState.frozenColumns.size > 0 && onUnfreezeAllColumns) {
				actions.push({
					id: `unfreezeAllColumns`,
					label: 'Unfreeze all columns',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						onUnfreezeAllColumns();
						return Promise.resolve();
					}
				});
			}
		}

		// Add insert options if dataExplorerService is available
		if (dataExplorerService) {
			actions.push(
				{
					id: `insertColumnLeft_${columnIndex}`,
					label: 'Insert left',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						dataExplorerService.insertColumnWithHistory(columnIndex);
						return Promise.resolve();
					}
				},
				{
					id: `insertColumnRight_${columnIndex}`,
					label: 'Insert right',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						dataExplorerService.insertColumnWithHistory(columnIndex + 1);
						return Promise.resolve();
					}
				},
				{
					id: `deleteColumn_${columnIndex}`,
					label: 'Delete column',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						dataExplorerService.removeColumn(columnIndex);
						return Promise.resolve();
					}
				}
			);
		}

		// Add sort options if available
		if (onSort) {
			actions.push(
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
			);
		}

		if (actions.length === 0) return;

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

	const dataWidth = columns.reduce((sum, col, index) => sum + (getColumnWidth ? getColumnWidth(index) : col.width || 100), 0);

	return (
		<div 
			className="column-headers-container"
			style={{ 
				width: hideSelectAllCorner ? `${dataWidth}px` : `${totalWidth}px`, 
				minWidth: hideSelectAllCorner ? `${dataWidth}px` : `${totalWidth}px` 
			}}
		>
			{/* Column Letters Row */}
			<div 
				className="column-letters-row"
				style={{
					position: 'relative',
					width: columnViewport ? `${columnViewport.totalWidth}px` : '100%'
				}}
			>
				{/* Top-left corner - click to select all */}
				{!hideSelectAllCorner && (
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
				)}
				
				{(() => {
					// Use column viewport for virtualization if provided, otherwise render all columns
					const startIndex = columnViewport?.startIndex ?? 0;
					const endIndex = columnViewport?.endIndex ?? columns.length - 1;
					const visibleColumns = [];
					
					for (let index = startIndex; index <= endIndex && index < columns.length; index++) {
						const column = columns[index];
						const sortKey = getSortKeyForColumn(index);
						const columnWidth = getColumnWidth ? getColumnWidth(index) : column.width || 100;
						const isResizing = resizingColumnIndex === index;
						const isResizingMultiple = resizingColumns.has(index);
						const isColumnFrozen = freezeState?.frozenColumns.has(index) || false;
						// Check if entire column is selected using the selectedCells set
						const isColumnSelected = data ? 
							Array.from({length: data.rows.length}, (_, rowIndex) => rowIndex)
								.every(rowIndex => selectedCells.has(`${rowIndex},${index}`)) :
							false;
						
						// Calculate left offset for virtualized column positioning or sticky positioning for frozen columns
						let leftOffset = 0;
						if (columnViewport) {
							for (let i = 0; i < index; i++) {
								leftOffset += getColumnWidth ? getColumnWidth(i) : columns[i].width || 100;
							}
						}
						
						// Calculate sticky left position for frozen columns
						let stickyLeft = '';
						if (isColumnFrozen && getColumnWidth) {
							let leftPosition = 0;
							for (let c = 0; c < index; c++) {
								if (freezeState?.frozenColumns.has(c)) {
									leftPosition += getColumnWidth(c);
								}
							}
							stickyLeft = `${leftPosition}px`;
						}
						
						visibleColumns.push(
							<div
								key={`letter-${index}`}
								className={`column-letter-header sortable-column-letter ${isColumnSelected ? 'selected' : ''} ${isResizing || isResizingMultiple ? 'resizing-column' : ''} ${isColumnFrozen ? 'frozen-column' : ''}`}
								style={{ 
									width: `${columnWidth}px`, 
									position: isColumnFrozen ? 'sticky' : (columnViewport ? 'absolute' : 'relative'),
									left: isColumnFrozen ? stickyLeft : (columnViewport ? `${leftOffset}px` : undefined)
								}}
								onMouseDown={(e) => {
									e.stopPropagation();
									onColumnMouseDown?.(index, e);
								}}
								onMouseEnter={(e) => {
									onColumnMouseEnter?.(index, e);
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
								{/* Column resize handle */}
								{onColumnResizeStart && (
									<div
										className="column-resize-handle"
										onMouseDown={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onColumnResizeStart(index, e);
										}}
									/>
								)}
							</div>
						);
					}
					
					return visibleColumns;
				})()}
			</div>
		</div>
	);
};
