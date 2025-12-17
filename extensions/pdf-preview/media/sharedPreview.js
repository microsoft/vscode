/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use strict";

/**
 * Shared preview utilities for PDF and Markdown previews.
 * This module provides common functionality for dark mode, sync toggle, findbar, zoom, and scroll sync.
 */

/**
 * @typedef {Object} SharedPreviewElements
 * @property {HTMLElement|null} container - The main content container
 * @property {HTMLElement|null} loading - The loading indicator element
 * @property {HTMLElement|null} errorContainer - The error container element
 * @property {HTMLElement|null} errorMessage - The error message element
 * @property {HTMLElement|null} btnDarkMode - The dark mode toggle button
 * @property {HTMLElement|null} btnSyncToggle - The sync toggle button
 * @property {HTMLElement|null} btnFind - The find button
 * @property {HTMLElement|null} findbar - The findbar container
 * @property {HTMLInputElement|null} findInput - The find input field
 * @property {HTMLElement|null} findPrev - The find previous button
 * @property {HTMLElement|null} findNext - The find next button
 * @property {HTMLInputElement|null} findHighlightAll - The highlight all checkbox
 * @property {HTMLInputElement|null} findMatchCase - The match case checkbox
 * @property {HTMLElement|null} findResultsCount - The results count element
 * @property {HTMLElement|null} findClose - The find close button
 * @property {HTMLElement|null} btnZoomIn - The zoom in button
 * @property {HTMLElement|null} btnZoomOut - The zoom out button
 * @property {HTMLSelectElement|null} zoomSelect - The zoom select dropdown
 * @property {HTMLElement|null} btnFitWidth - The fit width button
 */

/**
 * @typedef {Object} SharedPreviewState
 * @property {boolean} isDarkMode - Whether dark mode is enabled
 * @property {'off'|'click'|'scroll'} syncMode - Current sync mode
 * @property {boolean} previewInitiatedSync - Whether preview initiated last sync
 * @property {boolean} isMouseOverPreview - Whether mouse is over preview
 * @property {number} currentMatchIndex - Current search match index
 * @property {number} totalMatches - Total number of search matches
 * @property {string} lastSearchQuery - Last search query
 */

/**
 * Create shared preview utilities
 * @param {any} vscode - The VS Code API object
 * @param {string} darkModeClass - CSS class for dark mode (e.g., 'pdf-dark-mode' or 'markdown-dark-mode')
 * @param {boolean} enableSyncClick - Whether click sync is available
 * @returns {Object} Shared preview utilities
 */
function createSharedPreview(vscode, darkModeClass, enableSyncClick) {
	// Load saved state
	const savedState = vscode.getState() || {};

	/** @type {SharedPreviewState} */
	const state = {
		isDarkMode: savedState.darkMode || false,
		syncMode: savedState.syncMode !== undefined ? savedState.syncMode : (enableSyncClick ? 'click' : 'scroll'),
		previewInitiatedSync: false,
		isMouseOverPreview: false,
		currentMatchIndex: -1,
		totalMatches: 0,
		lastSearchQuery: ''
	};

	// ==================== SETTINGS ====================

	/**
	 * Get settings from a data attribute element
	 * @param {string} elementId - The ID of the element containing settings
	 * @returns {any} The parsed settings object
	 */
	function getSettings(elementId) {
		const element = document.getElementById(elementId);
		if (element) {
			const data = element.getAttribute('data-settings');
			if (data) {
				return JSON.parse(data);
			}
		}
		throw new Error('Could not load settings');
	}

	// ==================== ERROR HANDLING ====================

	/**
	 * Show an error message
	 * @param {string} message - The error message to display
	 * @param {SharedPreviewElements} elements - The UI elements
	 */
	function showError(message, elements) {
		if (elements.loading) {
			elements.loading.style.display = 'none';
		}
		if (elements.container) {
			elements.container.style.display = 'none';
		}
		if (elements.errorContainer) {
			elements.errorContainer.style.display = 'block';
		}
		if (elements.errorMessage) {
			elements.errorMessage.textContent = message;
		}
		vscode.postMessage({ type: 'error', error: message });
	}

	// ==================== DARK MODE ====================

	/**
	 * Initialize dark mode from saved state
	 * @param {SharedPreviewElements} elements - The UI elements
	 */
	function initDarkMode(elements) {
		if (state.isDarkMode) {
			document.body.classList.add(darkModeClass);
			if (elements.btnDarkMode) {
				elements.btnDarkMode.classList.add('active');
				elements.btnDarkMode.title = 'Switch to Light Mode';
			}
		}
	}

	/**
	 * Toggle dark mode
	 * @param {SharedPreviewElements} elements - The UI elements
	 */
	function toggleDarkMode(elements) {
		state.isDarkMode = !state.isDarkMode;
		document.body.classList.toggle(darkModeClass, state.isDarkMode);
		if (elements.btnDarkMode) {
			elements.btnDarkMode.classList.toggle('active', state.isDarkMode);
			elements.btnDarkMode.title = state.isDarkMode ? 'Switch to Light Mode' : 'Toggle Dark Mode';
		}
		vscode.setState({ ...vscode.getState(), darkMode: state.isDarkMode });
	}

	// ==================== SYNC TOGGLE ====================

	/**
	 * Get SVG icon for sync mode
	 * @param {'off'|'click'|'scroll'} mode - The sync mode
	 * @returns {string} The SVG icon HTML
	 */
	function getSyncIcon(mode) {
		const baseIcon = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';

		switch (mode) {
			case 'click':
				return baseIcon;
			case 'scroll':
				return '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/><text x="17" y="23" font-size="10" font-weight="bold" font-family="sans-serif" fill="currentColor">A</text></svg>';
			default:
				return baseIcon;
		}
	}

	/**
	 * Update sync button visual state
	 * @param {SharedPreviewElements} elements - The UI elements
	 */
	function updateSyncButtonState(elements) {
		if (!elements.btnSyncToggle) { return; }

		elements.btnSyncToggle.classList.remove('active', 'sync-disabled', 'sync-mode-click', 'sync-mode-scroll');

		switch (state.syncMode) {
			case 'off':
				elements.btnSyncToggle.classList.add('sync-disabled');
				elements.btnSyncToggle.title = 'Sync Disabled (Click to enable Click Sync)';
				elements.btnSyncToggle.innerHTML = getSyncIcon('off');
				break;
			case 'click':
				elements.btnSyncToggle.classList.add('active', 'sync-mode-click');
				elements.btnSyncToggle.title = 'Click Sync Enabled (Click to switch to Scroll Sync)';
				elements.btnSyncToggle.innerHTML = getSyncIcon('click');
				break;
			case 'scroll':
				elements.btnSyncToggle.classList.add('active', 'sync-mode-scroll');
				elements.btnSyncToggle.title = 'Scroll Sync Enabled (Click to disable)';
				elements.btnSyncToggle.innerHTML = getSyncIcon('scroll');
				break;
		}
	}

	/**
	 * Initialize sync toggle button
	 * @param {SharedPreviewElements} elements - The UI elements
	 * @param {boolean} [alwaysShow=false] - Whether to always show the button
	 */
	function initSyncToggle(elements, alwaysShow = false) {
		if (elements.btnSyncToggle) {
			if (alwaysShow || enableSyncClick) {
				elements.btnSyncToggle.style.display = '';
			}
			updateSyncButtonState(elements);
		}
	}

	/**
	 * Cycle through sync modes: off -> click -> scroll -> off
	 * @param {SharedPreviewElements} elements - The UI elements
	 */
	function cycleSyncMode(elements) {
		switch (state.syncMode) {
			case 'off':
				state.syncMode = 'click';
				break;
			case 'click':
				state.syncMode = 'scroll';
				break;
			case 'scroll':
				state.syncMode = 'off';
				break;
		}
		updateSyncButtonState(elements);
		vscode.setState({ ...vscode.getState(), syncMode: state.syncMode });
		vscode.postMessage({ type: 'syncModeChanged', mode: state.syncMode });
	}

	// ==================== FINDBAR ====================

	/**
	 * Open the findbar
	 * @param {SharedPreviewElements} elements - The UI elements
	 */
	function openFindbar(elements) {
		if (elements.findbar) {
			elements.findbar.classList.remove('hidden');
			if (elements.btnFind) {
				elements.btnFind.classList.add('active');
			}
			if (elements.findInput) {
				elements.findInput.focus();
				elements.findInput.select();
			}
		}
	}

	/**
	 * Close the findbar
	 * @param {SharedPreviewElements} elements - The UI elements
	 * @param {Function} clearHighlights - Function to clear search highlights
	 */
	function closeFindbar(elements, clearHighlights) {
		if (elements.findbar) {
			elements.findbar.classList.add('hidden');
			if (elements.btnFind) {
				elements.btnFind.classList.remove('active');
			}
			clearHighlights();
			updateSearchResultsCount(elements, 0, 0);
		}
	}

	/**
	 * Toggle the findbar
	 * @param {SharedPreviewElements} elements - The UI elements
	 * @param {Function} clearHighlights - Function to clear search highlights
	 */
	function toggleFindbar(elements, clearHighlights) {
		if (elements.findbar && !elements.findbar.classList.contains('hidden')) {
			closeFindbar(elements, clearHighlights);
		} else {
			openFindbar(elements);
		}
	}

	/**
	 * Update search results count display
	 * @param {SharedPreviewElements} elements - The UI elements
	 * @param {number} current - Current match index (1-based)
	 * @param {number} total - Total number of matches
	 */
	function updateSearchResultsCount(elements, current, total) {
		if (elements.findResultsCount) {
			if (total === 0 && elements.findInput && elements.findInput.value.length > 0) {
				elements.findResultsCount.textContent = 'No results';
				elements.findResultsCount.classList.add('not-found');
			} else if (total > 0) {
				elements.findResultsCount.textContent = `${current} of ${total}`;
				elements.findResultsCount.classList.remove('not-found');
			} else {
				elements.findResultsCount.textContent = '';
				elements.findResultsCount.classList.remove('not-found');
			}
		}
	}

	// ==================== ZOOM ====================

	const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
	const MIN_SCALE = 0.25;
	const MAX_SCALE = 5;

	/**
	 * Get the next zoom level for zooming in
	 * @param {number|string} currentScale - Current scale value
	 * @returns {number} Next zoom level
	 */
	function getZoomInLevel(currentScale) {
		if (typeof currentScale !== 'number') {
			return 1.5;
		}
		let i = 0;
		for (; i < zoomLevels.length; ++i) {
			if (zoomLevels[i] > currentScale) { break; }
		}
		return zoomLevels[i] || MAX_SCALE;
	}

	/**
	 * Get the next zoom level for zooming out
	 * @param {number|string} currentScale - Current scale value
	 * @returns {number} Next zoom level
	 */
	function getZoomOutLevel(currentScale) {
		if (typeof currentScale !== 'number') {
			return 1.0;
		}
		let i = zoomLevels.length - 1;
		for (; i >= 0; --i) {
			if (zoomLevels[i] < currentScale) { break; }
		}
		return zoomLevels[i] || MIN_SCALE;
	}

	/**
	 * Clamp scale to valid range
	 * @param {number} scale - The scale value
	 * @returns {number} Clamped scale value
	 */
	function clampScale(scale) {
		return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
	}

	/**
	 * Update fit width button active state
	 * @param {SharedPreviewElements} elements - The UI elements
	 * @param {boolean} isFitWidth - Whether fit width mode is active
	 */
	function updateFitWidthButtonState(elements, isFitWidth) {
		if (elements.btnFitWidth) {
			if (isFitWidth) {
				elements.btnFitWidth.classList.add('active');
			} else {
				elements.btnFitWidth.classList.remove('active');
			}
		}
	}

	// ==================== SCROLL SYNC ====================

	/**
	 * Setup mouse tracking for master-slave scroll sync
	 * @param {HTMLElement|null} container - The container element
	 */
	function setupMouseTracking(container) {
		if (container) {
			container.addEventListener('mouseenter', () => { state.isMouseOverPreview = true; });
			container.addEventListener('mouseleave', () => { state.isMouseOverPreview = false; });
		}
	}

	/**
	 * Check if scroll should be processed based on sync mode and source
	 * @param {'click'|'scroll'|undefined} source - The source of the scroll
	 * @returns {boolean} Whether scroll should be processed
	 */
	function shouldProcessScroll(source) {
		if (state.syncMode === 'off') { return false; }
		if (source && source !== state.syncMode) { return false; }
		if (state.previewInitiatedSync) { return false; }
		return true;
	}

	/**
	 * Mark that preview initiated sync (prevents feedback loop)
	 * @param {number} [timeout=500] - How long to mark as initiated
	 */
	function markPreviewInitiatedSync(timeout = 500) {
		state.previewInitiatedSync = true;
		setTimeout(() => { state.previewInitiatedSync = false; }, timeout);
	}

	/**
	 * Check if scroll position should be reported (preview → editor)
	 * @returns {boolean} Whether to report scroll
	 */
	function shouldReportScroll() {
		return state.syncMode === 'scroll' && state.isMouseOverPreview;
	}

	// ==================== KEYBOARD SHORTCUTS ====================

	/**
	 * Setup common keyboard shortcuts
	 * @param {SharedPreviewElements} elements - The UI elements
	 * @param {Function} clearHighlights - Function to clear search highlights
	 * @param {Function} zoomIn - Function to zoom in
	 * @param {Function} zoomOut - Function to zoom out
	 * @param {HTMLInputElement|null} [additionalInputToIgnore=null] - Additional input to ignore shortcuts on
	 */
	function setupKeyboardShortcuts(elements, clearHighlights, zoomIn, zoomOut, additionalInputToIgnore = null) {
		document.addEventListener('keydown', (e) => {
			const isInInput = e.target === elements.findInput || e.target === additionalInputToIgnore;

			// Ctrl+F or Cmd+F to open findbar
			if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
				e.preventDefault();
				openFindbar(elements);
				return;
			}

			// Escape to close findbar
			if (e.key === 'Escape' && elements.findbar && !elements.findbar.classList.contains('hidden')) {
				e.preventDefault();
				closeFindbar(elements, clearHighlights);
				return;
			}

			// Don't process other shortcuts when in input fields
			if (isInInput) { return; }

			switch (e.key) {
				case '+':
				case '=':
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						zoomIn();
					}
					break;
				case '-':
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						zoomOut();
					}
					break;
			}
		});
	}

	/**
	 * Setup mouse wheel zoom
	 * @param {HTMLElement|null} container - The container element
	 * @param {Function} zoomIn - Function to zoom in
	 * @param {Function} zoomOut - Function to zoom out
	 */
	function setupWheelZoom(container, zoomIn, zoomOut) {
		if (container) {
			container.addEventListener('wheel', (e) => {
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					if (e.deltaY < 0) {
						zoomIn();
					} else {
						zoomOut();
					}
				}
			}, { passive: false });
		}
	}

	// Return public API
	return {
		state,
		getSettings,
		showError,
		initDarkMode,
		toggleDarkMode,
		getSyncIcon,
		updateSyncButtonState,
		initSyncToggle,
		cycleSyncMode,
		openFindbar,
		closeFindbar,
		toggleFindbar,
		updateSearchResultsCount,
		zoomLevels,
		MIN_SCALE,
		MAX_SCALE,
		getZoomInLevel,
		getZoomOutLevel,
		clampScale,
		updateFitWidthButtonState,
		setupMouseTracking,
		shouldProcessScroll,
		markPreviewInitiatedSync,
		shouldReportScroll,
		setupKeyboardShortcuts,
		setupWheelZoom
	};
}

// Export to global scope for use by preview scripts
// @ts-ignore
window.createSharedPreview = createSharedPreview;

