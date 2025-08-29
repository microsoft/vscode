/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { GridRow } from './gridRow.js';

interface GridBodyProps {
	data: GridData;
	onCellChange?: (row: number, col: number, value: any) => void;
}

export const GridBody: React.FC<GridBodyProps> = ({ data, onCellChange }) => {
	// For Phase 3, we'll display the first 1000 rows to avoid performance issues
	// Virtual scrolling will be implemented in Phase 8
	const displayRows = data.rows.slice(0, 1000);
	const hasMoreRows = data.rows.length > 1000;

	return (
		<div className="grid-body">
			{displayRows.map((row: any[], rowIndex: number) => (
				<GridRow
					key={rowIndex}
					row={row}
					rowIndex={rowIndex}
					columns={data.columns}
					onCellChange={onCellChange}
				/>
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
