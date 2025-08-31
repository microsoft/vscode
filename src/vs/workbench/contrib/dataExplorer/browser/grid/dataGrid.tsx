/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useRef, forwardRef, useEffect, useImperativeHandle } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { SortKey } from '../../../../services/dataExplorer/browser/filtering/sortManager.js';
import { IDataExplorerService } from '../../../../services/dataExplorer/browser/interfaces/IDataExplorerService.js';
import { VirtualGridBody } from './gridBody.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IDataGridFindTarget, DataGridCell, DataGridMatch } from '../controls/searchControls/dataGridFindTypes.js';
import { Emitter } from '../../../../../base/common/event.js';
import { FilterDropdown } from '../controls/filterControls.js';
import { FilterDropdownState } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';

export interface CellPosition {
	row: number;
	col: number;
}

// Selection region defined by bounding rectangle (inclusive bounds)
export interface SelectionRange {
	startRow: number;
	endRow: number;
	startColumn: number;
	endColumn: number;
}

// Unified selection system with bounding rectangle approach
export interface DataGridSelection {
	selectedRange: SelectionRange | null; // Selection as bounding rectangle
	focusedCell: CellPosition | null; // Individual cell selected for editing
	editingCell: CellPosition | null; // Currently editing cell
	anchorCell: CellPosition | null; // Anchor cell for shift selection (fixed corner)
}

// Editing state management
export interface EditingState {
	isAnyEditing: boolean;
	editingCell: CellPosition | null;
}

// Freeze state management
export interface FreezeState {
	frozenRows: Set<number>;    // Set of row indices that are frozen
	frozenColumns: Set<number>; // Set of column indices that are frozen
}

// Utility functions for working with selections
export const SelectionUtils = {
	// Create a single cell selection
	createSingleCellSelection: (row: number, col: number): SelectionRange => ({
		startRow: row,
		endRow: row,
		startColumn: col,
		endColumn: col
	}),

	// Create a range selection
	createRangeSelection: (startRow: number, startCol: number, endRow: number, endCol: number): SelectionRange => ({
		startRow: Math.min(startRow, endRow),
		endRow: Math.max(startRow, endRow),
		startColumn: Math.min(startCol, endCol),
		endColumn: Math.max(startCol, endCol)
	}),

	// Create a full row selection
	createRowSelection: (rowIndex: number, maxColumns: number): SelectionRange => ({
		startRow: rowIndex,
		endRow: rowIndex,
		startColumn: 0,
		endColumn: maxColumns - 1
	}),

	// Create a full column selection
	createColumnSelection: (colIndex: number, maxRows: number): SelectionRange => ({
		startRow: 0,
		endRow: maxRows - 1,
		startColumn: colIndex,
		endColumn: colIndex
	}),

	// Create a selection for all cells
	createAllSelection: (maxRows: number, maxColumns: number): SelectionRange => ({
		startRow: 0,
		endRow: maxRows - 1,
		startColumn: 0,
		endColumn: maxColumns - 1
	}),

	// Check if a specific cell is within the selection
	isCellInSelection: (row: number, col: number, selection: SelectionRange | null): boolean => {
		if (!selection) return false;
		return row >= selection.startRow && row <= selection.endRow &&
			   col >= selection.startColumn && col <= selection.endColumn;
	},

	// Check if an entire row is selected
	isRowSelected: (rowIndex: number, selection: SelectionRange | null, maxColumns: number): boolean => {
		if (!selection) return false;
		return rowIndex >= selection.startRow && rowIndex <= selection.endRow &&
			   selection.startColumn === 0 && selection.endColumn === maxColumns - 1;
	},

	// Check if an entire column is selected
	isColumnSelected: (colIndex: number, selection: SelectionRange | null, maxRows: number): boolean => {
		if (!selection) return false;
		return colIndex >= selection.startColumn && colIndex <= selection.endColumn &&
			   selection.startRow === 0 && selection.endRow === maxRows - 1;
	},

	// Get all cell positions within a selection
	getCellsInSelection: (selection: SelectionRange | null): Array<{row: number, col: number}> => {
		if (!selection) return [];
		const cells = [];
		for (let row = selection.startRow; row <= selection.endRow; row++) {
			for (let col = selection.startColumn; col <= selection.endColumn; col++) {
				cells.push({ row, col });
			}
		}
		return cells;
	}
};

interface DataGridProps {
	data: GridData;
	onCellChange?: (row: number, col: number, value: any) => void;
	onColumnSort?: (columnIndex: number, ascending: boolean) => void;
	onDataChange?: (data: GridData) => void;

	storageService?: IStorageService;
	dataExplorerService?: IDataExplorerService;
}

/**
 * DataGrid component using the original layout structure with virtual grid body
 */
export interface DataGridRef extends IDataGridFindTarget {
	wrapTextInSelection: () => void;
	selectAll: () => void;
}

export const DataGrid = forwardRef<DataGridRef, DataGridProps>(({ 
	data, 
	onCellChange, 
	onColumnSort, 
	onDataChange, 
	storageService,
	dataExplorerService
}, ref) => {

	const [selection, setSelection] = useState<DataGridSelection>({
		selectedRange: null,
		focusedCell: null,
		editingCell: null,
		anchorCell: null
	});

	// Get sort keys from the service
	const sortKeys: SortKey[] = dataExplorerService?.getSortKeys() || [];
	const [editingState, setEditingState] = useState<EditingState>({
		isAnyEditing: false,
		editingCell: null
	});
	const [freezeState, setFreezeState] = useState<FreezeState>({
		frozenRows: new Set<number>(),
		frozenColumns: new Set<number>()
	});
	const [hoveredCell, setHoveredCell] = useState<{row: number, col: number} | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState<{type: 'row' | 'column' | 'cell' | 'resize-column' | 'resize-row', index?: number, cellPos?: CellPosition, startX?: number, startY?: number, initialWidth?: number, initialHeight?: number} | null>(null);
	const [isMouseDown, setIsMouseDown] = useState(false);
	
	// Clipboard visual state
	const [clipboardRange, setClipboardRange] = useState<{startRow: number, endRow: number, startColumn: number, endColumn: number, operation: 'copy' | 'cut'} | null>(null);
	
	// Find/replace state
	const [findMatches, setFindMatches] = useState<DataGridMatch[]>([]);
	const onDataChangedEmitter = useRef(new Emitter<{ row: number; column: number; oldValue: any; newValue: any }>());
	
	// Filter state
	const [filterDropdown, setFilterDropdown] = useState<FilterDropdownState>({
		isOpen: false,
		columnIndex: -1,
		searchTerm: '',
		availableValues: [],
		selectedValues: new Set(),
		position: { x: 0, y: 0 }
	});
	
	// Auto-scroll state for drag operations
	const isDraggingRef = useRef(false);
	const isMouseOutsideViewRef = useRef(false);
	const lastMouseEventRef = useRef<MouseEvent | null>(null);
	const autoScrollTimerRef = useRef<number | null>(null);
	
	// Keep the ref in sync with isDragging state
	useEffect(() => {
		isDraggingRef.current = isDragging;
	}, [isDragging]);
	
	// State for dynamic sizing
	const [columnWidths, setColumnWidths] = useState<Map<number, number>>(new Map());
	const [rowHeights, setRowHeights] = useState<Map<number, number>>(new Map());
	const [isResizing, setIsResizing] = useState(false);
	const [resizingColumnIndex, setResizingColumnIndex] = useState<number | null>(null);
	const [resizingRowIndex, setResizingRowIndex] = useState<number | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const gridBodyRef = useRef<{ scrollToCell: (row: number, col: number) => void } | null>(null);

	// Storage keys for persistence
	const getStorageKey = (type: 'columns' | 'rows' | 'freeze', dataId?: string) => {
		const baseKey = type === 'freeze' ? `dataExplorer.freezeState` : `dataExplorer.${type}Sizes`;
		if (dataId) {
			return `${baseKey}.${dataId}`;
		}
		return baseKey;
	};

	// Helper functions for dynamic sizing
	const getColumnWidth = (columnIndex: number): number => {
		return columnWidths.get(columnIndex) ?? data.columns[columnIndex]?.width ?? 100;
	};

	const getRowHeight = (rowIndex: number): number => {
		// Get the font size from the container or use default
		const container = containerRef.current;
		let baseFontSize = 13; // Default font size
		if (container) {
			const computedStyle = getComputedStyle(container);
			const fontSize = parseFloat(computedStyle.fontSize);
			if (!isNaN(fontSize)) {
				baseFontSize = fontSize;
			}
		}
		
		// Calculate dynamic height: font size with minimal line height (minimum 20px)
		const defaultHeight = Math.max(20, Math.round(baseFontSize * 1.2));
		return rowHeights.get(rowIndex) ?? defaultHeight;
	};

	// Editing state management functions
	const startCellEdit = (row: number, col: number) => {
		setEditingState({
			isAnyEditing: true,
			editingCell: { row, col }
		});
		
		// Clear multi-cell selections when starting edit, keep focused cell
		setSelection(prev => ({
			selectedRange: null,
			focusedCell: { row, col },
			editingCell: { row, col },
			anchorCell: { row, col }
		}));
	};

	const endCellEdit = () => {
		setEditingState({
			isAnyEditing: false,
			editingCell: null
		});
		
		// Clear editing cell from selection but keep focused cell
		setSelection(prev => ({
			...prev,
			editingCell: null
		}));
	};

	// Freeze/unfreeze functions
	const freezeRow = (rowIndex: number) => {
		setFreezeState(prev => ({
			...prev,
			frozenRows: new Set([...prev.frozenRows, rowIndex])
		}));
	};

	const unfreezeRow = (rowIndex: number) => {
		setFreezeState(prev => {
			const newFrozenRows = new Set(prev.frozenRows);
			newFrozenRows.delete(rowIndex);
			return {
				...prev,
				frozenRows: newFrozenRows
			};
		});
	};

	const freezeColumn = (columnIndex: number) => {
		setFreezeState(prev => ({
			...prev,
			frozenColumns: new Set([...prev.frozenColumns, columnIndex])
		}));
	};

	const unfreezeColumn = (columnIndex: number) => {
		setFreezeState(prev => {
			const newFrozenColumns = new Set(prev.frozenColumns);
			newFrozenColumns.delete(columnIndex);
			return {
				...prev,
				frozenColumns: newFrozenColumns
			};
		});
	};

	const unfreezeAllRows = () => {
		setFreezeState(prev => ({
			...prev,
			frozenRows: new Set<number>()
		}));
	};

	const unfreezeAllColumns = () => {
		setFreezeState(prev => ({
			...prev,
			frozenColumns: new Set<number>()
		}));
	};

	const unfreezePanes = () => {
		setFreezeState({
			frozenRows: new Set<number>(),
			frozenColumns: new Set<number>()
		});
	};

	// Persistence functions
	const saveColumnWidths = (widths: Map<number, number>) => {
		if (!storageService) return;
		
		const widthsObj: Record<string, number> = {};
		widths.forEach((width, index) => {
			widthsObj[index.toString()] = width;
		});
		
		try {
			storageService.store(
				getStorageKey('columns', data.metadata.fileName),
				JSON.stringify(widthsObj),
				StorageScope.WORKSPACE,
				StorageTarget.USER
			);
		} catch (error) {
			console.warn('Failed to save column widths:', error);
		}
	};

	const saveRowHeights = (heights: Map<number, number>) => {
		if (!storageService) return;
		
		const heightsObj: Record<string, number> = {};
		heights.forEach((height, index) => {
			heightsObj[index.toString()] = height;
		});
		
		try {
			storageService.store(
				getStorageKey('rows', data.metadata.fileName),
				JSON.stringify(heightsObj),
				StorageScope.WORKSPACE,
				StorageTarget.USER
			);
		} catch (error) {
			console.warn('Failed to save row heights:', error);
		}
	};

	const loadColumnWidths = (): Map<number, number> => {
		if (!storageService) return new Map();
		
		try {
			const stored = storageService.get(
				getStorageKey('columns', data.metadata.fileName),
				StorageScope.WORKSPACE
			);
			
			if (stored) {
				const widthsObj = JSON.parse(stored);
				const widthsMap = new Map<number, number>();
				
				Object.entries(widthsObj).forEach(([index, width]) => {
					widthsMap.set(parseInt(index, 10), width as number);
				});
				
				return widthsMap;
			}
		} catch (error) {
			console.warn('Failed to load column widths:', error);
		}
		
		return new Map();
	};

	const loadRowHeights = (): Map<number, number> => {
		if (!storageService) return new Map();
		
		try {
			const stored = storageService.get(
				getStorageKey('rows', data.metadata.fileName),
				StorageScope.WORKSPACE
			);
			
			if (stored) {
				const heightsObj = JSON.parse(stored);
				const heightsMap = new Map<number, number>();
				
				Object.entries(heightsObj).forEach(([index, height]) => {
					heightsMap.set(parseInt(index, 10), height as number);
				});
				
				return heightsMap;
			}
		} catch (error) {
			console.warn('Failed to load row heights:', error);
		}
		
		return new Map();
	};

	const saveFreezeState = (freezeState: FreezeState) => {
		if (!storageService) return;
		
		try {
			const serializable = {
				frozenRows: Array.from(freezeState.frozenRows),
				frozenColumns: Array.from(freezeState.frozenColumns)
			};
			storageService.store(
				getStorageKey('freeze', data.metadata.fileName),
				JSON.stringify(serializable),
				StorageScope.WORKSPACE,
				StorageTarget.USER
			);
		} catch (error) {
			console.warn('Failed to save freeze state:', error);
		}
	};

	const loadFreezeState = (): FreezeState => {
		if (!storageService) return { frozenRows: new Set<number>(), frozenColumns: new Set<number>() };
		
		try {
			const stored = storageService.get(
				getStorageKey('freeze', data.metadata.fileName),
				StorageScope.WORKSPACE
			);
			
			if (stored) {
				const parsed = JSON.parse(stored);
				return {
					frozenRows: new Set<number>(parsed.frozenRows || []),
					frozenColumns: new Set<number>(parsed.frozenColumns || [])
				};
			}
		} catch (error) {
			console.warn('Failed to load freeze state:', error);
		}
		
		return { frozenRows: new Set<number>(), frozenColumns: new Set<number>() };
	};

	// Load stored dimensions and freeze state only when fileName actually changes (not on every data mutation)
	const [lastFileName, setLastFileName] = useState<string>(data.metadata.fileName);
	useEffect(() => {
		const currentFileName = data.metadata.fileName;
		if (currentFileName !== lastFileName) {
			setLastFileName(currentFileName);
			
			if (storageService && currentFileName) {
				const storedColumnWidths = loadColumnWidths();
				const storedRowHeights = loadRowHeights();
				const storedFreezeState = loadFreezeState();
				
				if (storedColumnWidths.size > 0) {
					setColumnWidths(storedColumnWidths);
				}
				
				if (storedRowHeights.size > 0) {
					setRowHeights(storedRowHeights);
				}
				
				setFreezeState(storedFreezeState);
			}
		}
	}, [data.metadata.fileName, lastFileName, storageService]);

	// Save column widths when they change
	useEffect(() => {
		if (columnWidths.size > 0) {
			saveColumnWidths(columnWidths);
		}
	}, [columnWidths]);

	// Save row heights when they change
	useEffect(() => {
		if (rowHeights.size > 0) {
			saveRowHeights(rowHeights);
		}
	}, [rowHeights]);

	// Save freeze state when it changes
	useEffect(() => {
		saveFreezeState(freezeState);
	}, [freezeState]);





	// Helper function to create a canvas context for text measurement
	const getTextMeasurementContext = (): CanvasRenderingContext2D => {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Canvas 2D context not available');
		}
		
		const container = containerRef.current;
		if (!container) {
			throw new Error('Container ref not available');
		}
		
		const existingCell = container.querySelector('.grid-cell:not(.row-number-cell), .cell-content, .editable-cell');
		
		if (existingCell) {
			const computedStyle = getComputedStyle(existingCell);
			const fontSize = computedStyle.fontSize;
			const fontFamily = computedStyle.fontFamily;
			const fontWeight = computedStyle.fontWeight;
			
			context.font = `${fontWeight} ${fontSize} ${fontFamily}`;
		} else {
			context.font = '12px -apple-system, "system-ui", sans-serif';
		}
		return context;
	};

	// Helper function to calculate optimal column width for content
	const calculateOptimalColumnWidth = (columnIndex: number): number => {
		const context = getTextMeasurementContext();
		
		let maxWidth = 0;
		
		// Check header width (raw text measurement only)
		const headerText = data.columns[columnIndex]?.name || '';
		if (headerText) {
			const headerMetrics = context.measureText(headerText);
			maxWidth = Math.max(maxWidth, headerMetrics.width);
		}
		
		// Check visible rows first (for responsiveness)
		const visibleRowCount = Math.min(50, data.rows.length);
		const sampleSize = Math.min(200, data.rows.length);
		
		for (let i = 0; i < visibleRowCount && i < data.rows.length; i++) {
			const cellValue = data.rows[i][columnIndex];
			const cellText = String(cellValue ?? '');
			if (cellText) {
				// Handle potential line breaks in cell text
				const lines = cellText.split('\n');
				let maxLineWidth = 0;
				for (const line of lines) {
					const lineMetrics = context.measureText(line);
					maxLineWidth = Math.max(maxLineWidth, lineMetrics.width);
				}
				
				maxWidth = Math.max(maxWidth, maxLineWidth);
			}
		}
		
		// Then sample remaining rows if dataset is large
		if (data.rows.length > visibleRowCount) {
			const remainingRows = data.rows.length - visibleRowCount;
			const step = Math.max(1, Math.floor(remainingRows / (sampleSize - visibleRowCount)));
			
			for (let i = visibleRowCount; i < data.rows.length; i += step) {
				const cellValue = data.rows[i][columnIndex];
				const cellText = String(cellValue ?? '');
				if (cellText) {
					// Handle potential line breaks in cell text
					const lines = cellText.split('\n');
					let maxLineWidth = 0;
					for (const line of lines) {
						const lineMetrics = context.measureText(line);
						maxLineWidth = Math.max(maxLineWidth, lineMetrics.width);
					}
					
					maxWidth = Math.max(maxWidth, maxLineWidth);
				}
			}
		}
		
		return Math.ceil(maxWidth);
	};

	// Helper function to calculate optimal row height for content
	const calculateOptimalRowHeight = (rowIndex: number): number => {
		let maxHeight = 0;
		
		// Check each cell in this row to find the one requiring the most height
		for (let colIndex = 0; colIndex < data.columns.length; colIndex++) {
			const cellValue = data.rows[rowIndex][colIndex];
			const cellText = String(cellValue ?? '');
			
			if (cellText.trim()) {
				// Get the current column width to pass to the wrapping calculation
				const columnWidth = getColumnWidth(colIndex);
				
				// Use the existing calculateRequiredHeight function that handles text wrapping properly
				const requiredHeight = calculateRequiredHeight(cellText, columnWidth);
				
				maxHeight = Math.max(maxHeight, requiredHeight);
			}
		}
		
		return Math.ceil(maxHeight);
	};

	// Column resize handlers
	const handleColumnResizeStart = (columnIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const currentWidth = getColumnWidth(columnIndex);
		setDragStart({ 
			type: 'resize-column', 
			index: columnIndex,
			startX: event.clientX,
			initialWidth: currentWidth
		});
		setIsResizing(true);
		setResizingColumnIndex(columnIndex);
		setResizingRowIndex(null);
	};

	const handleColumnResizeDoubleClick = (columnIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		
		// Calculate optimal width for this column
		const optimalWidth = calculateOptimalColumnWidth(columnIndex);
		
		// Check if we have a column range selection that includes the double-clicked column
		const hasColumnRangeSelection = selection.selectedRange && 
			selection.selectedRange.startRow === 0 && 
			selection.selectedRange.endRow === data.rows.length - 1 &&
			columnIndex >= selection.selectedRange.startColumn && 
			columnIndex <= selection.selectedRange.endColumn;
		
		if (hasColumnRangeSelection && selection.selectedRange) {
			// Apply auto-resize to all columns in the selected range
			const columnRange = selection.selectedRange;
			setColumnWidths(prev => {
				const newWidths = new Map(prev);
				for (let colIndex = columnRange.startColumn; colIndex <= columnRange.endColumn; colIndex++) {
					const colOptimalWidth = calculateOptimalColumnWidth(colIndex);
					newWidths.set(colIndex, colOptimalWidth);
				}
				return newWidths;
			});
		} else {
			// Single column auto-resize
			setColumnWidths(prev => new Map(prev).set(columnIndex, optimalWidth));
		}
	};

	const handleRowResizeStart = (rowIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const currentHeight = getRowHeight(rowIndex);
		setDragStart({ 
			type: 'resize-row', 
			index: rowIndex,
			startY: event.clientY,
			initialHeight: currentHeight
		});
		setIsResizing(true);
		setResizingRowIndex(rowIndex);
		setResizingColumnIndex(null);
	};

	const handleRowResizeDoubleClick = (rowIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		
		// Calculate optimal height for this row
		const optimalHeight = calculateOptimalRowHeight(rowIndex);
		
		// Check if we have a row range selection that includes the double-clicked row
		const hasRowRangeSelection = selection.selectedRange && 
			selection.selectedRange.startColumn === 0 && 
			selection.selectedRange.endColumn === data.columns.length - 1 &&
			rowIndex >= selection.selectedRange.startRow && 
			rowIndex <= selection.selectedRange.endRow;
		
		if (hasRowRangeSelection && selection.selectedRange) {
			// Apply auto-resize to all rows in the selected range
			const rowRange = selection.selectedRange;
			setRowHeights(prev => {
				const newHeights = new Map(prev);
				for (let rIndex = rowRange.startRow; rIndex <= rowRange.endRow; rIndex++) {
					const rowOptimalHeight = calculateOptimalRowHeight(rIndex);
					newHeights.set(rIndex, rowOptimalHeight);
				}
				return newHeights;
			});
		} else {
			// Single row auto-resize
			setRowHeights(prev => new Map(prev).set(rowIndex, optimalHeight));
		}
	};

	const handleResizeMove = (event: MouseEvent) => {
		if (!isResizing || !dragStart) return;

		if (dragStart.type === 'resize-column' && dragStart.index !== undefined && dragStart.startX !== undefined && dragStart.initialWidth !== undefined) {
			const columnIndex = dragStart.index;
			
			// Calculate new width based on mouse movement from the start position
			const deltaX = event.clientX - dragStart.startX;
			const newWidth = Math.max(50, dragStart.initialWidth + deltaX);
			
			// Check if we have a column range selection that includes the resized column
			const hasColumnRangeSelection = selection.selectedRange && 
				selection.selectedRange.startRow === 0 && 
				selection.selectedRange.endRow === data.rows.length - 1 &&
				columnIndex >= selection.selectedRange.startColumn && 
				columnIndex <= selection.selectedRange.endColumn;
			
			if (hasColumnRangeSelection && selection.selectedRange) {
				// Apply resize to all columns in the selected range
				const columnRange = selection.selectedRange;
				setColumnWidths(prev => {
					const newWidths = new Map(prev);
					for (let colIndex = columnRange.startColumn; colIndex <= columnRange.endColumn; colIndex++) {
						newWidths.set(colIndex, newWidth);
					}
					return newWidths;
				});
			} else {
				// Single column resize (existing behavior)
				setColumnWidths(prev => new Map(prev).set(columnIndex, newWidth));
			}
		} else if (dragStart.type === 'resize-row' && dragStart.index !== undefined && dragStart.startY !== undefined && dragStart.initialHeight !== undefined) {
			const rowIndex = dragStart.index;
			
			// Calculate new height based on mouse movement from the start position
			const deltaY = event.clientY - dragStart.startY;
			const newHeight = Math.max(20, dragStart.initialHeight + deltaY);
			
			// Check if we have a row range selection that includes the resized row
			const hasRowRangeSelection = selection.selectedRange && 
				selection.selectedRange.startColumn === 0 && 
				selection.selectedRange.endColumn === data.columns.length - 1 &&
				rowIndex >= selection.selectedRange.startRow && 
				rowIndex <= selection.selectedRange.endRow;
			
			if (hasRowRangeSelection && selection.selectedRange) {
				// Apply resize to all rows in the selected range
				const rowRange = selection.selectedRange;
				setRowHeights(prev => {
					const newHeights = new Map(prev);
					for (let rIndex = rowRange.startRow; rIndex <= rowRange.endRow; rIndex++) {
						newHeights.set(rIndex, newHeight);
					}
					return newHeights;
				});
			} else {
				// Single row resize (existing behavior)
				setRowHeights(prev => new Map(prev).set(rowIndex, newHeight));
			}
		}
	};

	const handleResizeEnd = () => {
		setIsResizing(false);
		setDragStart(null);
		setResizingColumnIndex(null);
		setResizingRowIndex(null);
	};

	const handleRowMouseDown = (rowIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		setDragStart({ type: 'row', index: rowIndex });
		
		// Select entire row using the new range selection
		setSelection({
			selectedRange: SelectionUtils.createRowSelection(rowIndex, data.columns.length),
			focusedCell: null,
			editingCell: null,
			anchorCell: { row: rowIndex, col: 0 }
		});
	};

	const handleRowMouseEnter = (rowIndex: number, event?: React.MouseEvent) => {
		// Check if mouse button is actually pressed down
		const isActuallyMouseDown = event?.buttons === 1;
		
		// If no mouse button is pressed, clear drag state immediately
		if (!isActuallyMouseDown && (isMouseDown || isDragging || dragStart)) {
			setIsMouseDown(false);
			setIsDragging(false);
			setDragStart(null);
			return;
		}
		
		// Only handle drag selection if mouse is currently down and we have a drag start
		if (isActuallyMouseDown && dragStart?.type === 'row' && dragStart.index !== undefined) {
			// Start dragging if we haven't already and we moved to a different row
			if (!isDragging && rowIndex !== dragStart.index) {
				setIsDragging(true);
			}
			
			if (isDragging || rowIndex !== dragStart.index) {
				const startIndex = dragStart.index;
				const endIndex = rowIndex;
				const minIndex = Math.min(startIndex, endIndex);
				const maxIndex = Math.max(startIndex, endIndex);
				
				// Select row range using the new range selection
				setSelection({
					selectedRange: {
						startRow: minIndex,
						endRow: maxIndex,
						startColumn: 0,
						endColumn: data.columns.length - 1
					},
					focusedCell: null,
					editingCell: null,
					anchorCell: { row: dragStart.index, col: 0 }
				});
			}
		}
	};

	const handleColumnMouseDown = (columnIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		setDragStart({ type: 'column', index: columnIndex });
		
		// Select entire column using the new range selection
		setSelection({
			selectedRange: SelectionUtils.createColumnSelection(columnIndex, data.rows.length),
			focusedCell: null,
			editingCell: null,
			anchorCell: { row: 0, col: columnIndex }
		});
	};

	const handleColumnMouseEnter = (columnIndex: number, event?: React.MouseEvent) => {
		// Check if mouse button is actually pressed down
		const isActuallyMouseDown = event?.buttons === 1;
		
		// If no mouse button is pressed, clear drag state immediately
		if (!isActuallyMouseDown && (isMouseDown || isDragging || dragStart)) {
			setIsMouseDown(false);
			setIsDragging(false);
			setDragStart(null);
			return;
		}
		
		// Only handle drag selection if mouse is currently down and we have a drag start
		if (isActuallyMouseDown && dragStart?.type === 'column' && dragStart.index !== undefined) {
			// Start dragging if we haven't already and we moved to a different column
			if (!isDragging && columnIndex !== dragStart.index) {
				setIsDragging(true);
			}
			
			if (isDragging || columnIndex !== dragStart.index) {
				const startIndex = dragStart.index;
				const endIndex = columnIndex;
				const minIndex = Math.min(startIndex, endIndex);
				const maxIndex = Math.max(startIndex, endIndex);
				
				// Select column range using the new range selection
				setSelection({
					selectedRange: {
						startRow: 0,
						endRow: data.rows.length - 1,
						startColumn: minIndex,
						endColumn: maxIndex
					},
					focusedCell: null,
					editingCell: null,
					anchorCell: { row: 0, col: dragStart.index }
				});
			}
		}
	};

	const handleCellMouseDown = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		
		const cellPos = { row: rowIndex, col: colIndex };
		setIsMouseDown(true);
		setDragStart({ type: 'cell', cellPos });
		// Don't immediately set selection - let the cell handle it via EditableCell
	};

	const handleCellMouseEnter = (rowIndex: number, colIndex: number, event?: React.MouseEvent) => {
		// Always update hover state for row/column highlighting
		setHoveredCell({ row: rowIndex, col: colIndex });
		
		// Check if mouse button is actually pressed down
		const isActuallyMouseDown = event?.buttons === 1;
		
		// If no mouse button is pressed, clear drag state immediately
		if (!isActuallyMouseDown && (isMouseDown || isDragging || dragStart)) {
			setIsMouseDown(false);
			setIsDragging(false);
			setDragStart(null);
			return;
		}
		
		// Only handle drag selection if mouse is currently down and we have a drag start
		if (isActuallyMouseDown && isMouseDown && dragStart?.type === 'cell' && dragStart.cellPos) {
			const currentCellKey = `${rowIndex},${colIndex}`;
			const startCellKey = `${dragStart.cellPos.row},${dragStart.cellPos.col}`;
			
			// Start dragging if we've moved to a different cell while mouse is down
			if (!isDragging && currentCellKey !== startCellKey) {
				setIsDragging(true);
			}
			
			if (isDragging || currentCellKey !== startCellKey) {
				// Calculate rectangle selection using the new range format
				const startRow = dragStart.cellPos.row;
				const startCol = dragStart.cellPos.col;
				const endRow = rowIndex;
				const endCol = colIndex;
				
				setSelection({
					selectedRange: SelectionUtils.createRangeSelection(startRow, startCol, endRow, endCol),
					focusedCell: null,
					editingCell: null,
					anchorCell: { row: startRow, col: startCol }
				});
			}
		}
	};

	const handleMouseUp = () => {
		setIsMouseDown(false);
		setIsDragging(false);
		setDragStart(null);
		isMouseOutsideViewRef.current = false;
		lastMouseEventRef.current = null;
		stopAutoScrolling(); // Stop auto-scrolling when drag ends
	};

	const handleMouseLeave = () => {
		setHoveredCell(null);
	};

	const clearSelection = () => {
		setSelection({
			selectedRange: null,
			focusedCell: null,
			editingCell: null,
			anchorCell: null
		});
	};

	const selectAll = () => {
		setSelection({
			selectedRange: SelectionUtils.createAllSelection(data.rows.length, data.columns.length),
			focusedCell: null,
			editingCell: null,
			anchorCell: { row: 0, col: 0 }
		});
	};

	// Helper function to get the top-left cell of the current selection
	const getTopLeftSelectionCell = (): CellPosition | null => {
		// If there's a focused cell, use that
		if (selection.focusedCell) {
			return selection.focusedCell;
		}
		
		// If there's a selected range, return the top-left corner
		if (selection.selectedRange) {
			return { 
				row: selection.selectedRange.startRow, 
				col: selection.selectedRange.startColumn 
			};
		}
		
		return null;
	};

	// Helper function to scroll to a specific cell
	const scrollToCell = (row: number, col: number) => {
		if (!gridBodyRef.current?.scrollToCell) {
			return;
		}
		
		gridBodyRef.current.scrollToCell(row, col);
	};

	// Simple auto-scroll for drag operations - just controls scroll speed
	const startAutoScrolling = () => {
		if (autoScrollTimerRef.current) return; // Already scrolling
		
		const scrollInterval = 16; // ~60fps
		
		const timer = setInterval(() => {
			if (!isDraggingRef.current || !isMouseOutsideViewRef.current) {
				// Clear the timer immediately from within the timer callback
				clearInterval(timer);
				autoScrollTimerRef.current = null;
				return;
			}
			// Trigger scrolling with the last known mouse position
			if (lastMouseEventRef.current) {
				continueDragSelection(lastMouseEventRef.current);
			}
		}, scrollInterval);

		autoScrollTimerRef.current = timer as unknown as number;
	};

	const stopAutoScrolling = () => {
		if (autoScrollTimerRef.current) {
			clearInterval(autoScrollTimerRef.current);
			autoScrollTimerRef.current = null;
		}
	};

	// Filter handlers
	const handleFilterToggle = (columnIndex: number, position: { x: number; y: number }) => {
		if (!dataExplorerService) return;
		
		if (filterDropdown.isOpen && filterDropdown.columnIndex === columnIndex) {
			// Close if same column clicked
			setFilterDropdown(prev => ({ ...prev, isOpen: false }));
			return;
		}
		
		// Get unique values for this column
		const availableValues = dataExplorerService.getUniqueValuesForColumn(columnIndex);
		
		// Get current filter state for this column
		const filterState = dataExplorerService.getFilterState();
		const columnFilter = filterState?.columnFilters.get(columnIndex);
		const selectedValues = columnFilter?.selectedValues || new Set(availableValues);
		
		setFilterDropdown({
			isOpen: true,
			columnIndex,
			searchTerm: '',
			availableValues,
			selectedValues: new Set(selectedValues),
			position
		});
	};

	const handleFilterSelectionChange = (selectedValues: Set<string>) => {
		setFilterDropdown(prev => ({
			...prev,
			selectedValues
		}));
	};

	const handleFilterApply = (selectedValues: Set<string>) => {
		if (!dataExplorerService || filterDropdown.columnIndex < 0) return;
		
		if (selectedValues.size === 0) {
			// No values selected - remove filter
			dataExplorerService.removeColumnFilter(filterDropdown.columnIndex);
		} else if (selectedValues.size === filterDropdown.availableValues.length) {
			// All values selected - remove filter
			dataExplorerService.removeColumnFilter(filterDropdown.columnIndex);
		} else {
			// Apply filter with selected values
			dataExplorerService.setColumnFilter(
				filterDropdown.columnIndex,
				selectedValues,
				filterDropdown.searchTerm
			);
		}
		
		// Don't close automatically since filters apply immediately and user might want to adjust
	};

	const handleFilterClose = () => {
		setFilterDropdown(prev => ({ ...prev, isOpen: false }));
	};

	const handleFilterClear = () => {
		if (!dataExplorerService || filterDropdown.columnIndex < 0) return;
		dataExplorerService.removeColumnFilter(filterDropdown.columnIndex);
	};

	const isColumnFiltered = (columnIndex: number): boolean => {
		if (!dataExplorerService) return false;
		return dataExplorerService.isColumnFiltered(columnIndex);
	};

	// Continue drag selection based on current mouse position
	const continueDragSelection = (event: MouseEvent) => {
		if (!isDragging || !dragStart?.cellPos || !containerRef.current) return;

		const container = containerRef.current;
		const scrollableContainer = container.querySelector('.scrollable-data-area') || container;
		const rect = scrollableContainer.getBoundingClientRect();
		
		// If mouse is outside the view, scroll towards it and extend selection
		const mouseX = event.clientX;
		const mouseY = event.clientY;
		
		if (isMouseOutsideViewRef.current) {
			// Scroll towards the mouse position
			const scrollSpeed = 20;
			const edgeThreshold = 20;
			
			// Calculate relative position within container
			const relativeMouseX = mouseX - rect.left;
			const relativeMouseY = mouseY - rect.top;
			
			// Scroll horizontally
			if ((relativeMouseX < 0 || relativeMouseX < edgeThreshold) && scrollableContainer.scrollLeft > 0) {
				scrollableContainer.scrollLeft = Math.max(0, scrollableContainer.scrollLeft - scrollSpeed);
			} else if ((relativeMouseX > rect.width || relativeMouseX > rect.width - edgeThreshold) && scrollableContainer.scrollLeft < scrollableContainer.scrollWidth - scrollableContainer.clientWidth) {
				scrollableContainer.scrollLeft = Math.min(scrollableContainer.scrollWidth - scrollableContainer.clientWidth, scrollableContainer.scrollLeft + scrollSpeed);
			}
			
			// Scroll vertically
			if ((relativeMouseY < 0 || relativeMouseY < edgeThreshold) && scrollableContainer.scrollTop > 0) {
				scrollableContainer.scrollTop = Math.max(0, scrollableContainer.scrollTop - scrollSpeed);
			} else if ((relativeMouseY > rect.height || relativeMouseY > rect.height - edgeThreshold) && scrollableContainer.scrollTop < scrollableContainer.scrollHeight - scrollableContainer.clientHeight) {
				scrollableContainer.scrollTop = Math.min(scrollableContainer.scrollHeight - scrollableContainer.clientHeight, scrollableContainer.scrollTop + scrollSpeed);
			}
		}
		
		// Calculate mouse position relative to the container content (accounting for scroll)
		const relativeMouseX = event.clientX - rect.left + scrollableContainer.scrollLeft;
		const relativeMouseY = event.clientY - rect.top + scrollableContainer.scrollTop;

		// Find the cell at the current mouse position
		let targetRow = -1;
		let targetCol = -1;

		// Calculate target row based on Y position
		let currentY = 0;
		for (let i = 0; i < data.rows.length; i++) {
			const rowHeight = getRowHeight ? getRowHeight(i) : 24;
			if (relativeMouseY >= currentY && relativeMouseY < currentY + rowHeight) {
				targetRow = i;
				break;
			}
			currentY += rowHeight;
		}

		// Calculate target column based on X position  
		// Note: relativeMouseX is already relative to the scrollable-data-area which excludes row numbers
		let currentX = 0; // Start from 0 since we're working within the data area only
		for (let i = 0; i < data.columns.length; i++) {
			const colWidth = getColumnWidth ? getColumnWidth(i) : (data.columns[i]?.width || 100);
			if (relativeMouseX >= currentX && relativeMouseX < currentX + colWidth) {
				targetCol = i;
				break;
			}
			currentX += colWidth;
		}

		// If we found a valid cell, update the selection
		if (targetRow >= 0 && targetCol >= 0) {
			const startRow = dragStart.cellPos.row;
			const startCol = dragStart.cellPos.col;
			
			setSelection({
				selectedRange: SelectionUtils.createRangeSelection(startRow, startCol, targetRow, targetCol),
				focusedCell: null,
				editingCell: null,
				anchorCell: { row: startRow, col: startCol }
			});
		}
	};

	// Check if mouse is near edges or outside the scrollable view area
	const updateMouseOutsideState = (event: MouseEvent) => {
		if (!isDragging || !containerRef.current) return;

		const container = containerRef.current;
		const scrollableContainer = container.querySelector('.scrollable-data-area') || container;
		const rect = scrollableContainer.getBoundingClientRect();
		
		const edgeThreshold = 20; // pixels from edge to trigger auto-scroll
		
		// Calculate relative mouse position within the container
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		
		// Check if mouse is near edges or outside the container
		const isNearEdgeOrOutside = (
			mouseX < 0 || mouseX < edgeThreshold ||  // Left edge or outside left
			mouseX > rect.width || mouseX > rect.width - edgeThreshold ||  // Right edge or outside right
			mouseY < 0 || mouseY < edgeThreshold ||  // Top edge or outside top
			mouseY > rect.height || mouseY > rect.height - edgeThreshold  // Bottom edge or outside bottom
		);
		
		// Update ref
		isMouseOutsideViewRef.current = isNearEdgeOrOutside;
		
		// Start or stop auto-scrolling based on whether mouse is near edge or outside
		if (isNearEdgeOrOutside && !autoScrollTimerRef.current) {
			startAutoScrolling();
		} else if (!isNearEdgeOrOutside && autoScrollTimerRef.current) {
			stopAutoScrolling();
		}
	};

	// Helper function to navigate to a new cell with arrow keys
	const navigateToCell = (newRow: number, newCol: number) => {
		// Ensure the new position is within bounds
		const clampedRow = Math.max(0, Math.min(newRow, data.rows.length - 1));
		const clampedCol = Math.max(0, Math.min(newCol, data.columns.length - 1));
		
		// Set single cell selection (clear multi-cell selection)
		setSelection({
			selectedRange: SelectionUtils.createSingleCellSelection(clampedRow, clampedCol),
			focusedCell: { row: clampedRow, col: clampedCol },
			editingCell: null,
			anchorCell: { row: clampedRow, col: clampedCol }
		});
		
		// Scroll to make the new cell visible
		scrollToCell(clampedRow, clampedCol);
	};



	// Helper function to get cell positions from current selection
	const getCellPositionsFromSelection = (): Array<{row: number, col: number}> => {
		const cellPositions: Array<{row: number, col: number}> = [];
		
		// Collect all cell positions from selected range
		if (selection.selectedRange) {
			const cells = SelectionUtils.getCellsInSelection(selection.selectedRange);
			cells.forEach(({ row, col }) => {
				if (row < data.rows.length && col < data.columns.length) {
					cellPositions.push({ row, col });
				}
			});
		}
		
		// Add focused cell if any
		if (selection.focusedCell) {
			const { row, col } = selection.focusedCell;
			if (row < data.rows.length && col < data.columns.length) {
				cellPositions.push({ row, col });
			}
		}
		
		return cellPositions;
	};

	// Helper function to get source range from current selection
	const getSourceRangeFromSelection = (): {startRow: number, endRow: number, startColumn: number, endColumn: number} | null => {
		if (selection.selectedRange) {
			return {
				startRow: selection.selectedRange.startRow,
				endRow: selection.selectedRange.endRow,
				startColumn: selection.selectedRange.startColumn,
				endColumn: selection.selectedRange.endColumn
			};
		}
		
		if (selection.focusedCell) {
			return {
				startRow: selection.focusedCell.row,
				endRow: selection.focusedCell.row,
				startColumn: selection.focusedCell.col,
				endColumn: selection.focusedCell.col
			};
		}
		
		return null;
	};

	// Copy selection to clipboard
	const copySelection = () => {
		if (!dataExplorerService) {
			return;
		}

		const cellPositions = getCellPositionsFromSelection();
		const sourceRange = getSourceRangeFromSelection();
		
		if (cellPositions.length > 0 && sourceRange) {
			try {
				// Clear any previous clipboard visual feedback
				setClipboardRange(null);
				
				dataExplorerService.copyWithHistory(cellPositions, sourceRange);
				// Set visual feedback for copied cells
				setClipboardRange({
					startRow: sourceRange.startRow,
					endRow: sourceRange.endRow,
					startColumn: sourceRange.startColumn,
					endColumn: sourceRange.endColumn,
					operation: 'copy'
				});
			} catch (error) {
				console.error('Failed to copy cells:', error);
			}
		}
	};

	// Cut selection to clipboard
	const cutSelection = () => {
		if (!dataExplorerService) {
			return;
		}

		const cellPositions = getCellPositionsFromSelection();
		const sourceRange = getSourceRangeFromSelection();
		
		if (cellPositions.length > 0 && sourceRange) {
			try {
				// Clear any previous clipboard visual feedback
				setClipboardRange(null);
				
				// Use the proper cut command with history
				dataExplorerService.cutWithHistory(cellPositions, sourceRange);
				
				// Set visual feedback for cut cells
				setClipboardRange({
					startRow: sourceRange.startRow,
					endRow: sourceRange.endRow,
					startColumn: sourceRange.startColumn,
					endColumn: sourceRange.endColumn,
					operation: 'cut'
				});
			} catch (error) {
				console.error('Failed to cut cells:', error);
			}
		}
	};

	// Paste from clipboard to current selection
	const pasteSelection = () => {
		if (!dataExplorerService) {
			return;
		}

		// Check if there's data to paste
		if (!dataExplorerService.canPaste()) {
			return;
		}

		// Get the top-left cell of current selection as paste target
		const targetCell = getTopLeftSelectionCell();
		if (!targetCell) {
			return;
		}

		try {
			// The service now handles cut-paste compound operations automatically
			dataExplorerService.pasteWithHistory(targetCell.row, targetCell.col);
			
			// Clear visual feedback after paste
			setClipboardRange(null);
		} catch (error) {
			console.error('Failed to paste cells:', error);
		}
	};

	const deleteSelectedDataWithHistory = () => {
		if (!dataExplorerService) {
			console.error('Cannot delete cells: dataExplorerService is required for history tracking');
			return;
		}
		
		const cellPositions: Array<{row: number, col: number}> = [];
		
		// Collect all cell positions to delete from selected range
		if (selection.selectedRange) {
			const cells = SelectionUtils.getCellsInSelection(selection.selectedRange);
			cells.forEach(({ row, col }) => {
				if (row < data.rows.length && col < data.columns.length) {
					cellPositions.push({ row, col });
				}
			});
		}
		
		// Add focused cell if any
		if (selection.focusedCell) {
			const { row, col } = selection.focusedCell;
			if (row < data.rows.length && col < data.columns.length) {
				cellPositions.push({ row, col });
			}
		}
		
		// Use the service method with history tracking
		if (cellPositions.length > 0) {
			try {
				dataExplorerService.deleteCellsWithHistory(cellPositions);
				clearSelection();
			} catch (error) {
				console.error('Failed to delete cells:', error);
			}
		}
	};

	// Keyboard event handler
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			// Skip if we're in an input field (cell editing)
			const target = event.target as HTMLElement;
			const isInInput = target.tagName?.toLowerCase() === 'input' || 
							 target.tagName?.toLowerCase() === 'textarea' || 
							 target.isContentEditable;
			
			// If any cell is being edited, don't handle grid-level shortcuts
			if (editingState.isAnyEditing || isInInput) {
				return; // Let the input handle its own events
			}
			
			// For arrow keys, be aggressive about handling them for the data explorer
			// Only skip if we're clearly in a different context (like a different input field)
			const isInDifferentContext = target.closest('.monaco-editor') !== null ||
										target.closest('.suggest-widget') !== null ||
										target.closest('.context-view') !== null ||
										(target.tagName?.toLowerCase() === 'input' && !containerRef.current?.contains(target)) ||
										(target.tagName?.toLowerCase() === 'textarea' && !containerRef.current?.contains(target));
			
			if (isInDifferentContext) {
				return;
			}
			
			// Handle arrow key navigation
			if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
				event.preventDefault();
				
				// Get current selection for navigation
				let currentCell = getTopLeftSelectionCell();
				
				// If no cell is currently selected, start with cell (0,0)
				if (!currentCell && data.rows.length > 0 && data.columns.length > 0) {
					navigateToCell(0, 0);
					return;
				}
				
				if (!currentCell) {
					return; // No data to navigate
				}
				let newRow = currentCell.row;
				let newCol = currentCell.col;
				
				switch (event.key) {
					case 'ArrowUp':
						newRow = currentCell.row - 1;
						break;
					case 'ArrowDown':
						newRow = currentCell.row + 1;
						break;
					case 'ArrowLeft':
						newCol = currentCell.col - 1;
						break;
					case 'ArrowRight':
						newCol = currentCell.col + 1;
						break;
				}
				
				// Navigate to the new cell if it's within bounds
				if (newRow >= 0 && newRow < data.rows.length && 
					newCol >= 0 && newCol < data.columns.length) {
					
					if (event.shiftKey && selection.anchorCell) {
						// Extend selection when Shift is held, using anchor cell as fixed corner
						const anchor = selection.anchorCell;
						const extendedRange = {
							startRow: Math.min(anchor.row, newRow),
							endRow: Math.max(anchor.row, newRow),
							startColumn: Math.min(anchor.col, newCol),
							endColumn: Math.max(anchor.col, newCol)
						};
						
						setSelection(prev => ({
							...prev,
							selectedRange: extendedRange,
							focusedCell: { row: newRow, col: newCol }
						}));
						
						// Scroll to make the new focused cell visible
						scrollToCell(newRow, newCol);
					} else {
						// Normal navigation (single cell selection)
						navigateToCell(newRow, newCol);
					}
				}
			}
			
			// Handle typing to start editing and replace content
			if (selection.focusedCell && !event.ctrlKey && !event.metaKey && !event.altKey) {
				// Check if it's a printable character or special editing keys
				const isPrintableChar = event.key.length === 1 && !event.ctrlKey && !event.metaKey;
				const isEditingKey = ['Delete', 'Backspace', 'F2'].includes(event.key);
				
				if (isPrintableChar || isEditingKey) {
					const { row, col } = selection.focusedCell;
					
					// Start editing
					startCellEdit(row, col);
					
					// If it's a printable character, we'll replace the content
					// The actual replacement will be handled by the editor
					if (isPrintableChar) {
						// Set a flag to indicate we should replace content
						// This will be picked up by the CellEditor
						const editEvent = new CustomEvent('startEditWithReplace', {
							detail: { character: event.key }
						});
						setTimeout(() => {
							document.dispatchEvent(editEvent);
						}, 0);
						event.preventDefault();
						return;
					}
					
					// For Delete/Backspace/F2, just start editing without replacement
					if (isEditingKey && event.key !== 'Delete' && event.key !== 'Backspace') {
						event.preventDefault();
						return;
					}
				}
			}
			
			// Handle other grid-level operations when not editing
			if (selection.selectedRange || selection.focusedCell) {
				if (event.key === 'Delete' || event.key === 'Backspace') {
					// If we have a multi-cell selection or no focused cell, delete the selection
					if (selection.selectedRange && !(selection.selectedRange.startRow === selection.selectedRange.endRow && 
						selection.selectedRange.startColumn === selection.selectedRange.endColumn)) {
						event.preventDefault();
						deleteSelectedDataWithHistory();
					}
					// For single focused cell, let the editing logic above handle it
				}
				
				// Handle clipboard operations
				if ((event.ctrlKey || event.metaKey)) {
					if (event.key === 'c' || event.key === 'C') {
						event.preventDefault();
						copySelection();
					} else if (event.key === 'x' || event.key === 'X') {
						event.preventDefault();
						cutSelection();
					} else if (event.key === 'v' || event.key === 'V') {
						event.preventDefault();
						pasteSelection();
					}
				}
				
				// Handle escape key to clear clipboard visual feedback
				if (event.key === 'Escape') {
					if (clipboardRange) {
						event.preventDefault();
						setClipboardRange(null);
					}
				}
			}
		};

		// Add the keyboard event listener to document to catch events even when focus isn't perfect
		document.addEventListener('keydown', handleKeyDown);
		
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [selection, editingState, data, onDataChange, dataExplorerService]);



	// Focus management - focus the container on mount and on click
	useEffect(() => {
		const container = containerRef.current;
		if (container) {
			// Focus the container so it can receive keyboard events
			container.focus();
		}
		
		// Initialize with first cell selected if no selection exists
		if (data.rows.length > 0 && data.columns.length > 0 && 
			!selection.focusedCell && !selection.selectedRange) {
			navigateToCell(0, 0);
		}
	}, [data.rows.length, data.columns.length]);

	const handleContainerClick = () => {
		const container = containerRef.current;
		if (container) {
			container.focus();
		}
		
		// If no cell is selected, select the first cell
		if (!selection.focusedCell && !selection.selectedRange && 
			data.rows.length > 0 && data.columns.length > 0) {
			navigateToCell(0, 0);
		}
	};

	// Global mouse up handler for drag selection and resizing
	useEffect(() => {
		const handleGlobalMouseUp = () => {
			if (isDragging) {
				handleMouseUp();
			}
			if (isResizing) {
				handleResizeEnd();
			}
		};

		const handleGlobalMouseMove = (event: MouseEvent) => {
			if (isResizing) {
				handleResizeMove(event);
			}
			// Handle drag operations
			if (isDragging) {
				lastMouseEventRef.current = event;
				updateMouseOutsideState(event);
				continueDragSelection(event);
			}
		};

		if (isDragging || isResizing) {
			document.addEventListener('mouseup', handleGlobalMouseUp);
			document.addEventListener('mouseleave', handleGlobalMouseUp);
			document.addEventListener('mousemove', handleGlobalMouseMove);
			return () => {
				document.removeEventListener('mouseup', handleGlobalMouseUp);
				document.removeEventListener('mouseleave', handleGlobalMouseUp);
				document.removeEventListener('mousemove', handleGlobalMouseMove);
			};
		}
		
		return undefined;
	}, [isDragging, isResizing]);

	// Cleanup auto-scroll timer on unmount
	useEffect(() => {
		return () => {
			if (autoScrollTimerRef.current) {
				clearInterval(autoScrollTimerRef.current);
			}
		};
	}, []);

	// Text wrapping functionality
	// TODO: Clean this up, this is often wrong
	const calculateRequiredHeight = (text: string, width: number): number => {
		const testString = String(text || '');
		
		// Get current font size for proper height calculation
		const container = containerRef.current;
		let baseFontSize = 13;
		if (container) {
			const computedStyle = getComputedStyle(container);
			const fontSize = parseFloat(computedStyle.fontSize);
			if (!isNaN(fontSize)) {
				baseFontSize = fontSize;
			}
		}
		
		const defaultHeight = Math.max(20, baseFontSize + 10);
		if (!testString.trim()) return defaultHeight;
		
		// Find an existing cell to get the starting height and copy styles from
		const existingCell = containerRef.current?.querySelector('.grid-cell');
		const existingCellContent = containerRef.current?.querySelector('.cell-content');
		
		if (!existingCell || !existingCellContent) {
			const lineHeight = baseFontSize * 1.2;
			const estimatedCharsPerLine = Math.floor(width / (baseFontSize * 0.6));
			const lines = Math.ceil(testString.length / estimatedCharsPerLine);
			return Math.max(defaultHeight, lines * lineHeight);
		}
		
		// Get the starting height of the actual grid cell (includes all overhead like borders, etc.)
		const startingCellHeight = existingCell.getBoundingClientRect().height;
		
		// Copy all relevant font and text properties from real cell content
		const cellContentStyles = getComputedStyle(existingCellContent);
		
		// Get the line height
		const lineHeight = parseFloat(cellContentStyles.lineHeight) || parseFloat(cellContentStyles.fontSize) * 1.2;
		
		// Get the actual dimensions of the cell content to replicate exactly
		const cellContentRect = existingCellContent.getBoundingClientRect();
		const actualContentWidth = cellContentRect.width;
		
		// Measure how many lines the text will wrap to using EXACT cell content dimensions
		const wrappedDiv = document.createElement('div');
		wrappedDiv.style.position = 'absolute';
		wrappedDiv.style.visibility = 'hidden';
		wrappedDiv.style.left = '-9999px';
		wrappedDiv.style.top = '-9999px';
		wrappedDiv.style.width = `${actualContentWidth}px`; // Use actual content width, not parameter
		wrappedDiv.style.whiteSpace = 'pre-wrap';
		wrappedDiv.style.wordWrap = 'break-word';
		wrappedDiv.style.overflowWrap = 'break-word';
		
		// Copy only the text/font-related styles that affect text measurement (excluding padding)
		const stylesToCopy = [
			'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
			'wordSpacing', 'textAlign', 'textIndent', 'textTransform',
			'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom',
			'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth',
			'boxSizing'
		];
		
		stylesToCopy.forEach(prop => {
			const value = cellContentStyles.getPropertyValue(prop);
			if (value) {
				wrappedDiv.style.setProperty(prop, value);
			}
		});
		
		// Set the properties needed for wrapping measurement (and ensure they override any copied values)
		wrappedDiv.style.whiteSpace = 'pre-wrap';
		wrappedDiv.style.wordWrap = 'break-word';
		wrappedDiv.style.overflowWrap = 'break-word';
		wrappedDiv.style.overflow = 'visible';
		wrappedDiv.style.padding = '0';
		
		wrappedDiv.textContent = testString;
		document.body.appendChild(wrappedDiv);
		const wrappedHeight = wrappedDiv.offsetHeight;
		document.body.removeChild(wrappedDiv);
		
		// Calculate number of lines the text will wrap to
		const newLines = Math.round(wrappedHeight / lineHeight);
		
		// Calculate the overhead (cell height minus 1 line height)
		const overhead = startingCellHeight - lineHeight;
		
		// Final height = new lines × line height + overhead
		const finalHeight = Math.round(newLines * lineHeight + overhead);
		
		return Math.max(defaultHeight, finalHeight);
	};

	const wrapTextInSelection = () => {
		let cellsToWrap: Array<{row: number, col: number}> = [];
		
		// Handle different selection types
		if (selection.selectedRange) {
			// Multi-cell selection
			for (let row = selection.selectedRange.startRow; row <= selection.selectedRange.endRow; row++) {
				for (let col = selection.selectedRange.startColumn; col <= selection.selectedRange.endColumn; col++) {
					if (row < data.rows.length && col < data.columns.length) {
						cellsToWrap.push({row, col});
					}
				}
			}
		} else if (selection.focusedCell) {
			// Single cell selection
			const {row, col} = selection.focusedCell;
			if (row < data.rows.length && col < data.columns.length) {
				cellsToWrap.push({row, col});
			}
		} else {
			return;
		}
		
		if (cellsToWrap.length === 0) {
			return;
		}
		
		const newRowHeights = new Map(rowHeights);
		let hasChanges = false;
		
		// Group cells by row to calculate max height per row
		const rowCells = new Map<number, Array<{row: number, col: number}>>();
		cellsToWrap.forEach(cell => {
			if (!rowCells.has(cell.row)) {
				rowCells.set(cell.row, []);
			}
			rowCells.get(cell.row)!.push(cell);
		});
		
		// Get current default height for comparison
		const container = containerRef.current;
		let baseFontSize = 13;
		if (container) {
			const computedStyle = getComputedStyle(container);
			const fontSize = parseFloat(computedStyle.fontSize);
			if (!isNaN(fontSize)) {
				baseFontSize = fontSize;
			}
		}
		const defaultHeight = Math.max(20, baseFontSize + 10);
		
		// Check if any of the selected rows are already wrapped (height > default)
		const hasWrappedRows = Array.from(rowCells.keys()).some(row => getRowHeight(row) > defaultHeight);
		
		if (hasWrappedRows) {
			// Toggle off - reset all selected rows to default height
			rowCells.forEach((cells, row) => {
				const currentHeight = getRowHeight(row);
				if (currentHeight > defaultHeight) {
					newRowHeights.set(row, defaultHeight);
					hasChanges = true;
				}
			});
		} else {
			// Toggle on - calculate required heights for each row
			rowCells.forEach((cells, row) => {
				let maxHeightForRow = defaultHeight; // Use current default height
				
				// Check all cells in this row to find max required height
				cells.forEach(({col}) => {
					const cellValue = data.rows[row][col];
					const columnWidth = getColumnWidth(col);
					
					const requiredHeight = calculateRequiredHeight(cellValue, columnWidth);
					maxHeightForRow = Math.max(maxHeightForRow, requiredHeight);
				});
				
				// Only update if height has changed
				const currentHeight = getRowHeight(row);
				if (maxHeightForRow !== currentHeight) {
					newRowHeights.set(row, maxHeightForRow);
					hasChanges = true;
				}
			});
		}
		
		if (hasChanges) {
			setRowHeights(newRowHeights);
		}
	};

	// Expose methods to parent component
	useImperativeHandle(ref, () => ({
		wrapTextInSelection,
		// IDataGridFindTarget implementation
		getCellValue: (row: number, column: number): any => {
			if (!data || row < 0 || row >= data.rows.length || column < 0 || column >= data.columns.length) {
				return null;
			}
			return data.rows[row]?.[column] ?? null;
		},
		setCellValue: (row: number, column: number, value: any): void => {
			if (!data || row < 0 || row >= data.rows.length || column < 0 || column >= data.columns.length) {
				return;
			}
			const oldValue = data.rows[row]?.[column] ?? null;
			if (onCellChange) {
				onCellChange(row, column, value);
			}
			onDataChangedEmitter.current.fire({ row, column, oldValue, newValue: value });
		},
		getRowCount: (): number => data?.rows.length ?? 0,
		getColumnCount: (): number => data?.columns.length ?? 0,
		getSelectedCells: (): DataGridCell[] => {
			const cells: DataGridCell[] = [];
			if (selection.selectedRange) {
				const range = selection.selectedRange;
				for (let row = range.startRow; row <= range.endRow; row++) {
					for (let col = range.startColumn; col <= range.endColumn; col++) {
						if (data && row < data.rows.length && col < data.columns.length) {
							cells.push({
								row,
								column: col,
								value: data.rows[row]?.[col] ?? null
							});
						}
					}
				}
			}
			return cells;
		},
		highlightMatches: (matches: DataGridMatch[]): void => {
			setFindMatches(matches);
		},
		clearHighlights: (): void => {
			setFindMatches([]);
		},
		scrollToCell: (row: number, column: number): void => {
			scrollToCell(row, column);
		},
		selectCell: (row: number, column: number): void => {
			setSelection(prev => ({
				...prev,
				focusedCell: { row, col: column },
				selectedRange: SelectionUtils.createSingleCellSelection(row, column),
				anchorCell: { row, col: column }
			}));
		},
		selectAll: (): void => {
			if (!data) return;
			const maxRows = data.rows.length;
			const maxColumns = data.columns.length;
			
			if (maxRows > 0 && maxColumns > 0) {
				setSelection(prev => ({
					...prev,
					focusedCell: { row: 0, col: 0 },
					selectedRange: SelectionUtils.createAllSelection(maxRows, maxColumns),
					anchorCell: { row: 0, col: 0 }
				}));
			}
		},
		onDataChanged: onDataChangedEmitter.current.event
	}), [wrapTextInSelection, data, selection, onCellChange]);

	const getGridClassName = () => {
		let className = 'data-grid';
		if (isResizing) {
			className += ' resizing';
			if (resizingColumnIndex !== null) {
				className += ' resizing-column';
			}
			if (resizingRowIndex !== null) {
				className += ' resizing-row';
			}
		}
		return className;
	};

	return (
		<div 
			ref={containerRef}
			className={getGridClassName()}
			tabIndex={0}
			onMouseLeave={handleMouseLeave}
			onClick={handleContainerClick}
		>
			<VirtualGridBody 
				ref={gridBodyRef}
				data={data} 
				onCellChange={onCellChange}
				onRowMouseDown={handleRowMouseDown}
				onRowMouseEnter={handleRowMouseEnter}
				onCellMouseDown={handleCellMouseDown}
				onCellMouseEnter={handleCellMouseEnter}
				selection={selection}
				setSelection={setSelection}
				hoveredCell={hoveredCell}
				getColumnWidth={getColumnWidth}
				getRowHeight={getRowHeight}
				onRowResizeStart={handleRowResizeStart}
				onRowResizeDoubleClick={handleRowResizeDoubleClick}
				resizingRowIndex={resizingRowIndex}
				resizingColumnIndex={resizingColumnIndex}
				resizingRows={isResizing && resizingRowIndex !== null && selection.selectedRange && 
					selection.selectedRange.startColumn === 0 && selection.selectedRange.endColumn === data.columns.length - 1 
					? new Set(Array.from({length: selection.selectedRange.endRow - selection.selectedRange.startRow + 1}, (_, i) => selection.selectedRange!.startRow + i))
					: new Set()}
				resizingColumns={isResizing && resizingColumnIndex !== null && selection.selectedRange && 
					selection.selectedRange.startRow === 0 && selection.selectedRange.endRow === data.rows.length - 1 
					? new Set(Array.from({length: selection.selectedRange.endColumn - selection.selectedRange.startColumn + 1}, (_, i) => selection.selectedRange!.startColumn + i))
					: new Set()}
				editingState={editingState}
				onEditStart={startCellEdit}
				onEditEnd={endCellEdit}
				columns={data.columns}
				onSort={onColumnSort}
				onColumnMouseDown={handleColumnMouseDown}
				onColumnMouseEnter={handleColumnMouseEnter}
				onSelectAll={selectAll}
				sortKeys={sortKeys}
				onColumnResizeStart={handleColumnResizeStart}
				onColumnResizeDoubleClick={handleColumnResizeDoubleClick}
				dataExplorerService={dataExplorerService}
				freezeState={freezeState}
				onFreezeRow={freezeRow}
				onUnfreezeRow={unfreezeRow}
				onFreezeColumn={freezeColumn}
				onUnfreezeColumn={unfreezeColumn}
				onUnfreezeAllRows={unfreezeAllRows}
				onUnfreezeAllColumns={unfreezeAllColumns}
				onUnfreezePanes={unfreezePanes}
				clipboardRange={clipboardRange}
				findMatches={findMatches}
				onFilterToggle={handleFilterToggle}
				isColumnFiltered={isColumnFiltered}
			/>
			
			{/* Filter dropdown */}
			<FilterDropdown
				isOpen={filterDropdown.isOpen}
				columnIndex={filterDropdown.columnIndex}
				availableValues={filterDropdown.availableValues}
				selectedValues={filterDropdown.selectedValues}
				position={filterDropdown.position}
				onSelectionChange={handleFilterSelectionChange}
				onClose={handleFilterClose}
				onApply={handleFilterApply}
				onClearFilter={handleFilterClear}
			/>
		</div>
	);
});