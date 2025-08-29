/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect } from 'react';
import { HistoryManager } from '../../../../services/dataExplorer/browser/historyManager.js';

/**
 * Hook for handling keyboard shortcuts in the Data Explorer
 * Handles Ctrl+Z (Cmd+Z on Mac) for undo and Ctrl+Y (Cmd+Shift+Z on Mac) for redo
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

			// Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
			if (isCtrlOrCmd && isZ && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				if (historyManager.canUndo()) {
					historyManager.undo();
				}
				return;
			}

			// Redo: Ctrl+Y (Windows/Linux) or Cmd+Shift+Z (Mac) or Ctrl+Shift+Z
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

