/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { SortKey } from '../../../../services/dataExplorer/browser/sortManager.js';
import { ColumnHeaders } from './columnHeaders.js';
import { VirtualGridBody } from './virtualGridBody.js';

export interface SelectionState {
	type: 'none' | 'row' | 'column' | 'cells';
	index: number;
}

export interface CellPosition {
	row: number;
	col: number;
}

export interface DataGridSelection {
	selectedRows: Set<number>;
	selectedColumns: Set<number>;
	selectedCells: Set<string>; // Store as "row,col" strings for efficient lookup
}

interface DataGridProps {
	data: GridData;
	onCellChange?: (row: number, col: number, value: any) => void;
	onColumnSort?: (columnIndex: number, ascending: boolean) => void;
	onHeaderFreezeToggle?: (isFrozen: boolean) => void;
	onDataChange?: (data: GridData) => void;
	sortKeys?: SortKey[];
}

export interface DataGridRef {
	toggleHeaderFreeze: () => void;
	isHeadersFrozen: boolean;
}

/**
 * DataGrid component using the original layout structure with virtual grid body
 */
export const DataGrid = forwardRef<DataGridRef, DataGridProps>(({ 
	data, 
	onCellChange, 
	onColumnSort, 
	onHeaderFreezeToggle, 
	onDataChange, 
	sortKeys = [] 
}, ref) => {
	const [isHeadersFrozen, setIsHeadersFrozen] = useState(true);
	const [selection, setSelection] = useState<DataGridSelection>({
		selectedRows: new Set(),
		selectedColumns: new Set(),
		selectedCells: new Set()
	});
	const [hoveredCell, setHoveredCell] = useState<{row: number, col: number} | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState<{type: 'row' | 'column' | 'cell', index?: number, cellPos?: CellPosition} | null>(null);
	const headersRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const handleBodyScroll = (event: React.UIEvent<HTMLDivElement>) => {
		// Since headers and body are in the same scroll container, no sync needed
	};

	const toggleHeaderFreeze = () => {
		const newFrozenState = !isHeadersFrozen;
		setIsHeadersFrozen(newFrozenState);
		onHeaderFreezeToggle?.(newFrozenState);
	};

	const handleRowMouseDown = (rowIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		setDragStart({ type: 'row', index: rowIndex });
		setSelection({
			selectedRows: new Set([rowIndex]),
			selectedColumns: new Set(),
			selectedCells: new Set()
		});
	};

	const handleRowMouseEnter = (rowIndex: number) => {
		if (dragStart?.type === 'row' && dragStart.index !== undefined) {
			// Start dragging if we haven't already and we moved to a different row
			if (!isDragging && rowIndex !== dragStart.index) {
				setIsDragging(true);
			}
			
			if (isDragging || rowIndex !== dragStart.index) {
				const startIndex = dragStart.index;
				const endIndex = rowIndex;
				const minIndex = Math.min(startIndex, endIndex);
				const maxIndex = Math.max(startIndex, endIndex);
				
				const selectedRows = new Set<number>();
				for (let i = minIndex; i <= maxIndex; i++) {
					selectedRows.add(i);
				}
				
				setSelection({
					selectedRows,
					selectedColumns: new Set(),
					selectedCells: new Set()
				});
			}
		}
	};

	const handleColumnMouseDown = (columnIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		setDragStart({ type: 'column', index: columnIndex });
		setSelection({
			selectedRows: new Set(),
			selectedColumns: new Set([columnIndex]),
			selectedCells: new Set()
		});
	};

	const handleColumnMouseEnter = (columnIndex: number) => {
		if (dragStart?.type === 'column' && dragStart.index !== undefined) {
			// Start dragging if we haven't already and we moved to a different column
			if (!isDragging && columnIndex !== dragStart.index) {
				setIsDragging(true);
			}
			
			if (isDragging || columnIndex !== dragStart.index) {
				const startIndex = dragStart.index;
				const endIndex = columnIndex;
				const minIndex = Math.min(startIndex, endIndex);
				const maxIndex = Math.max(startIndex, endIndex);
				
				const selectedColumns = new Set<number>();
				for (let i = minIndex; i <= maxIndex; i++) {
					selectedColumns.add(i);
				}
				
				setSelection({
					selectedRows: new Set(),
					selectedColumns,
					selectedCells: new Set()
				});
			}
		}
	};

	const handleCellMouseDown = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const cellPos = { row: rowIndex, col: colIndex };
		setDragStart({ type: 'cell', cellPos });
		setSelection({
			selectedRows: new Set(),
			selectedColumns: new Set(),
			selectedCells: new Set([`${rowIndex},${colIndex}`])
		});
	};

	const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
		// Always update hover state for row/column highlighting
		setHoveredCell({ row: rowIndex, col: colIndex });
		
		if (dragStart?.type === 'cell' && dragStart.cellPos) {
			// Start dragging if we haven't already and we moved to a different cell
			const currentCellKey = `${rowIndex},${colIndex}`;
			const startCellKey = `${dragStart.cellPos.row},${dragStart.cellPos.col}`;
			
			if (!isDragging && currentCellKey !== startCellKey) {
				setIsDragging(true);
			}
			
			if (isDragging || currentCellKey !== startCellKey) {
				// Calculate rectangle selection
				const startRow = dragStart.cellPos.row;
				const startCol = dragStart.cellPos.col;
				const endRow = rowIndex;
				const endCol = colIndex;
				
				const minRow = Math.min(startRow, endRow);
				const maxRow = Math.max(startRow, endRow);
				const minCol = Math.min(startCol, endCol);
				const maxCol = Math.max(startCol, endCol);
				
				const selectedCells = new Set<string>();
				for (let r = minRow; r <= maxRow; r++) {
					for (let c = minCol; c <= maxCol; c++) {
						selectedCells.add(`${r},${c}`);
					}
				}
				
				setSelection({
					selectedRows: new Set(),
					selectedColumns: new Set(),
					selectedCells
				});
			}
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
		setDragStart(null);
	};

	const handleMouseLeave = () => {
		setHoveredCell(null);
	};

	const clearSelection = () => {
		setSelection({
			selectedRows: new Set(),
			selectedColumns: new Set(),
			selectedCells: new Set()
		});
	};

	const selectAll = () => {
		const allRows = new Set<number>();
		const allColumns = new Set<number>();
		const allCells = new Set<string>();

		// Select all rows
		for (let i = 0; i < data.rows.length; i++) {
			allRows.add(i);
		}

		// Select all columns
		for (let i = 0; i < data.columns.length; i++) {
			allColumns.add(i);
		}

		// Select all cells
		for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex++) {
			for (let colIndex = 0; colIndex < data.columns.length; colIndex++) {
				allCells.add(`${rowIndex},${colIndex}`);
			}
		}

		setSelection({
			selectedRows: allRows,
			selectedColumns: allColumns,
			selectedCells: allCells
		});
	};

	const deleteSelectedData = () => {
		if (!onDataChange) return;

		const updatedData = { ...data };
		const updatedRows = [...data.rows];

		// Clear selected rows
		selection.selectedRows.forEach(rowIndex => {
			if (rowIndex < updatedRows.length) {
				updatedRows[rowIndex] = new Array(data.columns.length).fill('');
			}
		});

		// Clear selected columns
		selection.selectedColumns.forEach(colIndex => {
			if (colIndex < data.columns.length) {
				updatedRows.forEach((row, rowIndex) => {
					if (row[colIndex] !== undefined) {
						updatedRows[rowIndex] = [...row];
						updatedRows[rowIndex][colIndex] = '';
					}
				});
			}
		});

		// Clear selected cells
		selection.selectedCells.forEach(cellKey => {
			const [rowStr, colStr] = cellKey.split(',');
			const rowIndex = parseInt(rowStr, 10);
			const colIndex = parseInt(colStr, 10);
			
			if (rowIndex < updatedRows.length && colIndex < data.columns.length) {
				if (updatedRows[rowIndex][colIndex] !== undefined) {
					updatedRows[rowIndex] = [...updatedRows[rowIndex]];
					updatedRows[rowIndex][colIndex] = '';
				}
			}
		});

		updatedData.rows = updatedRows;
		onDataChange(updatedData);
		clearSelection();
	};

	// Keyboard event handler
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (selection.selectedRows.size > 0 || selection.selectedColumns.size > 0 || selection.selectedCells.size > 0) {
				if (event.key === 'Delete' || event.key === 'Backspace') {
					event.preventDefault();
					deleteSelectedData();
				} else if (event.key === 'Escape') {
					clearSelection();
				}
			}
		};

		const currentContainer = containerRef.current;
		if (currentContainer) {
			currentContainer.addEventListener('keydown', handleKeyDown);
			return () => {
				currentContainer.removeEventListener('keydown', handleKeyDown);
			};
		}
		
		return undefined;
	}, [selection, data, onDataChange]);

	// Global mouse up handler for drag selection
	useEffect(() => {
		const handleGlobalMouseUp = () => {
			if (isDragging) {
				handleMouseUp();
			}
		};

		if (isDragging) {
			document.addEventListener('mouseup', handleGlobalMouseUp);
			document.addEventListener('mouseleave', handleGlobalMouseUp);
			return () => {
				document.removeEventListener('mouseup', handleGlobalMouseUp);
				document.removeEventListener('mouseleave', handleGlobalMouseUp);
			};
		}
		
		return undefined;
	}, [isDragging]);

	useImperativeHandle(ref, () => ({
		toggleHeaderFreeze,
		isHeadersFrozen
	}));

	return (
		<div 
			ref={containerRef}
			className="data-grid"
			tabIndex={0}
			onMouseLeave={handleMouseLeave}
		>
			<div 
				ref={bodyRef}
				className="grid-container"
				onScroll={handleBodyScroll}
			>
				<ColumnHeaders 
					ref={headersRef}
					columns={data.columns} 
					onSort={onColumnSort}
					onColumnMouseDown={handleColumnMouseDown}
					onColumnMouseEnter={handleColumnMouseEnter}
					onSelectAll={selectAll}
					isFrozen={isHeadersFrozen}
					sortKeys={sortKeys}
					selectedColumns={selection.selectedColumns}
				/>
				<VirtualGridBody 
					data={data} 
					onCellChange={onCellChange}
					onRowMouseDown={handleRowMouseDown}
					onRowMouseEnter={handleRowMouseEnter}
					onCellMouseDown={handleCellMouseDown}
					onCellMouseEnter={handleCellMouseEnter}
					selectedRows={selection.selectedRows}
					selectedColumns={selection.selectedColumns}
					selectedCells={selection.selectedCells}
					hoveredCell={hoveredCell}
				/>
			</div>
		</div>
	);
});