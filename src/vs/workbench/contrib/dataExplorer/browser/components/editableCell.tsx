/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { CellEditor } from './editors/cellEditor.js';

interface EditableCellProps {
	value: any;
	rowIndex: number;
	colIndex: number;
	isEditing: boolean;
	onStartEdit: () => void;
	onCommitEdit: (value: any) => void;
	onCancelEdit: () => void;
}

const CellRenderer: React.FC<{ value: any }> = ({ value }) => {
	const formatCellValue = (val: any): string => {
		if (val === null || val === undefined) {
			return '';
		}
		return String(val);
	};

	return <>{formatCellValue(value)}</>;
};

export const EditableCell: React.FC<EditableCellProps> = ({ 
	value, 
	rowIndex, 
	colIndex, 
	isEditing, 
	onStartEdit, 
	onCommitEdit, 
	onCancelEdit 
}) => {
	
	if (isEditing) {
		return (
			<CellEditor 
				value={value}
				onCommit={onCommitEdit}
				onCancel={onCancelEdit}
			/>
		);
	}
	
	return (
		<div 
			className="editable-cell" 
			onClick={onStartEdit} 
			onDoubleClick={onStartEdit}
			title={String(value || '')}
		>
			<CellRenderer value={value} />
		</div>
	);
};
