/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useMemo, useRef, useLayoutEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { EditableCell } from './editableCell.js';
import { DataGridSelection, EditingState, SelectionUtils, FreezeState } from './dataGrid.js';
import { ViewportCalculator, ColumnViewportInfo } from '../../../../../workbench/services/dataExplorer/browser/viewportCalculator.js';
import { ColumnHeaders } from './columnHeaders.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { IAction } from '../../../../../base/common/actions.js';

interface VirtualGridBodyProps {
	data: GridData;
	onCellChange?: (row: number, col: number, value: any) => void;
	onRowMouseDown?: (index: number, event: React.MouseEvent) => void;
	onRowMouseEnter?: (index: number, event?: React.MouseEvent) => void;
	onCellMouseDown?: (row: number, col: number, event: React.MouseEvent) => void;
	onCellMouseEnter?: (row: number, col: number, event?: React.MouseEvent) => void;
	selection: DataGridSelection;
	setSelection: (selection: DataGridSelection) => void;
	hoveredCell?: {row: number, col: number} | null;
	getColumnWidth?: (index: number) => number;
	getRowHeight?: (index: number) => number;
	onRowResizeStart?: (index: number, event: React.MouseEvent) => void;
	resizingRowIndex?: number | null;
	resizingColumnIndex?: number | null;
	resizingRows?: Set<number>;
	resizingColumns?: Set<number>;
	editingState?: EditingState;
	onEditStart?: (row: number, col: number) => void;
	onEditEnd?: () => void;
	// Column header props
	columns: any[];
	onSort?: (index: number, ascending: boolean) => void;
	onColumnMouseDown?: (index: number, event: React.MouseEvent) => void;
	onColumnMouseEnter?: (index: number, event?: React.MouseEvent) => void;
	onSelectAll?: () => void;
	sortKeys?: any[];
	selectedCells?: Set<string>;
	onColumnResizeStart?: (index: number, event: React.MouseEvent) => void;
	dataExplorerService?: any;
	// Freeze functionality props
	freezeState?: FreezeState;
	onFreezeRow?: (rowIndex: number) => void;
	onUnfreezeRow?: (rowIndex: number) => void;
	onFreezeColumn?: (columnIndex: number) => void;
	onUnfreezeColumn?: (columnIndex: number) => void;
	onUnfreezeAllRows?: () => void;
	onUnfreezeAllColumns?: () => void;
	onUnfreezePanes?: () => void;
	// Clipboard visual feedback
	clipboardRange?: {startRow: number, endRow: number, startColumn: number, endColumn: number, operation: 'copy' | 'cut'} | null;
}

const ROW_HEIGHT = 24;
const ROW_NUMBER_WIDTH = 60;

export const VirtualGridBody = forwardRef<{ scrollToCell: (row: number, col: number) => void }, VirtualGridBodyProps>(({ 
	data, 
	onCellChange, 
	onRowMouseDown, 
	onRowMouseEnter, 
	onCellMouseDown, 
	onCellMouseEnter, 
	selection,
	setSelection,
	hoveredCell = null,
	getColumnWidth,
	getRowHeight,
	onRowResizeStart,
	resizingRowIndex,
	resizingColumnIndex,
	resizingRows = new Set(),
	resizingColumns = new Set(),
	editingState,
	onEditStart,
	onEditEnd,
	// Column header props
	columns,
	onSort,
	onColumnMouseDown,
	onColumnMouseEnter,
	onSelectAll,
	sortKeys = [],
	selectedCells = new Set(),
	onColumnResizeStart,
	dataExplorerService,
	freezeState,
	onFreezeRow,
	onUnfreezeRow,
	onFreezeColumn,
	onUnfreezeColumn,
	onUnfreezeAllRows,
	onUnfreezeAllColumns,
	onUnfreezePanes,
	clipboardRange
}, ref) => {
	const services = useErdosReactServicesContext();

	// Helper function to check if a cell is in the clipboard range
	const isCellInClipboardRange = (row: number, col: number): boolean => {
		if (!clipboardRange) {
			return false;
		}
		return row >= clipboardRange.startRow && row <= clipboardRange.endRow &&
			   col >= clipboardRange.startColumn && col <= clipboardRange.endColumn;
	};

	// Helper function to get clipboard border classes for a cell
	const getClipboardBorderClasses = (row: number, col: number): string => {
		if (!clipboardRange || !isCellInClipboardRange(row, col)) {
			return '';
		}

		const classes = [];
		
		// Check if this cell is on the top edge of the clipboard range
		if (row === clipboardRange.startRow) {
			classes.push('clipboard-top');
		}
		
		// Check if this cell is on the bottom edge of the clipboard range
		if (row === clipboardRange.endRow) {
			classes.push('clipboard-bottom');
		}
		
		// Check if this cell is on the left edge of the clipboard range
		if (col === clipboardRange.startColumn) {
			classes.push('clipboard-left');
		}
		
		// Check if this cell is on the right edge of the clipboard range
		if (col === clipboardRange.endColumn) {
			classes.push('clipboard-right');
		}
		
		return classes.join(' ');
	};

	// Context menu handler for row numbers
	const handleRowNumberContextMenu = (event: React.MouseEvent, rowIndex: number) => {
		event.preventDefault();
		
		const actions: IAction[] = [];

		// Determine if we're dealing with multiple selected rows
		const isRowRangeSelected = selection.selectedRange && 
			selection.selectedRange.startColumn === 0 && 
			selection.selectedRange.endColumn === data.columns.length - 1;
		
		const selectedRowIndices: number[] = [];
		if (isRowRangeSelected && selection.selectedRange) {
			// Multiple rows selected
			for (let r = selection.selectedRange.startRow; r <= selection.selectedRange.endRow; r++) {
				selectedRowIndices.push(r);
			}
		} else {
			// Single row (the clicked one)
			selectedRowIndices.push(rowIndex);
		}

		// Add freeze/unfreeze options
		if (freezeState && onFreezeRow && onUnfreezeRow && selectedRowIndices.length > 0) {
			const allSelectedFrozen = selectedRowIndices.every(r => freezeState.frozenRows.has(r));
			const someSelectedFrozen = selectedRowIndices.some(r => freezeState.frozenRows.has(r));
			
			if (selectedRowIndices.length === 1) {
				// Single row operations
				const isRowFrozen = freezeState.frozenRows.has(rowIndex);
				if (isRowFrozen) {
					actions.push({
						id: `unfreezeRow_${rowIndex}`,
						label: 'Unfreeze row',
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							onUnfreezeRow(rowIndex);
							return Promise.resolve();
						}
					});
				} else {
					actions.push({
						id: `freezeRow_${rowIndex}`,
						label: 'Freeze row',
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							onFreezeRow(rowIndex);
							return Promise.resolve();
						}
					});
				}
			} else {
				// Multiple rows operations
				if (!allSelectedFrozen) {
					actions.push({
						id: `freezeSelectedRows`,
						label: `Freeze ${selectedRowIndices.length} rows`,
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							selectedRowIndices.forEach(r => {
								if (!freezeState.frozenRows.has(r)) {
									onFreezeRow(r);
								}
							});
							return Promise.resolve();
						}
					});
				}
				
				if (someSelectedFrozen) {
					actions.push({
						id: `unfreezeSelectedRows`,
						label: `Unfreeze selected rows`,
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							selectedRowIndices.forEach(r => {
								if (freezeState.frozenRows.has(r)) {
									onUnfreezeRow(r);
								}
							});
							return Promise.resolve();
						}
					});
				}
			}

			// Add unfreeze all rows option if there are frozen rows
			if (freezeState.frozenRows.size > 0 && onUnfreezeAllRows) {
				actions.push({
					id: `unfreezeAllRows`,
					label: 'Unfreeze all rows',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						onUnfreezeAllRows();
						return Promise.resolve();
					}
				});
			}
		}

		if (dataExplorerService) {
			actions.push(
				{
					id: `insertRowAbove_${rowIndex}`,
					label: 'Insert above',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						dataExplorerService.insertRowWithHistory(rowIndex);
						return Promise.resolve();
					}
				},
				{
					id: `insertRowBelow_${rowIndex}`,
					label: 'Insert below',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						dataExplorerService.insertRowWithHistory(rowIndex + 1);
						return Promise.resolve();
					}
				},
				{
					id: `deleteRow_${rowIndex}`,
					label: 'Delete row',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						dataExplorerService.removeRow(rowIndex);
						return Promise.resolve();
					}
				}
			);
		}

		services.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => ({ x: event.clientX, y: event.clientY })
		});
	};

	// Cell selection and editing functions
	const selectCell = (row: number, col: number) => {
		// Individual cell selection clears multi-selections and sets focused cell
		setSelection({
			selectedRange: null, // Clear multi-cell selections
			focusedCell: { row, col },
			editingCell: null
		});
	};

	const startEdit = (row: number, col: number) => {
		setSelection({
			...selection,
			focusedCell: { row, col },
			editingCell: { row, col }
		});
		// Notify parent about edit start
		onEditStart?.(row, col);
	};

	const commitEdit = () => {
		setSelection({
			...selection,
			editingCell: null
		});
		// Notify parent about edit end
		onEditEnd?.();
	};

	const cancelEdit = () => {
		setSelection({
			...selection,
			editingCell: null
		});
		// Notify parent about edit end
		onEditEnd?.();
	};
	const containerRef = useRef<HTMLDivElement>(null);
	const rowNumbersRef = useRef<HTMLDivElement>(null);
	const columnHeadersRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [scrollLeft, setScrollLeft] = useState(0);
	const [containerHeight, setContainerHeight] = useState(0);
	const [containerWidth, setContainerWidth] = useState(0);

	// Measure container dimensions
	useLayoutEffect(() => {
		const measureDimensions = () => {
			if (containerRef.current) {
				const rect = containerRef.current.getBoundingClientRect();
				setContainerHeight(rect.height);
				setContainerWidth(rect.width);
			}
		};

		measureDimensions();
		const resizeObserver = new ResizeObserver(measureDimensions);
		if (containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		return () => resizeObserver.disconnect();
	}, []);

	// Calculate viewport for virtual scrolling, accounting for frozen rows
	const viewport = useMemo(() => {
		if (containerHeight === 0) {
			return { startIndex: 0, endIndex: -1, totalHeight: 0 };
		}

		// Always include frozen rows in the viewport
		const frozenRowIndices = Array.from(freezeState?.frozenRows || []).sort((a, b) => a - b);
		let adjustedStartIndex = 0;
		let adjustedEndIndex = data.rows.length - 1;

		// For dynamic row heights, use a simpler approach
		if (getRowHeight) {
			// Calculate total height for all rows
			const totalHeight = Array.from({length: data.rows.length}, (_, i) => getRowHeight(i)).reduce((sum, h) => sum + h, 0);
			
			// Find visible rows by iterating through positions
			let currentY = 0;
			
			// Find start index (excluding frozen rows from normal calculation)
			for (let i = 0; i < data.rows.length; i++) {
				if (freezeState?.frozenRows.has(i)) {
					currentY += getRowHeight(i);
					continue; // Skip frozen rows in viewport calculation
				}
				
				const rowHeight = getRowHeight(i);
				if (currentY + rowHeight > scrollTop) {
					adjustedStartIndex = Math.max(0, i - 5); // overscan
					break;
				}
				currentY += rowHeight;
			}
			
			// Find end index
			currentY = Array.from({length: adjustedStartIndex}, (_, i) => getRowHeight(i)).reduce((sum, h) => sum + h, 0);
			for (let i = adjustedStartIndex; i < data.rows.length; i++) {
				if (freezeState?.frozenRows.has(i)) {
					continue; // Skip frozen rows
				}
				
				if (currentY > scrollTop + containerHeight) {
					adjustedEndIndex = Math.min(data.rows.length - 1, i + 5); // overscan
					break;
				}
				currentY += getRowHeight(i);
			}
			
			// Include all frozen rows in the visible range
			const visibleIndices = new Set<number>();
			for (let i = adjustedStartIndex; i <= adjustedEndIndex; i++) {
				visibleIndices.add(i);
			}
			frozenRowIndices.forEach(frozenIndex => {
				visibleIndices.add(frozenIndex);
			});
			
			const sortedVisibleIndices = Array.from(visibleIndices).sort((a: number, b: number) => a - b);
			
			return { 
				startIndex: sortedVisibleIndices[0] ?? 0, 
				endIndex: sortedVisibleIndices[sortedVisibleIndices.length - 1] ?? 0, 
				totalHeight 
			};
		}

		// Use fixed row height calculation
		const baseViewport = ViewportCalculator.calculateVisibleRows(
			scrollTop,
			containerHeight,
			ROW_HEIGHT,
			data.rows.length,
			5 // overscan
		);
		
		// Include frozen rows
		const visibleIndices = new Set<number>();
		for (let i = baseViewport.startIndex; i <= baseViewport.endIndex; i++) {
			visibleIndices.add(i);
		}
		frozenRowIndices.forEach(frozenIndex => {
			visibleIndices.add(frozenIndex);
		});
		
		const sortedVisibleIndices = Array.from(visibleIndices).sort((a: number, b: number) => a - b);
		
		return {
			startIndex: sortedVisibleIndices[0] ?? 0,
			endIndex: sortedVisibleIndices[sortedVisibleIndices.length - 1] ?? 0,
			totalHeight: baseViewport.totalHeight
		};
	}, [scrollTop, containerHeight, data.rows.length, getRowHeight, freezeState?.frozenRows]);

	// Calculate column viewport for horizontal virtualization, accounting for frozen columns
	const columnViewport: ColumnViewportInfo = useMemo(() => {
		if (containerWidth === 0 || data.columns.length === 0) {
			return { startIndex: 0, endIndex: -1, offsetX: 0, totalWidth: 0, visibleCount: 0 };
		}

		// Get column widths array
		const columnWidths = data.columns.map((_, index) => 
			getColumnWidth ? getColumnWidth(index) : data.columns[index]?.width || 100
		);

		// Always include frozen columns in the viewport
		const frozenColumnIndices = Array.from(freezeState?.frozenColumns || []).sort((a, b) => a - b);

		const baseViewport = ViewportCalculator.calculateVisibleColumns(
			scrollLeft,
			containerWidth,
			columnWidths,
			2 // overscan
		);
		
		// Include frozen columns
		const visibleIndices = new Set<number>();
		for (let i = baseViewport.startIndex; i <= baseViewport.endIndex; i++) {
			visibleIndices.add(i);
		}
		frozenColumnIndices.forEach(frozenIndex => {
			if (frozenIndex < data.columns.length) {
				visibleIndices.add(frozenIndex);
			}
		});
		
		const sortedVisibleIndices = Array.from(visibleIndices).sort((a: number, b: number) => a - b);
		
		return {
			startIndex: sortedVisibleIndices[0] ?? 0,
			endIndex: sortedVisibleIndices[sortedVisibleIndices.length - 1] ?? 0,
			offsetX: baseViewport.offsetX,
			totalWidth: baseViewport.totalWidth,
			visibleCount: sortedVisibleIndices.length
		};
	}, [scrollLeft, containerWidth, data.columns.length, getColumnWidth, data.columns, freezeState?.frozenColumns]);

	const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
		const newScrollTop = e.currentTarget.scrollTop;
		const newScrollLeft = e.currentTarget.scrollLeft;
		
		setScrollTop(newScrollTop);
		setScrollLeft(newScrollLeft);
		
		// Synchronize row numbers vertical scroll
		if (rowNumbersRef.current && rowNumbersRef.current.scrollTop !== newScrollTop) {
			rowNumbersRef.current.scrollTop = newScrollTop;
		}
		
		// Synchronize column headers horizontal scroll
		if (columnHeadersRef.current && columnHeadersRef.current.scrollLeft !== newScrollLeft) {
			columnHeadersRef.current.scrollLeft = newScrollLeft;
		}
	};

	// Expose scrollToCell method via ref
	useImperativeHandle(ref, () => ({
		scrollToCell: (row: number, col: number) => {
			if (!containerRef.current) {
				return;
			}

			const currentScrollTop = containerRef.current.scrollTop;
			const currentScrollLeft = containerRef.current.scrollLeft;
			const containerHeight = containerRef.current.clientHeight;
			const containerWidth = containerRef.current.clientWidth;

			// Calculate the actual position of the target row for dynamic heights
			let rowTop = 0;
			let rowBottom = 0;
			
			if (getRowHeight) {
				// For dynamic row heights, calculate cumulative height
				for (let i = 0; i < row; i++) {
					rowTop += getRowHeight(i);
				}
				rowBottom = rowTop + getRowHeight(row);
			} else {
				// For fixed row heights, use simple calculation
				rowTop = row * ROW_HEIGHT;
				rowBottom = rowTop + ROW_HEIGHT;
			}

			// Calculate the actual position of the target column for dynamic widths
			let colLeft = 0; // In fixed header layout, data area doesn't include row number column
			let colRight = 0;
			
			if (getColumnWidth) {
				// For dynamic column widths, calculate cumulative width
				for (let i = 0; i < col; i++) {
					colLeft += getColumnWidth(i);
				}
				colRight = colLeft + getColumnWidth(col);
			} else {
				// For fixed column widths, use default width
				const defaultColWidth = data.columns[col]?.width || 100;
				colLeft += col * defaultColWidth;
				colRight = colLeft + defaultColWidth;
			}

			const viewportTop = currentScrollTop;
			const viewportBottom = currentScrollTop + containerHeight;
			const viewportLeft = currentScrollLeft;
			const viewportRight = currentScrollLeft + containerWidth;

			let newScrollTop = currentScrollTop;
			let newScrollLeft = currentScrollLeft;

			// Check vertical scrolling (rows)
			if (rowTop < viewportTop) {
				newScrollTop = rowTop;
			} else if (rowBottom > viewportBottom) {
				newScrollTop = rowBottom - containerHeight;
			}

			// Check horizontal scrolling (columns)
			if (colLeft < viewportLeft) {
				newScrollLeft = colLeft;
			} else if (colRight > viewportRight) {
				newScrollLeft = colRight - containerWidth;
			}

			// Apply scrolling if needed
			if (newScrollTop !== currentScrollTop) {
				containerRef.current.scrollTop = newScrollTop;
			}
			if (newScrollLeft !== currentScrollLeft) {
				containerRef.current.scrollLeft = newScrollLeft;
			}
		}
	}), [getRowHeight, getColumnWidth, data.columns]);



	const handleSelectCell = (rowIndex: number, colIndex: number) => {
		// Select the individual cell - this will also set it as editing cell
		selectCell(rowIndex, colIndex);
	};

	const handleStartEdit = (rowIndex: number, colIndex: number) => {
		startEdit(rowIndex, colIndex);
	};

	const handleCommitEdit = (value: any) => {
		if (selection.editingCell) {
			const { row, col } = selection.editingCell;
			onCellChange?.(row, col, value);
			commitEdit();
		}
	};

	const handleCancelEdit = () => {
		cancelEdit();
	};

	const handleNavigate = (direction: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => {
		if (!selection.editingCell) return;
		
		const { row, col } = selection.editingCell;
		let newRow = row;
		let newCol = col;
		
		switch (direction) {
			case 'up':
				newRow = Math.max(0, row - 1);
				break;
			case 'down':
				newRow = Math.min(data.rows.length - 1, row + 1);
				break;
			case 'left':
			case 'prev':
				newCol = Math.max(0, col - 1);
				break;
			case 'right':
			case 'next':
				newCol = Math.min(data.columns.length - 1, col + 1);
				break;
		}
		
		// Navigate to the new cell and start editing
		setSelection({
			selectedRange: SelectionUtils.createSingleCellSelection(newRow, newCol),
			focusedCell: { row: newRow, col: newCol },
			editingCell: { row: newRow, col: newCol }
		});
		
		onEditStart?.(newRow, newCol);
	};




	// Calculate viewport information for fixed header layout
	const visibleRowCount = useMemo(() => {
		return Math.max(0, viewport.endIndex - viewport.startIndex + 1);
	}, [viewport]);

	if (data.rows.length === 0) {
		return (
			<div className="grid-body">
				<div className="empty-data">No data to display</div>
			</div>
		);
	}

	return (
		<div className="grid-with-fixed-headers">
			{/* Fixed top-left corner */}
			<div className="fixed-corner">
				<div 
					className="column-letter-header row-number-space select-all-corner"
					style={{ width: `${ROW_NUMBER_WIDTH}px`, height: '24px' }}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onSelectAll?.();
					}}
					title="Select all"
				>
					<span className="select-all-icon">⬜</span>
				</div>
			</div>

			{/* Fixed column headers */}
			<div 
				ref={columnHeadersRef}
				className="fixed-column-headers"
				style={{ overflow: 'hidden' }}
			>
				<ColumnHeaders 
					columns={columns}
					onSort={onSort}
					onColumnMouseDown={onColumnMouseDown}
					onColumnMouseEnter={onColumnMouseEnter}
					onSelectAll={onSelectAll}
					sortKeys={sortKeys}
					selectedCells={selectedCells}
					data={data}
					getColumnWidth={getColumnWidth}
					onColumnResizeStart={onColumnResizeStart}
					resizingColumnIndex={resizingColumnIndex}
					resizingColumns={resizingColumns}
					dataExplorerService={dataExplorerService}
					hideSelectAllCorner={true}
					columnViewport={columnViewport}
					freezeState={freezeState}
					onFreezeColumn={onFreezeColumn}
					onUnfreezeColumn={onUnfreezeColumn}
					onUnfreezeAllColumns={onUnfreezeAllColumns}
					selection={selection}
				/>
			</div>

			{/* Fixed row numbers */}
			<div 
				ref={rowNumbersRef}
				className="fixed-row-numbers"
				style={{ overflow: 'hidden' }}
			>
				<div 
					style={{
						height: `${viewport.totalHeight}px`,
						width: `${ROW_NUMBER_WIDTH}px`,
						position: 'relative'
					}}
				>
				{Array.from({length: visibleRowCount}, (_, index) => {
					const actualRowIndex = viewport.startIndex + index;
					if (actualRowIndex >= data.rows.length) return null;
					
					const isRowSelected = SelectionUtils.isRowSelected(actualRowIndex, selection.selectedRange, data.columns.length);
					const isRowResizing = resizingRowIndex === actualRowIndex;
					const isRowResizingMultiple = resizingRows.has(actualRowIndex);
					const isRowFrozen = freezeState?.frozenRows.has(actualRowIndex) || false;
					
					// Calculate sticky top position for frozen rows
					let stickyTop = '';
					if (isRowFrozen && getRowHeight) {
						let topPosition = 0;
						for (let r = 0; r < actualRowIndex; r++) {
							if (freezeState?.frozenRows.has(r)) {
								topPosition += getRowHeight(r);
							}
						}
						stickyTop = `${topPosition}px`;
					}
					
					return (
						<div
							key={`row-number-${actualRowIndex}`}
							className={`grid-cell row-number-cell ${isRowSelected ? 'selected' : ''} ${isRowResizing || isRowResizingMultiple ? 'resizing-row' : ''} ${isRowFrozen ? 'frozen-row' : ''}`}
							style={{ 
								width: `${ROW_NUMBER_WIDTH}px`,
								height: `${getRowHeight ? getRowHeight(actualRowIndex) : ROW_HEIGHT}px`,
								position: isRowFrozen ? 'sticky' : 'absolute',
								top: isRowFrozen ? stickyTop : `${getRowHeight ? Array.from({length: actualRowIndex}, (_, idx) => getRowHeight(idx)).reduce((sum, h) => sum + h, 0) : actualRowIndex * ROW_HEIGHT}px`,
								left: 0
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								onRowMouseDown?.(actualRowIndex, e);
							}}
							onMouseEnter={(e) => {
								onRowMouseEnter?.(actualRowIndex, e);
							}}
							onContextMenu={(e) => handleRowNumberContextMenu(e, actualRowIndex)}
						>
							{actualRowIndex + 1}
							{/* Row resize handle */}
							{onRowResizeStart && (
								<div
									className="row-resize-handle"
									onMouseDown={(e) => {
										e.preventDefault();
										e.stopPropagation();
										onRowResizeStart(actualRowIndex, e);
									}}
								/>
							)}
						</div>
					);
				})}
				</div>
			</div>

			{/* Scrollable data area */}
			<div 
				ref={containerRef}
				className="scrollable-data-area"
				style={{
					height: '100%',
					overflow: 'auto',
					position: 'relative'
				}}
				onScroll={handleScroll}
			>
				<div 
					style={{
						height: `${viewport.totalHeight}px`,
						width: `${columnViewport.totalWidth}px`,
						position: 'relative'
					}}
				>
					{/* Modified visible rows without row numbers */}
					{Array.from({length: visibleRowCount}, (_, index) => {
						const i = viewport.startIndex + index;
						if (i >= data.rows.length) return null;
						
						const row = data.rows[i];
						const isRowHovered = hoveredCell?.row === i;
						const isRowResizing = resizingRowIndex === i;
						const isRowResizingMultiple = resizingRows.has(i);
						const isRowSelected = SelectionUtils.isRowSelected(i, selection.selectedRange, data.columns.length);
						const isRowFrozen = freezeState?.frozenRows.has(i) || false;
						
						// Calculate sticky top position for frozen rows
						let rowStickyTop = '';
						if (isRowFrozen && getRowHeight) {
							let topPosition = 0;
							for (let r = 0; r < i; r++) {
								if (freezeState?.frozenRows.has(r)) {
									topPosition += getRowHeight(r);
								}
							}
							rowStickyTop = `${topPosition}px`;
						}
						
						return (
							<div 
								key={i} 
								className={`grid-row ${isRowSelected ? 'selected' : ''} ${isRowHovered ? 'hovered' : ''} ${isRowResizing || isRowResizingMultiple ? 'resizing-row' : ''} ${isRowFrozen ? 'frozen-row' : ''}`}
								style={{ 
									width: `${columnViewport.totalWidth}px`, 
									minWidth: `${columnViewport.totalWidth}px`,
									height: `${getRowHeight ? getRowHeight(i) : ROW_HEIGHT}px`,
									position: isRowFrozen ? 'sticky' : 'absolute',
									top: isRowFrozen ? rowStickyTop : `${getRowHeight ? Array.from({length: i}, (_, idx) => getRowHeight(idx)).reduce((sum, h) => sum + h, 0) : i * ROW_HEIGHT}px`,
									left: 0
								}}
							>
								{(() => {
									// Use column viewport for virtualization
									const startColIndex = columnViewport.startIndex;
									const endColIndex = columnViewport.endIndex;
									const visibleCells = [];
									
									for (let colIndex = startColIndex; colIndex <= endColIndex && colIndex < data.columns.length; colIndex++) {
										const column = data.columns[colIndex];
										
										// Calculate left offset for virtualized positioning
										let leftOffset = 0;
										for (let c = 0; c < colIndex; c++) {
											leftOffset += getColumnWidth ? getColumnWidth(c) : data.columns[c].width || 100;
										}
										
										visibleCells.push((() => {
									const cellValue = row[colIndex];
									const isCurrentlyEditing = selection.editingCell?.row === i && selection.editingCell?.col === colIndex;
									const isFocusedCell = selection.focusedCell?.row === i && selection.focusedCell?.col === colIndex;
									const isMultiSelected = SelectionUtils.isCellInSelection(i, colIndex, selection.selectedRange);
									const isColumnHovered = hoveredCell?.col === colIndex;
									const isColumnResizing = resizingColumnIndex === colIndex;
									const isColumnResizingMultiple = resizingColumns.has(colIndex);
									const isTextWrapped = getRowHeight ? getRowHeight(i) > ROW_HEIGHT : false;
									const isColumnFrozen = freezeState?.frozenColumns.has(colIndex) || false;
									const isCellFrozenIntersection = isRowFrozen && isColumnFrozen;
									const isCellInClipboard = isCellInClipboardRange(i, colIndex);
									const clipboardOperation = isCellInClipboard ? clipboardRange?.operation : null;
									const clipboardBorderClasses = getClipboardBorderClasses(i, colIndex);
									
									// Calculate sticky left position for frozen columns
									let cellStickyLeft = '';
									if (isColumnFrozen && getColumnWidth) {
										let leftPosition = 0;
										for (let c = 0; c < colIndex; c++) {
											if (freezeState?.frozenColumns.has(c)) {
												leftPosition += getColumnWidth(c);
											}
										}
										cellStickyLeft = `${leftPosition}px`;
									}
									
									return (
										<div
											key={colIndex}
											className={`grid-cell ${isMultiSelected ? 'cell-selected' : ''} ${isRowHovered ? 'row-hovered' : ''} ${isColumnHovered ? 'column-hovered' : ''} ${isColumnResizing || isColumnResizingMultiple ? 'resizing-column' : ''} ${isTextWrapped ? 'text-wrap' : ''} ${isColumnFrozen ? 'frozen-column' : ''} ${isCellFrozenIntersection ? 'frozen-row-column' : ''} ${isCellInClipboard ? `clipboard-${clipboardOperation}` : ''} ${clipboardBorderClasses}`}
											style={{ 
												width: `${getColumnWidth ? getColumnWidth(colIndex) : column.width || 100}px`,
												height: `${getRowHeight ? getRowHeight(i) : ROW_HEIGHT}px`,
												position: isColumnFrozen ? 'sticky' : 'absolute',
												left: isColumnFrozen ? cellStickyLeft : `${leftOffset}px`
											}}
											onMouseDown={(e) => {
												if (!isCurrentlyEditing) {
													onCellMouseDown?.(i, colIndex, e);
												}
											}}
											onMouseEnter={(e) => {
												if (!isCurrentlyEditing) {
													onCellMouseEnter?.(i, colIndex, e);
												}
											}}
										>
											<EditableCell
												value={cellValue}
												rowIndex={i}
												colIndex={colIndex}
												isEditing={isCurrentlyEditing}
												isSelected={isFocusedCell}
												onSelect={() => handleSelectCell(i, colIndex)}
												onStartEdit={() => handleStartEdit(i, colIndex)}
												onCommitEdit={handleCommitEdit}
												onCancelEdit={handleCancelEdit}
												onNavigate={handleNavigate}
												isTextWrapped={isTextWrapped}
											/>
										</div>
									);
								})());
								}
								
								return visibleCells;
							})()}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
});
