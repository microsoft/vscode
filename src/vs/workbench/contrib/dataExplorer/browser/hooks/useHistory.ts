/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback } from 'react';
import { HistoryManager } from '../../../../services/dataExplorer/browser/historyManager.js';
import { Command } from '../../../../services/dataExplorer/common/commands.js';

interface HistoryState {
	canUndo: boolean;
	canRedo: boolean;
	undoDescription?: string;
	redoDescription?: string;
	undoStackSize: number;
	redoStackSize: number;
}

export const useHistory = (historyManager: HistoryManager) => {
	const [historyState, setHistoryState] = useState<HistoryState>({
		canUndo: historyManager.canUndo(),
		canRedo: historyManager.canRedo(),
		undoDescription: historyManager.getUndoDescription(),
		redoDescription: historyManager.getRedoDescription(),
		undoStackSize: historyManager.getUndoStackSize(),
		redoStackSize: historyManager.getRedoStackSize()
	});

	// Update state whenever history changes
	const updateHistoryState = useCallback(() => {
		setHistoryState({
			canUndo: historyManager.canUndo(),
			canRedo: historyManager.canRedo(),
			undoDescription: historyManager.getUndoDescription(),
			redoDescription: historyManager.getRedoDescription(),
			undoStackSize: historyManager.getUndoStackSize(),
			redoStackSize: historyManager.getRedoStackSize()
		});
	}, [historyManager]);

	// Subscribe to history manager events
	useEffect(() => {
		const disposables = [
			historyManager.onDidExecuteCommand(updateHistoryState),
			historyManager.onDidUndo(updateHistoryState),
			historyManager.onDidRedo(updateHistoryState),
			historyManager.onDidChangeCanUndo(updateHistoryState),
			historyManager.onDidChangeCanRedo(updateHistoryState)
		];

		// Initial state sync
		updateHistoryState();

		return () => {
			disposables.forEach(disposable => disposable.dispose());
		};
	}, [historyManager, updateHistoryState]);

	const executeCommand = useCallback((command: Command) => {
		historyManager.executeCommand(command);
	}, [historyManager]);

	const undo = useCallback(() => {
		return historyManager.undo();
	}, [historyManager]);

	const redo = useCallback(() => {
		return historyManager.redo();
	}, [historyManager]);

	const clear = useCallback(() => {
		historyManager.clear();
	}, [historyManager]);

	const setMaxHistorySize = useCallback((size: number) => {
		historyManager.setMaxHistorySize(size);
	}, [historyManager]);

	return {
		historyState,
		executeCommand,
		undo,
		redo,
		clear,
		setMaxHistorySize
	};
};



