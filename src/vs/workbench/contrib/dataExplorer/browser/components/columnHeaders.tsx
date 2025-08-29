/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { forwardRef } from 'react';
import { ColumnSchema } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';

interface ColumnHeadersProps {
	columns: ColumnSchema[];
	onSort?: (index: number, ascending: boolean) => void;
	isFrozen?: boolean;
}

export const ColumnHeaders = forwardRef<HTMLDivElement, ColumnHeadersProps>(({ columns, onSort, isFrozen }, ref) => {
	// Calculate total width to match grid rows
	const totalWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0);
	


	return (
		<div 
			ref={ref}
			className={`column-headers ${isFrozen ? 'frozen' : ''}`}
			style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}
		>
			{columns.map((column, index) => (
				<div 
					key={index} 
					className="column-header"
					style={{ width: `${column.width}px` }}
					onClick={() => onSort?.(index, true)}
				>
					<span className="column-name">{column.name}</span>
					<span className="column-type">({column.type})</span>
				</div>
			))}
		</div>
	);
});
