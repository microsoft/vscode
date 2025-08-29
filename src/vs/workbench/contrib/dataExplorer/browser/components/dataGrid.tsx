/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { ColumnHeaders } from './columnHeaders.js';
import { GridBody } from './gridBody.js';

interface DataGridProps {
	data: GridData;
	onCellChange?: (row: number, col: number, value: any) => void;
	onColumnSort?: (columnIndex: number, ascending: boolean) => void;
	onHeaderFreezeToggle?: (isFrozen: boolean) => void;
}

export interface DataGridRef {
	toggleHeaderFreeze: () => void;
	isHeadersFrozen: boolean;
}

export const DataGrid = forwardRef<DataGridRef, DataGridProps>(({ data, onCellChange, onColumnSort, onHeaderFreezeToggle }, ref) => {
	const [isHeadersFrozen, setIsHeadersFrozen] = useState(true);
	const headersRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);

	const handleBodyScroll = (event: React.UIEvent<HTMLDivElement>) => {
		// Since headers and body are in the same scroll container, no sync needed
	};

	const toggleHeaderFreeze = () => {
		const newFrozenState = !isHeadersFrozen;
		setIsHeadersFrozen(newFrozenState);
		onHeaderFreezeToggle?.(newFrozenState);
	};

	useImperativeHandle(ref, () => ({
		toggleHeaderFreeze,
		isHeadersFrozen
	}));



	return (
		<div className="data-grid">
			<div 
				ref={bodyRef}
				className="grid-container"
				onScroll={handleBodyScroll}
			>
				<ColumnHeaders 
					ref={headersRef}
					columns={data.columns} 
					onSort={onColumnSort}
					isFrozen={isHeadersFrozen}
				/>
				<GridBody 
					data={data} 
					onCellChange={onCellChange}
				/>
			</div>
		</div>
	);
});
