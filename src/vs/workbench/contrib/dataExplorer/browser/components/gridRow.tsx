/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { ColumnSchema } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';

interface GridRowProps {
	row: any[];
	rowIndex: number;
	columns: ColumnSchema[];
	onCellChange?: (row: number, col: number, value: any) => void;
}

export const GridRow: React.FC<GridRowProps> = ({ row, rowIndex, columns, onCellChange }) => {
	const handleCellClick = (colIndex: number) => {
		// For Phase 3, we'll just log the cell click
		// Cell editing will be implemented in Phase 4

	};

	// Calculate total width to ensure horizontal lines extend fully
	const totalWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0);
	


	const formatCellValue = (value: any): string => {
		if (value === null || value === undefined) {
			return '';
		}
		return String(value);
	};

	return (
		<div className="grid-row" style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}>
			{columns.map((column, colIndex) => {
				const cellValue = row[colIndex]; // May be undefined if row has fewer columns
				const formattedValue = formatCellValue(cellValue);
				
				return (
					<div 
						key={colIndex} 
						className="grid-cell"
						style={{ width: `${column.width || 100}px` }}
						onClick={() => handleCellClick(colIndex)}
						title={formattedValue} // Show full value on hover
					>
						{formattedValue}
					</div>
				);
			})}
		</div>
	);
};
