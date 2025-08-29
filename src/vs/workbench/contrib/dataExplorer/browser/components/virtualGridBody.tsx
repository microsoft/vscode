/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useMemo, useRef, useLayoutEffect, useState } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { EditableCell } from './editableCell.js';
import { useEditState } from '../hooks/useEditState.js';
import { ViewportCalculator } from '../../../../services/dataExplorer/browser/viewportCalculator.js';

interface VirtualGridBodyProps {
	data: GridData;
	onCellChange?: (row: number, col: number, value: any) => void;
	onRowMouseDown?: (index: number, event: React.MouseEvent) => void;
	onRowMouseEnter?: (index: number) => void;
	onCellMouseDown?: (row: number, col: number, event: React.MouseEvent) => void;
	onCellMouseEnter?: (row: number, col: number) => void;
	selectedRows?: Set<number>;
	selectedColumns?: Set<number>;
	selectedCells?: Set<string>;
	hoveredCell?: {row: number, col: number} | null;
}

const ROW_HEIGHT = 24;
const ROW_NUMBER_WIDTH = 60;

export const VirtualGridBody: React.FC<VirtualGridBodyProps> = ({ 
	data, 
	onCellChange, 
	onRowMouseDown, 
	onRowMouseEnter, 
	onCellMouseDown, 
	onCellMouseEnter, 
	selectedRows = new Set(), 
	selectedColumns = new Set(), 
	selectedCells = new Set(),
	hoveredCell = null
}) => {
	const { editState, startEdit, commitEdit, cancelEdit } = useEditState();
	const containerRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [containerHeight, setContainerHeight] = useState(0);

	// Measure container height
	useLayoutEffect(() => {
		const measureHeight = () => {
			if (containerRef.current) {
				const rect = containerRef.current.getBoundingClientRect();
				setContainerHeight(rect.height);
			}
		};

		measureHeight();
		const resizeObserver = new ResizeObserver(measureHeight);
		if (containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		return () => resizeObserver.disconnect();
	}, []);

	// Calculate viewport for virtual scrolling
	const viewport = useMemo(() => {
		if (containerHeight === 0) {
			return { startIndex: 0, endIndex: -1, totalHeight: 0 };
		}

		return ViewportCalculator.calculateVisibleRows(
			scrollTop,
			containerHeight,
			ROW_HEIGHT,
			data.rows.length,
			5 // overscan
		);
	}, [scrollTop, containerHeight, data.rows.length]);

	const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
		setScrollTop(e.currentTarget.scrollTop);
	};

	const handleStartEdit = (rowIndex: number, colIndex: number, currentValue: any) => {
		startEdit(rowIndex, colIndex, currentValue);
	};

	const handleCommitEdit = (value: any) => {
		if (editState.editingCell) {
			const { row, col } = editState.editingCell;
			onCellChange?.(row, col, value);
			commitEdit();
		}
	};

	const handleCancelEdit = () => {
		cancelEdit();
	};

	// Calculate total width to ensure horizontal lines extend fully
	const totalWidth = data.columns.reduce((sum, col) => sum + (col.width || 100), 0) + ROW_NUMBER_WIDTH;

	// Generate visible rows
	const visibleRows = useMemo(() => {
		const rows = [];
		
		for (let i = viewport.startIndex; i <= viewport.endIndex; i++) {
			if (i < data.rows.length) {
				const row = data.rows[i];
				const isRowHovered = hoveredCell?.row === i;
				
				rows.push(
					<div 
						key={i} 
						className={`grid-row ${selectedRows.has(i) ? 'selected' : ''} ${isRowHovered ? 'hovered' : ''}`}
						style={{ 
							width: `${totalWidth}px`, 
							minWidth: `${totalWidth}px`,
							height: `${ROW_HEIGHT}px`,
							position: 'absolute',
							top: `${i * ROW_HEIGHT}px`,
							left: 0
						}}
					>
						{/* Row number cell */}
						<div
							className={`grid-cell row-number-cell ${selectedRows.has(i) ? 'selected' : ''}`}
							style={{ 
								width: `${ROW_NUMBER_WIDTH}px`,
								height: `${ROW_HEIGHT}px`,
								position: 'relative'
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								onRowMouseDown?.(i, e);
							}}
							onMouseEnter={() => {
								onRowMouseEnter?.(i);
							}}
						>
							{i + 1}
						</div>

						{data.columns.map((column, colIndex) => {
							const cellValue = row[colIndex];
							const isCurrentlyEditing = editState.isEditing && 
								editState.editingCell?.row === i && 
								editState.editingCell?.col === colIndex;
							const cellKey = `${i},${colIndex}`;
							const isCellSelected = selectedCells.has(cellKey);
							const isColumnSelected = selectedColumns.has(colIndex);
							const isRowSelected = selectedRows.has(i);
							const isColumnHovered = hoveredCell?.col === colIndex;
							
							return (
								<div
									key={colIndex}
									className={`grid-cell ${isCellSelected ? 'cell-selected' : ''} ${isColumnSelected ? 'selected' : ''} ${isRowSelected ? 'selected' : ''} ${isRowHovered ? 'row-hovered' : ''} ${isColumnHovered ? 'column-hovered' : ''}`}
									style={{ 
										width: `${column.width || 100}px`,
										height: `${ROW_HEIGHT}px`,
										position: 'relative'
									}}
									onMouseDown={(e) => {
										if (!isCurrentlyEditing) {
											onCellMouseDown?.(i, colIndex, e);
										}
									}}
									onMouseEnter={() => {
										if (!isCurrentlyEditing) {
											onCellMouseEnter?.(i, colIndex);
										}
									}}
								>
									<EditableCell
										value={cellValue}
										rowIndex={i}
										colIndex={colIndex}
										isEditing={isCurrentlyEditing}
										onStartEdit={() => handleStartEdit(i, colIndex, cellValue)}
										onCommitEdit={handleCommitEdit}
										onCancelEdit={handleCancelEdit}
									/>
								</div>
							);
						})}
					</div>
				);
			}
		}

		return rows;
	}, [
		viewport,
		data.rows,
		data.columns,
		selectedRows,
		selectedColumns,
		selectedCells,
		hoveredCell,
		editState,
		totalWidth,
		onRowMouseDown,
		onRowMouseEnter,
		onCellMouseDown,
		onCellMouseEnter
	]);

	if (data.rows.length === 0) {
		return (
			<div className="grid-body">
				<div className="empty-data">No data to display</div>
			</div>
		);
	}

	return (
		<div 
			ref={containerRef}
			className="grid-body"
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
					width: `${totalWidth}px`,
					position: 'relative'
				}}
			>
				{visibleRows}
			</div>
		</div>
	);
};
