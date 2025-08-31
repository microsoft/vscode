/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { TextEditor } from './cellEditors/textEditor.js';

interface EditableCellProps {
	value: any;
	rowIndex: number;
	colIndex: number;
	isEditing: boolean;
	isSelected: boolean;
	onSelect: () => void;
	onStartEdit: () => void;
	onCommitEdit: (value: any) => void;
	onCancelEdit: () => void;
	onNavigate?: (direction: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => void;
	isTextWrapped?: boolean;
}

const CellRenderer: React.FC<{ value: any, isSelected: boolean, isTextWrapped?: boolean }> = ({ value, isSelected, isTextWrapped = false }) => {
	const formatCellValue = (val: any): string => {
		if (val === null || val === undefined) {
			return '';
		}
		return String(val);
	};

	const cellStyle = isTextWrapped ? {
		whiteSpace: 'pre-wrap' as const,
		wordWrap: 'break-word' as const,
		overflowWrap: 'break-word' as const,
		overflow: 'hidden',
		width: '100%',
		height: '100%'
	} : {};

	return (
		<div 
			className={`cell-content ${isSelected ? 'selected' : ''}`}
			style={cellStyle}
		>
			{formatCellValue(value)}
		</div>
	);
};

export const EditableCell: React.FC<EditableCellProps> = ({ 
	value, 
	rowIndex, 
	colIndex, 
	isEditing, 
	isSelected,
	onSelect,
	onStartEdit,
	onCommitEdit,
	onCancelEdit,
	onNavigate,
	isTextWrapped = false
}) => {
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		
		if (!isSelected) {
			// First click - select the cell
			onSelect();
		} else if (isSelected && !isEditing) {
			// Cell is already selected - enter edit mode
			onStartEdit();
		}
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		
		if (!isEditing) {
			// Double click should always enter edit mode, even if not selected
			if (!isSelected) {
				onSelect();
			}
			onStartEdit();
		}
	};
	
	if (isEditing) {
		return (
			<TextEditor 
				value={value}
				onCommit={onCommitEdit}
				onCancel={onCancelEdit}
				onNavigate={onNavigate}
				isMultiline={isTextWrapped}
			/>
		);
	}
	
	return (
		<div 
			className="editable-cell" 
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			title={String(value || '')}
		>
			<CellRenderer value={value} isSelected={isSelected} isTextWrapped={isTextWrapped} />
		</div>
	);
};
