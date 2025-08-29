/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { EditableCell } from './editableCell.js';


interface GridBodyProps {
	data: GridData;
	onCellChange?: (row: number, col: number, value: any) => void;
	onRowMouseDown?: (index: number, event: React.MouseEvent) => void;
	onRowMouseEnter?: (index: number) => void;
	onCellMouseDown?: (row: number, col: number, event: React.MouseEvent) => void;
	onCellMouseEnter?: (row: number, col: number) => void;
	selectedRows?: Set<number>;
	selectedColumns?: Set<number>;
	selectedCells?: Set<string>;
}

export const GridBody: React.FC<GridBodyProps> = ({ data, onCellChange, onRowMouseDown, onRowMouseEnter, onCellMouseDown, onCellMouseEnter, selectedRows = new Set(), selectedColumns = new Set(), selectedCells = new Set() }) => {
	// Simplified state for basic editing - this component might be deprecated in favor of VirtualGridBody
	const [editState, setEditState] = React.useState({
		isEditing: false,
		editingCell: null as {row: number, col: number} | null
	});

	const startEdit = (row: number, col: number) => {
		setEditState({ isEditing: true, editingCell: { row, col } });
	};

	const commitEdit = () => {
		setEditState({ isEditing: false, editingCell: null });
	};

	const cancelEdit = () => {
		setEditState({ isEditing: false, editingCell: null });
	};
	
	// For Phase 4, we'll display the first 1000 rows to avoid performance issues
	// Virtual scrolling will be implemented in Phase 8
	const displayRows = data.rows.slice(0, 1000);
	const hasMoreRows = data.rows.length > 1000;

	const handleStartEdit = (rowIndex: number, colIndex: number, currentValue: any) => {
		startEdit(rowIndex, colIndex);
	};

	const handleCommitEdit = (value: any) => {
		console.log('GridBody.handleCommitEdit: Committing edit', { value, editState: editState.editingCell });
		if (editState.editingCell) {
			const { row, col } = editState.editingCell;
			console.log('GridBody.handleCommitEdit: Calling onCellChange', { row, col, value });
			onCellChange?.(row, col, value);
			commitEdit();
		}
	};

	const handleCancelEdit = () => {
		cancelEdit();
	};

	// Calculate total width to ensure horizontal lines extend fully (including row number column)
	const ROW_NUMBER_WIDTH = 60;
	const totalWidth = data.columns.reduce((sum, col) => sum + (col.width || 100), 0) + ROW_NUMBER_WIDTH;

	return (
		<div className="grid-body">
			{displayRows.map((row: any[], rowIndex: number) => (
				<div 
					key={rowIndex} 
					className={`grid-row ${selectedRows.has(rowIndex) ? 'selected' : ''}`}
					style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}
				>
					{/* Row number cell */}
					<div
						className={`grid-cell row-number-cell ${selectedRows.has(rowIndex) ? 'selected' : ''}`}
						style={{ 
							width: `${ROW_NUMBER_WIDTH}px`,
							position: 'relative'
						}}
						onMouseDown={(e) => {
							e.stopPropagation();
							onRowMouseDown?.(rowIndex, e);
						}}
						onMouseEnter={() => {
							onRowMouseEnter?.(rowIndex);
						}}
					>
{rowIndex + 1}
					</div>

					{data.columns.map((column, colIndex) => {
						const cellValue = row[colIndex]; // May be undefined if row has fewer columns
						const isCurrentlyEditing = editState.isEditing && 
							editState.editingCell?.row === rowIndex && 
							editState.editingCell?.col === colIndex;
						const cellKey = `${rowIndex},${colIndex}`;
						const isCellSelected = selectedCells.has(cellKey);
						const isColumnSelected = selectedColumns.has(colIndex);
						const isRowSelected = selectedRows.has(rowIndex);
						
						return (
							<div
								key={colIndex}
								className={`grid-cell ${isCellSelected ? 'cell-selected' : ''} ${isColumnSelected ? 'selected' : ''} ${isRowSelected ? 'selected' : ''}`}
								style={{ 
									width: `${column.width || 100}px`,
									position: 'relative'
								}}
								onMouseDown={(e) => {
									if (!isCurrentlyEditing) {
										onCellMouseDown?.(rowIndex, colIndex, e);
									}
								}}
								onMouseEnter={() => {
									if (!isCurrentlyEditing) {
										onCellMouseEnter?.(rowIndex, colIndex);
									}
								}}
							>
								<EditableCell
									value={cellValue}
									rowIndex={rowIndex}
									colIndex={colIndex}
									isEditing={isCurrentlyEditing}
									isSelected={false}
									onSelect={() => {}}
									onStartEdit={() => handleStartEdit(rowIndex, colIndex, cellValue)}
									onCommitEdit={handleCommitEdit}
									onCancelEdit={handleCancelEdit}
			
								/>
							</div>
						);
					})}
				</div>
			))}
			{hasMoreRows && (
				<div className="grid-row-count">
					<div className="grid-more-rows">
						... and {data.rows.length - 1000} more rows (virtual scrolling coming in Phase 8)
					</div>
				</div>
			)}
		</div>
	);
};
