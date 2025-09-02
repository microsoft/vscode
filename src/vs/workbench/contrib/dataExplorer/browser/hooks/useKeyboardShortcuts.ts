/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect } from 'react';
import { HistoryManager } from '../../../../services/dataExplorer/browser/editing/historyManager.js';

/**
 * Hook for handling keyboard shortcuts in the Data Explorer
 * Handles undo and redo keyboard shortcuts
 */
export const useKeyboardShortcuts = (historyManager: HistoryManager, enabled: boolean = true) => {
	
	useEffect(() => {
		if (!enabled) {
			return;
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			// Check if we're in an input field or text area to avoid interfering with normal editing
			const target = e.target as HTMLElement;
			if (!target) {
				return;
			}
			
			const tagName = target.tagName?.toLowerCase();
			if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) {
				return;
			}

			const isCtrlOrCmd = e.ctrlKey || e.metaKey;
			const isZ = e.key === 'z' || e.key === 'Z';
			const isY = e.key === 'y' || e.key === 'Y';

			// Undo
			if (isCtrlOrCmd && isZ && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				if (historyManager.canUndo()) {
					historyManager.undo();
				}
				return;
			}

			// Redo
			if (isCtrlOrCmd && ((isY && !e.shiftKey) || (isZ && e.shiftKey))) {
				e.preventDefault();
				e.stopPropagation();
				if (historyManager.canRedo()) {
					historyManager.redo();
				}
				return;
			}
		};

		// Add event listener to document to capture all keyboard events
		document.addEventListener('keydown', handleKeyDown, true);

		// Cleanup function
		return () => {
			document.removeEventListener('keydown', handleKeyDown, true);
		};
	}, [historyManager, enabled]);

	// Return nothing - this is a side-effect only hook
	return {};
};

