/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use strict";

(async function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	function getSettings() {
		const element = document.getElementById('markdown-preview-settings');
		if (element) {
			const data = element.getAttribute('data-settings');
			if (data) {
				return JSON.parse(data);
			}
		}
		throw new Error('Could not load settings');
	}

	const settings = getSettings();
	const container = document.getElementById('markdown-container');
	const content = document.getElementById('markdown-content');
	const loading = document.getElementById('loading');
	const errorContainer = document.getElementById('error-container');
	const errorMessage = document.getElementById('error-message');

	// Toolbar elements
	const btnZoomOut = document.getElementById('btn-zoom-out');
	const btnZoomIn = document.getElementById('btn-zoom-in');
	const zoomSelect = document.getElementById('zoom-select');
	const btnDarkMode = document.getElementById('btn-dark-mode');
	const btnExportPdf = document.getElementById('btn-export-pdf');
	const btnSyncToggle = document.getElementById('btn-sync-toggle');

	// Find/Search elements
	const btnFind = document.getElementById('btn-find');
	const findbar = document.getElementById('findbar');
	const findInput = document.getElementById('find-input');
	const findPrev = document.getElementById('find-prev');
	const findNext = document.getElementById('find-next');
	const findHighlightAll = document.getElementById('find-highlight-all');
	const findMatchCase = document.getElementById('find-match-case');
	const findResultsCount = document.getElementById('find-results-count');
	const findClose = document.getElementById('find-close');

	// Fit width button
	const btnFitWidth = document.getElementById('btn-fit-width');

	// State
	let currentScale = 1;
	let currentScaleMode = 'numeric'; // 'numeric', 'fitWidth', 'fitWindow'
	const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
	const MIN_SCALE = 0.25;
	const MAX_SCALE = 5;

	// Search state
	let currentMatchIndex = -1;
	let totalMatches = 0;
	let lastSearchQuery = '';
	let highlightedRanges = [];

	// Dark mode state - detect from VS Code theme or load from saved state
	const state = vscode.getState() || {};

	// Check if VS Code is in dark mode by looking at the body class
	function detectVsCodeDarkMode() {
		return document.body.classList.contains('vscode-dark') ||
			document.body.classList.contains('vscode-high-contrast');
	}

	// Use saved state if available, otherwise detect from VS Code theme
	let isDarkMode = state.darkMode !== undefined ? state.darkMode : detectVsCodeDarkMode();

	// Sync enabled state
	let isSyncEnabled = state.syncEnabled !== undefined ? state.syncEnabled : true;

	// Show error
	function showError(message) {
		if (loading) {
			loading.style.display = 'none';
		}
		if (container) {
			container.style.display = 'none';
		}
		if (errorContainer) {
			errorContainer.style.display = 'block';
		}
		if (errorMessage) {
			errorMessage.textContent = message;
		}
		vscode.postMessage({ type: 'error', error: message });
	}

	// Initialize dark mode from saved state
	function initDarkMode() {
		if (isDarkMode) {
			document.body.classList.add('markdown-dark-mode');
			if (btnDarkMode) {
				btnDarkMode.classList.add('active');
				btnDarkMode.title = 'Switch to Light Mode';
			}
		}
	}

	// Toggle dark mode
	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
		document.body.classList.toggle('markdown-dark-mode', isDarkMode);
		if (btnDarkMode) {
			btnDarkMode.classList.toggle('active', isDarkMode);
			btnDarkMode.title = isDarkMode ? 'Switch to Light Mode' : 'Toggle Dark Mode';
		}

		// Persist state
		vscode.setState({ ...vscode.getState(), darkMode: isDarkMode });
	}

	// Initialize sync toggle button - always visible for markdown
	function initSyncToggle() {
		if (btnSyncToggle) {
			updateSyncButtonState();
		}
	}

	// Update sync button visual state
	function updateSyncButtonState() {
		if (btnSyncToggle) {
			if (isSyncEnabled) {
				btnSyncToggle.classList.add('active');
				btnSyncToggle.classList.remove('sync-disabled');
				btnSyncToggle.title = 'Editor Sync Enabled (Click to disable)';
			} else {
				btnSyncToggle.classList.remove('active');
				btnSyncToggle.classList.add('sync-disabled');
				btnSyncToggle.title = 'Editor Sync Disabled (Click to enable)';
			}
		}
	}

	// Toggle sync enabled/disabled
	function toggleSync() {
		isSyncEnabled = !isSyncEnabled;
		updateSyncButtonState();
		vscode.setState({ ...vscode.getState(), syncEnabled: isSyncEnabled });
		// Notify extension about sync state change
		vscode.postMessage({ type: 'syncToggled', enabled: isSyncEnabled });
	}

	// Initialize
	initDarkMode();
	initSyncToggle();

	// Render markdown
	async function renderMarkdown() {
		try {
			if (!window.marked) {
				throw new Error('Marked.js not loaded');
			}

			// Configure marked
			window.marked.setOptions({
				gfm: true,
				breaks: false,
				highlight: function (code, lang) {
					if (window.hljs && lang && window.hljs.getLanguage(lang)) {
						try {
							return window.hljs.highlight(code, { language: lang }).value;
						} catch (err) {
							console.warn('Highlight error:', err);
						}
					}
					return code;
				}
			});

			const html = window.marked.parse(settings.markdownContent || '');

			if (loading) {
				loading.style.display = 'none';
			}
			if (container) {
				container.style.display = 'block';
			}
			if (content) {
				content.innerHTML = html;
			}

			vscode.postMessage({ type: 'ready' });
		} catch (err) {
			showError('Failed to render Markdown: ' + err.message);
			console.error('Markdown rendering error:', err);
		}
	}

	// Calculate fit scale
	function calculateFitScale(mode) {
		if (!content || !container) { return 1; }

		// Get the natural width of the content (without transform)
		content.style.transform = 'none';
		const contentWidth = content.scrollWidth;
		const contentHeight = content.scrollHeight;
		content.style.transform = `scale(${currentScale})`;

		const containerWidth = container.clientWidth - 60; // padding
		const containerHeight = container.clientHeight - 60;

		if (mode === 'fitWidth') {
			return containerWidth / contentWidth;
		} else if (mode === 'fitWindow') {
			return Math.min(containerWidth / contentWidth, containerHeight / contentHeight);
		}
		return 1;
	}

	// Update scale
	function updateScale(newScale) {
		if (newScale === 'fitWidth' || newScale === 'fitWindow') {
			currentScaleMode = newScale;
			currentScale = calculateFitScale(newScale);
		} else {
			currentScaleMode = 'numeric';
			currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
		}

		if (content) {
			content.style.transform = `scale(${currentScale})`;
			content.style.transformOrigin = 'top center';
		}

		// Update select
		if (zoomSelect) {
			if (currentScaleMode === 'fitWidth') {
				zoomSelect.value = 'fitWidth';
			} else if (currentScaleMode === 'fitWindow') {
				zoomSelect.value = 'fitWindow';
			} else {
				const scaleStr = currentScale.toString();
				const option = Array.from(zoomSelect.options).find(o => o.value === scaleStr);
				if (option) {
					zoomSelect.value = scaleStr;
				}
			}
		}

		// Update fit width button state
		updateFitWidthButtonState();

		vscode.postMessage({ type: 'scaleChanged', scale: currentScale, mode: currentScaleMode });
	}

	// Update fit width button active state
	function updateFitWidthButtonState() {
		if (btnFitWidth) {
			if (currentScaleMode === 'fitWidth') {
				btnFitWidth.classList.add('active');
			} else {
				btnFitWidth.classList.remove('active');
			}
		}
	}

	// Toggle fit width / 100%
	function toggleFitWidth() {
		if (currentScaleMode === 'fitWidth') {
			updateScale(1); // Switch to 100%
		} else {
			updateScale('fitWidth'); // Switch to fit width
		}
	}

	// Zoom functions
	function zoomIn() {
		let i = 0;
		for (; i < zoomLevels.length; ++i) {
			if (zoomLevels[i] > currentScale) { break; }
		}
		updateScale(zoomLevels[i] || MAX_SCALE);
	}

	function zoomOut() {
		let i = zoomLevels.length - 1;
		for (; i >= 0; --i) {
			if (zoomLevels[i] < currentScale) { break; }
		}
		updateScale(zoomLevels[i] || MIN_SCALE);
	}

	// Export to PDF - send request to extension
	function exportToPdf() {
		// Get the rendered HTML content
		const htmlContent = content ? content.innerHTML : '';
		vscode.postMessage({
			type: 'exportPdf',
			html: htmlContent
		});
	}

	// Event listeners
	if (btnZoomOut) {
		btnZoomOut.addEventListener('click', zoomOut);
	}
	if (btnZoomIn) {
		btnZoomIn.addEventListener('click', zoomIn);
	}
	if (zoomSelect) {
		zoomSelect.addEventListener('change', () => {
			const value = zoomSelect.value;
			if (value === 'fitWidth' || value === 'fitWindow') {
				updateScale(value);
			} else {
				updateScale(parseFloat(value));
			}
		});
	}
	if (btnFitWidth) {
		btnFitWidth.addEventListener('click', toggleFitWidth);
	}

	// Handle window resize for fit modes
	window.addEventListener('resize', () => {
		if (currentScaleMode === 'fitWidth' || currentScaleMode === 'fitWindow') {
			updateScale(currentScaleMode);
		}
	});
	if (btnDarkMode) {
		btnDarkMode.addEventListener('click', toggleDarkMode);
	}
	if (btnExportPdf) {
		btnExportPdf.addEventListener('click', exportToPdf);
	}
	if (btnSyncToggle) {
		btnSyncToggle.addEventListener('click', toggleSync);
	}

	// ==================== SEARCH/FIND FUNCTIONALITY ====================

	function toggleFindbar() {
		if (findbar && !findbar.classList.contains('hidden')) {
			closeFindbar();
		} else {
			openFindbar();
		}
	}

	function openFindbar() {
		if (findbar) {
			findbar.classList.remove('hidden');
			if (btnFind) {
				btnFind.classList.add('active');
			}
			if (findInput) {
				findInput.focus();
				findInput.select();
			}
		}
	}

	function closeFindbar() {
		if (findbar) {
			findbar.classList.add('hidden');
			if (btnFind) {
				btnFind.classList.remove('active');
			}
			clearSearchHighlights();
			updateSearchResultsCount(0, 0);
		}
	}

	function clearSearchHighlights() {
		// Remove all highlight marks
		const highlights = content?.querySelectorAll('.highlight');
		if (highlights) {
			highlights.forEach(highlight => {
				const parent = highlight.parentNode;
				if (parent) {
					parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
					parent.normalize();
				}
			});
		}
		currentMatchIndex = -1;
		totalMatches = 0;
		highlightedRanges = [];
	}

	function updateSearchResultsCount(current, total) {
		if (findResultsCount) {
			if (total === 0 && findInput && findInput.value.length > 0) {
				findResultsCount.textContent = 'No results';
				findResultsCount.classList.add('not-found');
			} else if (total > 0) {
				findResultsCount.textContent = `${current} of ${total}`;
				findResultsCount.classList.remove('not-found');
			} else {
				findResultsCount.textContent = '';
				findResultsCount.classList.remove('not-found');
			}
		}
	}

	function performSearch(query) {
		if (!query || !content) {
			clearSearchHighlights();
			updateSearchResultsCount(0, 0);
			lastSearchQuery = '';
			return;
		}

		lastSearchQuery = query;
		clearSearchHighlights();

		const matchCase = findMatchCase ? findMatchCase.checked : false;
		const searchQuery = matchCase ? query : query.toLowerCase();

		// Walk through text nodes and highlight matches
		const walker = document.createTreeWalker(
			content,
			NodeFilter.SHOW_TEXT,
			null
		);

		const nodesToHighlight = [];
		let node;
		while ((node = walker.nextNode())) {
			const text = node.textContent || '';
			const searchText = matchCase ? text : text.toLowerCase();
			let startIndex = 0;
			let foundIndex;

			while ((foundIndex = searchText.indexOf(searchQuery, startIndex)) !== -1) {
				nodesToHighlight.push({
					node: node,
					start: foundIndex,
					end: foundIndex + query.length
				});
				startIndex = foundIndex + 1;
			}
		}

		// Apply highlights
		// Process nodes in reverse order to avoid offset issues
		nodesToHighlight.reverse().forEach(match => {
			const textNode = match.node;
			const text = textNode.textContent || '';

			if (match.start >= 0 && match.end <= text.length) {
				const before = text.substring(0, match.start);
				const matched = text.substring(match.start, match.end);
				const after = text.substring(match.end);

				const span = document.createElement('span');
				span.className = 'highlight';
				span.textContent = matched;

				const parent = textNode.parentNode;
				if (parent) {
					const fragment = document.createDocumentFragment();
					if (before) {
						fragment.appendChild(document.createTextNode(before));
					}
					fragment.appendChild(span);
					if (after) {
						fragment.appendChild(document.createTextNode(after));
					}
					parent.replaceChild(fragment, textNode);
				}
			}
		});

		// Count total matches
		const allHighlights = content.querySelectorAll('.highlight');
		totalMatches = allHighlights.length;

		if (totalMatches > 0) {
			currentMatchIndex = 0;
			updateSearchResultsCount(1, totalMatches);
			updateHighlightVisibility();
			navigateToMatch(0);
		} else {
			currentMatchIndex = -1;
			updateSearchResultsCount(0, 0);
		}
	}

	function updateHighlightVisibility() {
		const highlightAll = findHighlightAll ? findHighlightAll.checked : true;
		const allHighlights = content?.querySelectorAll('.highlight');

		if (!allHighlights) { return; }

		allHighlights.forEach((highlight, index) => {
			if (highlightAll) {
				highlight.style.visibility = 'visible';
			} else {
				highlight.style.visibility = (index === currentMatchIndex) ? 'visible' : 'hidden';
			}
		});
	}

	function navigateToMatch(matchIndex) {
		if (totalMatches === 0 || matchIndex < 0 || !content) { return; }

		// Remove previous selection
		const prevSelected = content.querySelectorAll('.highlight.selected');
		prevSelected.forEach(el => el.classList.remove('selected'));

		const allHighlights = content.querySelectorAll('.highlight');
		if (!allHighlights || allHighlights.length === 0) { return; }

		const targetIndex = matchIndex % allHighlights.length;
		const targetHighlight = allHighlights[targetIndex];

		if (targetHighlight) {
			targetHighlight.classList.add('selected');
			updateHighlightVisibility();
			targetHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	function findNextMatch() {
		if (totalMatches === 0) { return; }
		currentMatchIndex = (currentMatchIndex + 1) % totalMatches;
		updateSearchResultsCount(currentMatchIndex + 1, totalMatches);
		navigateToMatch(currentMatchIndex);
	}

	function findPrevMatch() {
		if (totalMatches === 0) { return; }
		currentMatchIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
		updateSearchResultsCount(currentMatchIndex + 1, totalMatches);
		navigateToMatch(currentMatchIndex);
	}

	// Event listeners for find functionality
	if (btnFind) {
		btnFind.addEventListener('click', toggleFindbar);
	}

	if (findClose) {
		findClose.addEventListener('click', closeFindbar);
	}

	if (findInput) {
		let searchTimeout;
		findInput.addEventListener('input', () => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				performSearch(findInput.value);
			}, 300);
		});

		findInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				if (e.shiftKey) {
					findPrevMatch();
				} else {
					findNextMatch();
				}
			} else if (e.key === 'Escape') {
				closeFindbar();
			}
		});
	}

	if (findNext) {
		findNext.addEventListener('click', findNextMatch);
	}

	if (findPrev) {
		findPrev.addEventListener('click', findPrevMatch);
	}

	if (findHighlightAll) {
		findHighlightAll.checked = true;
		findHighlightAll.addEventListener('change', () => {
			updateHighlightVisibility();
		});
	}

	if (findMatchCase) {
		findMatchCase.addEventListener('change', () => {
			if (findInput && findInput.value) {
				performSearch(findInput.value);
			}
		});
	}

	// Handle messages from extension
	window.addEventListener('message', e => {
		switch (e.data.type) {
			case 'zoomIn':
				zoomIn();
				break;
			case 'zoomOut':
				zoomOut();
				break;
			case 'setScale':
				updateScale(e.data.scale);
				break;
			case 'toggleDarkMode':
				toggleDarkMode();
				break;
			case 'exportPdf':
				exportToPdf();
				break;
			case 'openFind':
				openFindbar();
				break;
			case 'closeFind':
				closeFindbar();
				break;
			case 'updateContent':
				if (e.data.content && content) {
					settings.markdownContent = e.data.content;
					renderMarkdown();
				}
				break;
			case 'scrollToPercent':
				scrollToPercent(e.data.percent);
				break;
			case 'scrollToLine':
				scrollToLine(e.data.line);
				break;
		}
	});

	// Scroll to a percentage of the document (editor → preview sync)
	let isScrollingFromExtension = false;

	function scrollToPercent(percent) {
		if (!container || !isSyncEnabled) { return; }
		isScrollingFromExtension = true;

		const maxScroll = container.scrollHeight - container.clientHeight;
		if (maxScroll > 0) {
			let targetScroll = Math.round(maxScroll * percent);

			if (findbar && !findbar.classList.contains('hidden')) {
				const findbarHeight = findbar.offsetHeight || 40;
				targetScroll = Math.min(maxScroll, targetScroll + findbarHeight);
			}

			container.scrollTo({
				top: targetScroll,
				behavior: 'smooth'
			});
		}

		// Reset flag after animation
		setTimeout(() => { isScrollingFromExtension = false; }, 100);
	}

	// Scroll to a specific line (approximate based on content height)
	function scrollToLine(line) {
		if (!container || !content || !isSyncEnabled) { return; }
		isScrollingFromExtension = true;

		// Try to find element with data-line attribute
		const lineElement = content.querySelector(`[data-line="${line}"]`);
		if (lineElement) {
			lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}

		// Reset flag after animation
		setTimeout(() => { isScrollingFromExtension = false; }, 100);
	}

	// Bidirectional sync: report scroll position to extension (preview → editor sync)
	let scrollReportTimeout;
	function reportScrollPosition() {
		if (!container || !isSyncEnabled || isScrollingFromExtension) { return; }

		clearTimeout(scrollReportTimeout);
		scrollReportTimeout = setTimeout(() => {
			const maxScroll = container.scrollHeight - container.clientHeight;
			if (maxScroll > 0) {
				const percent = container.scrollTop / maxScroll;
				vscode.postMessage({
					type: 'scrollChanged',
					percent: percent
				});
			}
		}, 50); // Debounce scroll reporting
	}

	// Listen for scroll events on container
	if (container) {
		container.addEventListener('scroll', reportScrollPosition);
	}

	// Keyboard shortcuts
	document.addEventListener('keydown', (e) => {
		const isInInput = e.target === findInput;

		// Ctrl+F or Cmd+F to open findbar
		if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
			e.preventDefault();
			openFindbar();
			return;
		}

		// Escape to close findbar
		if (e.key === 'Escape' && findbar && !findbar.classList.contains('hidden')) {
			e.preventDefault();
			closeFindbar();
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
			case 'p':
				if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
					e.preventDefault();
					exportToPdf();
				}
				break;
		}
	});

	// Mouse wheel zoom with Ctrl
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

	// Wait for marked.js to load then render
	async function init() {
		const maxWait = 5000;
		const start = Date.now();

		while (!window.marked && (Date.now() - start) < maxWait) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		if (!window.marked) {
			showError('Marked.js library not loaded');
			return;
		}

		// Also wait for highlight.js
		while (!window.hljs && (Date.now() - start) < maxWait) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		await renderMarkdown();
	}

	init().catch(err => {
		showError(err.message);
	});
})();

