/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use strict";

// Shared preview utilities are loaded from sharedPreview.js

(async function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	// Wait for shared preview utilities to load
	// @ts-ignore
	while (!window.createSharedPreview) {
		await new Promise(resolve => setTimeout(resolve, 10));
	}

	// Get settings first
	function getSettingsInternal() {
		const element = document.getElementById('markdown-preview-settings');
		if (element) {
			const data = element.getAttribute('data-settings');
			if (data) {
				return JSON.parse(data);
			}
		}
		throw new Error('Could not load settings');
	}

	const settings = getSettingsInternal();

	// Create shared preview utilities - markdown always has sync available
	// @ts-ignore
	const shared = window.createSharedPreview(vscode, 'markdown-dark-mode', settings.enableSyncClick);

	// Set default sync mode to 'scroll' for markdown if not already set
	const savedState = vscode.getState() || {};
	if (savedState.syncMode === undefined) {
		shared.state.syncMode = 'scroll';
	}

	// Get DOM elements
	const container = document.getElementById('markdown-container');
	const content = document.getElementById('markdown-content');
	const loading = document.getElementById('loading');
	const errorContainer = document.getElementById('error-container');
	const errorMessage = document.getElementById('error-message');

	// Toolbar elements
	const btnZoomOut = document.getElementById('btn-zoom-out');
	const btnZoomIn = document.getElementById('btn-zoom-in');
	const zoomSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('zoom-select'));
	const btnDarkMode = document.getElementById('btn-dark-mode');
	const btnExportPdf = document.getElementById('btn-export-pdf');
	const btnSyncToggle = document.getElementById('btn-sync-toggle');
	const btnFitWidth = document.getElementById('btn-fit-width');
	const btnFind = document.getElementById('btn-find');

	// Find/Search elements
	const findbar = document.getElementById('findbar');
	const findInput = /** @type {HTMLInputElement|null} */ (document.getElementById('find-input'));
	const findPrev = document.getElementById('find-prev');
	const findNext = document.getElementById('find-next');
	const findHighlightAll = /** @type {HTMLInputElement|null} */ (document.getElementById('find-highlight-all'));
	const findMatchCase = /** @type {HTMLInputElement|null} */ (document.getElementById('find-match-case'));
	const findResultsCount = document.getElementById('find-results-count');
	const findClose = document.getElementById('find-close');

	/** @type {import('./sharedPreview.js').SharedPreviewElements} */
	const elements = {
		container,
		loading,
		errorContainer,
		errorMessage,
		btnDarkMode,
		btnSyncToggle,
		btnFind,
		findbar,
		findInput,
		findPrev,
		findNext,
		findHighlightAll,
		findMatchCase,
		findResultsCount,
		findClose,
		btnZoomIn,
		btnZoomOut,
		zoomSelect,
		btnFitWidth
	};

	// Markdown-specific state
	let currentScale = 1;
	let currentScaleMode = 'numeric'; // 'numeric', 'fitWidth', 'fitWindow'

	// Initialize shared features
	shared.initDarkMode(elements);
	shared.initSyncToggle(elements, true); // Always show sync toggle for markdown
	shared.setupMouseTracking(container);

	// ==================== MARKDOWN RENDERING ====================

	async function renderMarkdown() {
		try {
			// @ts-ignore
			if (!window.marked) {
				throw new Error('Marked.js not loaded');
			}

			// @ts-ignore
			window.marked.setOptions({
				gfm: true,
				breaks: false,
				highlight: function (code, lang) {
					// @ts-ignore
					if (window.hljs && lang && window.hljs.getLanguage(lang)) {
						try {
							// @ts-ignore
							return window.hljs.highlight(code, { language: lang }).value;
						} catch (err) {
							console.warn('Highlight error:', err);
						}
					}
					return code;
				}
			});

			// @ts-ignore
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
			shared.showError('Failed to render Markdown: ' + err.message, elements);
			console.error('Markdown rendering error:', err);
		}
	}

	// ==================== ZOOM FUNCTIONS ====================

	function calculateFitScale(mode) {
		if (!content || !container) { return 1; }

		// Get the natural width of the content (without transform)
		content.style.transform = 'none';
		const contentWidth = content.scrollWidth;
		const contentHeight = content.scrollHeight;
		content.style.transform = `scale(${currentScale})`;

		const containerWidth = container.clientWidth - 60;
		const containerHeight = container.clientHeight - 60;

		if (mode === 'fitWidth') {
			return containerWidth / contentWidth;
		} else if (mode === 'fitWindow') {
			return Math.min(containerWidth / contentWidth, containerHeight / contentHeight);
		}
		return 1;
	}

	function updateScale(newScale) {
		if (newScale === 'fitWidth' || newScale === 'fitWindow') {
			currentScaleMode = newScale;
			currentScale = calculateFitScale(newScale);
		} else {
			currentScaleMode = 'numeric';
			currentScale = shared.clampScale(newScale);
		}

		if (content) {
			content.style.transform = `scale(${currentScale})`;
			content.style.transformOrigin = 'top center';
		}

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

		shared.updateFitWidthButtonState(elements, currentScaleMode === 'fitWidth');
		vscode.postMessage({ type: 'scaleChanged', scale: currentScale, mode: currentScaleMode });
	}

	function toggleFitWidth() {
		if (currentScaleMode === 'fitWidth') {
			updateScale(1);
		} else {
			updateScale('fitWidth');
		}
	}

	function zoomIn() {
		updateScale(shared.getZoomInLevel(currentScale));
	}

	function zoomOut() {
		updateScale(shared.getZoomOutLevel(currentScale));
	}

	// ==================== EXPORT PDF ====================

	function exportToPdf() {
		const htmlContent = content ? content.innerHTML : '';
		vscode.postMessage({
			type: 'exportPdf',
			html: htmlContent
		});
	}

	// ==================== SEARCH FUNCTIONALITY ====================

	function clearSearchHighlights() {
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
		shared.state.currentMatchIndex = -1;
		shared.state.totalMatches = 0;
	}

	function performSearch(query) {
		if (!query || !content) {
			clearSearchHighlights();
			shared.updateSearchResultsCount(elements, 0, 0);
			shared.state.lastSearchQuery = '';
			return;
		}

		shared.state.lastSearchQuery = query;
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

		// Apply highlights (process in reverse order to avoid offset issues)
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

		const allHighlights = content.querySelectorAll('.highlight');
		shared.state.totalMatches = allHighlights.length;

		if (shared.state.totalMatches > 0) {
			shared.state.currentMatchIndex = 0;
			shared.updateSearchResultsCount(elements, 1, shared.state.totalMatches);
			updateHighlightVisibility();
			navigateToMatch(0);
		} else {
			shared.state.currentMatchIndex = -1;
			shared.updateSearchResultsCount(elements, 0, 0);
		}
	}

	function updateHighlightVisibility() {
		const highlightAll = findHighlightAll ? findHighlightAll.checked : true;
		const allHighlights = content?.querySelectorAll('.highlight');

		if (!allHighlights) { return; }

		allHighlights.forEach((highlight, index) => {
			if (highlightAll) {
				/** @type {HTMLElement} */ (highlight).style.visibility = 'visible';
			} else {
				/** @type {HTMLElement} */ (highlight).style.visibility = (index === shared.state.currentMatchIndex) ? 'visible' : 'hidden';
			}
		});
	}

	function navigateToMatch(matchIndex) {
		if (shared.state.totalMatches === 0 || matchIndex < 0 || !content) { return; }

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
		if (shared.state.totalMatches === 0) { return; }
		shared.state.currentMatchIndex = (shared.state.currentMatchIndex + 1) % shared.state.totalMatches;
		shared.updateSearchResultsCount(elements, shared.state.currentMatchIndex + 1, shared.state.totalMatches);
		navigateToMatch(shared.state.currentMatchIndex);
	}

	function findPrevMatch() {
		if (shared.state.totalMatches === 0) { return; }
		shared.state.currentMatchIndex = (shared.state.currentMatchIndex - 1 + shared.state.totalMatches) % shared.state.totalMatches;
		shared.updateSearchResultsCount(elements, shared.state.currentMatchIndex + 1, shared.state.totalMatches);
		navigateToMatch(shared.state.currentMatchIndex);
	}

	// ==================== SCROLL SYNC ====================

	let scrollReportTimeout;
	function reportScrollPosition() {
		if (!container || !shared.shouldReportScroll()) { return; }

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
		}, 50);
	}

	function scrollToPercent(percent, source) {
		if (!container || !shared.shouldProcessScroll(source)) { return; }

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
	}

	function scrollToLine(line, source) {
		if (!container || !content || !shared.shouldProcessScroll(source)) { return; }

		const lineElement = content.querySelector(`[data-line="${line}"]`);
		if (lineElement) {
			lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	// ==================== CLICK SYNC ====================

	if (content) {
		content.addEventListener('click', (e) => {
			if (shared.state.syncMode !== 'click') { return; }

			const selection = window.getSelection();
			if (selection && selection.toString().length > 0) { return; }

			let clickedText = '';
			const clickedElement = /** @type {HTMLElement} */ (e.target);
			if (clickedElement) {
				clickedText = clickedElement.textContent || '';
				if (clickedText.length < 3 && clickedElement.parentElement) {
					clickedText = clickedElement.parentElement.textContent || '';
				}
			}

			const contentRect = content.getBoundingClientRect();
			const clickY = e.clientY - contentRect.top + container.scrollTop;
			const totalHeight = content.scrollHeight;
			const percent = totalHeight > 0 ? clickY / totalHeight : 0;

			shared.markPreviewInitiatedSync();

			vscode.postMessage({
				type: 'syncClick',
				percent: percent,
				text: clickedText.trim().substring(0, 200)
			});
		});
	}

	// ==================== EVENT LISTENERS ====================

	// Toolbar buttons
	if (btnZoomOut) { btnZoomOut.addEventListener('click', zoomOut); }
	if (btnZoomIn) { btnZoomIn.addEventListener('click', zoomIn); }
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
	if (btnFitWidth) { btnFitWidth.addEventListener('click', toggleFitWidth); }
	if (btnDarkMode) { btnDarkMode.addEventListener('click', () => shared.toggleDarkMode(elements)); }
	if (btnExportPdf) { btnExportPdf.addEventListener('click', exportToPdf); }
	if (btnSyncToggle) { btnSyncToggle.addEventListener('click', () => shared.cycleSyncMode(elements)); }

	// Handle window resize for fit modes
	window.addEventListener('resize', () => {
		if (currentScaleMode === 'fitWidth' || currentScaleMode === 'fitWindow') {
			updateScale(currentScaleMode);
		}
	});

	// Findbar
	if (btnFind) { btnFind.addEventListener('click', () => shared.toggleFindbar(elements, clearSearchHighlights)); }
	if (findClose) { findClose.addEventListener('click', () => shared.closeFindbar(elements, clearSearchHighlights)); }
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
				shared.closeFindbar(elements, clearSearchHighlights);
			}
		});
	}
	if (findNext) { findNext.addEventListener('click', findNextMatch); }
	if (findPrev) { findPrev.addEventListener('click', findPrevMatch); }
	if (findHighlightAll) {
		findHighlightAll.checked = true;
		findHighlightAll.addEventListener('change', updateHighlightVisibility);
	}
	if (findMatchCase) {
		findMatchCase.addEventListener('change', () => {
			if (findInput && findInput.value) {
				performSearch(findInput.value);
			}
		});
	}

	// Scroll tracking
	if (container) {
		container.addEventListener('scroll', reportScrollPosition);
	}

	// Keyboard shortcuts and wheel zoom
	shared.setupKeyboardShortcuts(elements, clearSearchHighlights, zoomIn, zoomOut);
	shared.setupWheelZoom(container, zoomIn, zoomOut);

	// Markdown-specific keyboard shortcut for export
	document.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
			e.preventDefault();
			exportToPdf();
		}
	});

	// ==================== MESSAGE HANDLING ====================

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
				shared.toggleDarkMode(elements);
				break;
			case 'exportPdf':
				exportToPdf();
				break;
			case 'openFind':
				shared.openFindbar(elements);
				break;
			case 'closeFind':
				shared.closeFindbar(elements, clearSearchHighlights);
				break;
			case 'updateContent':
				if (e.data.content && content) {
					settings.markdownContent = e.data.content;
					renderMarkdown();
				}
				break;
			case 'scrollToPercent':
				scrollToPercent(e.data.percent, e.data.source);
				break;
			case 'scrollToLine':
				scrollToLine(e.data.line, e.data.source);
				break;
		}
	});

	// ==================== INITIALIZATION ====================

	async function init() {
		const maxWait = 5000;
		const start = Date.now();

		// @ts-ignore
		while (!window.marked && (Date.now() - start) < maxWait) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		// @ts-ignore
		if (!window.marked) {
			shared.showError('Marked.js library not loaded', elements);
			return;
		}

		// @ts-ignore
		while (!window.hljs && (Date.now() - start) < maxWait) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		await renderMarkdown();
	}

	init().catch(err => {
		shared.showError(err.message, elements);
	});
})();
