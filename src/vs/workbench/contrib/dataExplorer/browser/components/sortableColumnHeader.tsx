/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState } from 'react';
import { ColumnSchema } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { SortKey } from '../../../../services/dataExplorer/browser/sortManager.js';
import { SortIndicator } from './sortIndicator.js';
import { EditableCell } from './editableCell.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { IAction } from '../../../../../base/common/actions.js';

interface SortableColumnHeaderProps {
	column: ColumnSchema;
	columnIndex: number;
	sortKey?: SortKey;
	onSort: (columnIndex: number, ascending: boolean) => void;
	onColumnNameChange?: (columnIndex: number, newName: string) => void;
}

export const SortableColumnHeader: React.FC<SortableColumnHeaderProps> = ({ 
	column, 
	columnIndex, 
	sortKey, 
	onSort,
	onColumnNameChange 
}) => {

	
	const [isEditing, setIsEditing] = useState(false);
	const services = useErdosReactServicesContext();

	const handleNameStartEdit = () => {
		setIsEditing(true);
	};

	const handleNameCommitEdit = (newName: any) => {
		setIsEditing(false);
		if (onColumnNameChange && newName !== column.name) {
			onColumnNameChange(columnIndex, String(newName));
		}
	};

	const handleNameCancelEdit = () => {
		setIsEditing(false);
	};
	
	const handleContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();

		
		const actions: IAction[] = [
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
		];

		services.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => ({ x: event.clientX, y: event.clientY })
		});
	};

	const handleChevronClick = (event: React.MouseEvent) => {
		event.stopPropagation();
		if (sortKey) {

			onSort(columnIndex, !sortKey.ascending);
		}
	};

	return (
		<div 
			className="column-header sortable-column-header"
			style={{ width: `${column.width}px` }}
			onContextMenu={handleContextMenu}
		>
			<div className="column-header-content">
				<div className="column-name-wrapper">
					<EditableCell
						value={column.name}
						rowIndex={-1} // Use -1 to indicate header row
						colIndex={columnIndex}
						isEditing={isEditing}
						onStartEdit={handleNameStartEdit}
						onCommitEdit={handleNameCommitEdit}
						onCancelEdit={handleNameCancelEdit}
					/>
				</div>
				<div onClick={handleChevronClick}>
					<SortIndicator 
						ascending={sortKey?.ascending}
						priority={sortKey?.priority}
						visible={!!sortKey}
					/>
				</div>
			</div>
		</div>
	);
};

