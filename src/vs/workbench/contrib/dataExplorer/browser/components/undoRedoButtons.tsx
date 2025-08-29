/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useCallback } from 'react';

export interface UndoRedoButtonsProps {
	canUndo: boolean;
	canRedo: boolean;
	undoDescription?: string;
	redoDescription?: string;
	onUndo: () => void;
	onRedo: () => void;
	className?: string;
	showLabels?: boolean;
}

/**
 * Undo/Redo button controls for the Data Explorer
 * Provides buttons for undoing and redoing operations
 */
export const UndoRedoButtons: React.FC<UndoRedoButtonsProps> = ({
	canUndo,
	canRedo,
	undoDescription,
	redoDescription,
	onUndo,
	onRedo,
	className,
	showLabels = true
}) => {
	
	const handleUndo = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (canUndo) {
			onUndo();
		}
	}, [canUndo, onUndo]);

	const handleRedo = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (canRedo) {
			onRedo();
		}
	}, [canRedo, onRedo]);

	// Generate tooltip text with description if available
	const undoTooltip = undoDescription 
		? `Undo: ${undoDescription} (Ctrl+Z)` 
		: 'Undo (Ctrl+Z)';
	
	const redoTooltip = redoDescription 
		? `Redo: ${redoDescription} (Ctrl+Y)` 
		: 'Redo (Ctrl+Y)';

	return (
		<div className={`undo-redo-buttons ${className || ''}`}>
			<button
				className="undo-button"
				onClick={handleUndo}
				disabled={!canUndo}
				title={undoTooltip}
				aria-label={undoTooltip}
			>
				<span className="undo-icon" aria-hidden="true">↶</span>
				{showLabels && <span className="button-label">Undo</span>}
			</button>
			
			<button
				className="redo-button"
				onClick={handleRedo}
				disabled={!canRedo}
				title={redoTooltip}
				aria-label={redoTooltip}
			>
				<span className="redo-icon" aria-hidden="true">↷</span>
				{showLabels && <span className="button-label">Redo</span>}
			</button>
		</div>
	);
};

/**
 * Individual Undo button component for more granular control
 */
export const UndoButton: React.FC<{
	canUndo: boolean;
	undoDescription?: string;
	onUndo: () => void;
	className?: string;
	showLabel?: boolean;
}> = ({ canUndo, undoDescription, onUndo, className, showLabel = true }) => {
	
	const handleUndo = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (canUndo) {
			onUndo();
		}
	}, [canUndo, onUndo]);

	const tooltip = undoDescription 
		? `Undo: ${undoDescription} (Ctrl+Z)` 
		: 'Undo (Ctrl+Z)';

	return (
		<button
			className={`undo-button ${className || ''}`}
			onClick={handleUndo}
			disabled={!canUndo}
			title={tooltip}
			aria-label={tooltip}
		>
			<span className="undo-icon" aria-hidden="true">↶</span>
			{showLabel && <span className="button-label">Undo</span>}
		</button>
	);
};

/**
 * Individual Redo button component for more granular control
 */
export const RedoButton: React.FC<{
	canRedo: boolean;
	redoDescription?: string;
	onRedo: () => void;
	className?: string;
	showLabel?: boolean;
}> = ({ canRedo, redoDescription, onRedo, className, showLabel = true }) => {
	
	const handleRedo = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (canRedo) {
			onRedo();
		}
	}, [canRedo, onRedo]);

	const tooltip = redoDescription 
		? `Redo: ${redoDescription} (Ctrl+Y)` 
		: 'Redo (Ctrl+Y)';

	return (
		<button
			className={`redo-button ${className || ''}`}
			onClick={handleRedo}
			disabled={!canRedo}
			title={tooltip}
			aria-label={tooltip}
		>
			<span className="redo-icon" aria-hidden="true">↷</span>
			{showLabel && <span className="button-label">Redo</span>}
		</button>
	);
};



