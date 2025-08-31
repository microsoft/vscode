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
	onNavigate?: (direction: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => void;
	isMultiline?: boolean;
}

export const TextEditor: React.FC<TextEditorProps> = ({ value, onCommit, onCancel, onNavigate, isMultiline = false }) => {
	const [editValue, setEditValue] = useState(String(value || ''));
	const inputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const hasCommittedRef = useRef(false);
	const currentValueRef = useRef(editValue);
	const shouldReplaceContentRef = useRef(false);

	// Keep current value ref updated
	useEffect(() => {
		currentValueRef.current = editValue;
	}, [editValue]);

	useEffect(() => {
		const element = isMultiline ? textareaRef.current : inputRef.current;
		if (element) {
			element.focus();
			element.select();
		}
		
		// Reset committed flag when component mounts
		hasCommittedRef.current = false;
		
		// Listen for the custom event to replace content
		const handleStartEditWithReplace = (event: CustomEvent) => {
			const character = event.detail?.character;
			const isActiveElement = element === document.activeElement;
			
			if (character && isActiveElement) {
				shouldReplaceContentRef.current = true;
				setEditValue(character);
				// Position cursor at the end
				setTimeout(() => {
					if (element) {
						const length = character.length;
						if ('setSelectionRange' in element) {
							element.setSelectionRange(length, length);
						}
					}
				}, 0);
			}
		};
		
		document.addEventListener('startEditWithReplace', handleStartEditWithReplace as EventListener);
		
		// Return cleanup function that commits if not already committed
		return () => {
			document.removeEventListener('startEditWithReplace', handleStartEditWithReplace as EventListener);
			if (!hasCommittedRef.current) {
				onCommit(currentValueRef.current);
			}
		};
	}, []); // Empty dependency array - only run on mount/unmount

	const commitEdit = () => {
		if (!hasCommittedRef.current) {
			hasCommittedRef.current = true;
			onCommit(editValue);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		if (e.key === 'Enter') {
			if (isMultiline && e.ctrlKey) {
				// In multiline mode, Ctrl+Enter creates new lines
				return;
			}
			e.preventDefault();
			commitEdit();
			if (onNavigate) {
				onNavigate(e.shiftKey ? 'up' : 'down');
			}
		} else if (e.key === 'Tab') {
			e.preventDefault();
			commitEdit();
			if (onNavigate) {
				onNavigate(e.shiftKey ? 'prev' : 'next');
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			hasCommittedRef.current = true;
			onCancel();
		}
	};

	const handleBlur = () => {
		commitEdit();
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		setEditValue(e.target.value);
	};

	if (isMultiline) {
		return (
			<textarea
				ref={textareaRef}
				className="cell-editor text-editor multiline-editor"
				value={editValue}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				style={{
					resize: 'none',
					width: '100%',
					height: '100%',
					border: 'none',
					outline: 'none',
					padding: '0',
					fontSize: '13px',
					fontFamily: 'var(--monaco-font-family)',
					lineHeight: '1.2',
					whiteSpace: 'pre-wrap',
					wordWrap: 'break-word',
					overflowWrap: 'break-word',
					backgroundColor: 'transparent'
				}}
			/>
		);
	}

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



