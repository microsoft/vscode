/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';

interface TextEditorProps {
	value: any;
	onCommit: (value: any) => void;
	onCancel: () => void;
}

export const TextEditor: React.FC<TextEditorProps> = ({ value, onCommit, onCancel }) => {
	const [editValue, setEditValue] = useState(String(value || ''));
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			onCommit(editValue);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	};

	const handleBlur = () => {
		console.log('TextEditor.handleBlur: Committing value on blur', { editValue, originalValue: value });
		onCommit(editValue);
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setEditValue(e.target.value);
	};

	return (
		<input
			ref={inputRef}
			type="text"
			className="cell-editor text-editor"
			value={editValue}
			onChange={handleChange}
			onKeyDown={handleKeyDown}
			onBlur={handleBlur}
		/>
	);
};



