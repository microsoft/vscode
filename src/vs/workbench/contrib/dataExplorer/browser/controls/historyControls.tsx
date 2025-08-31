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
		? `Undo: ${undoDescription}` 
		: 'Undo';
	
	const redoTooltip = redoDescription 
		? `Redo: ${redoDescription}` 
		: 'Redo';

	return (
		<div className={`undo-redo-buttons ${className || ''}`}>
			<button
				className="undo-button"
				onClick={handleUndo}
				disabled={!canUndo}
				title={undoTooltip}
				aria-label={undoTooltip}
			>
				<span className="codicon codicon-discard" aria-hidden="true"></span>
				{showLabels && <span className="button-label">Undo</span>}
			</button>
			
			<button
				className="redo-button"
				onClick={handleRedo}
				disabled={!canRedo}
				title={redoTooltip}
				aria-label={redoTooltip}
			>
				<span className="codicon codicon-redo" aria-hidden="true"></span>
				{showLabels && <span className="button-label">Redo</span>}
			</button>
		</div>
	);
};