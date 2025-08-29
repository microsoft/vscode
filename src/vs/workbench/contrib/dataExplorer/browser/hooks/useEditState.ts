/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from 'react';

interface EditState {
	isEditing: boolean;
	editingCell: { row: number; col: number } | null;
	editValue: any;
	originalValue: any;
}

export const useEditState = () => {
	const [editState, setEditState] = useState<EditState>({
		isEditing: false,
		editingCell: null,
		editValue: null,
		originalValue: null
	});

	const startEdit = (row: number, col: number, currentValue: any) => {
		setEditState({
			isEditing: true,
			editingCell: { row, col },
			editValue: currentValue,
			originalValue: currentValue
		});
	};

	const commitEdit = () => {
		setEditState({
			isEditing: false,
			editingCell: null,
			editValue: null,
			originalValue: null
		});
	};

	const cancelEdit = () => {
		setEditState({
			isEditing: false,
			editingCell: null,
			editValue: null,
			originalValue: null
		});
	};

	const updateEditValue = (value: any) => {
		setEditState(prev => ({
			...prev,
			editValue: value
		}));
	};

	return { 
		editState, 
		startEdit, 
		commitEdit, 
		cancelEdit, 
		updateEditValue 
	};
};



