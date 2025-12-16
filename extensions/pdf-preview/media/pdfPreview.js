/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use strict";

// This script is loaded as a module, PDF.js is loaded separately
// We need to wait for PDF.js to be available in the global scope

(async function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	function getSettings() {
		const element = document.getElementById('pdf-preview-settings');
		if (element) {
			const data = element.getAttribute('data-settings');
			if (data) {
				return JSON.parse(data);
			}
		}
		throw new Error('Could not load settings');
	}

	const settings = getSettings();
	const container = document.getElementById('pdf-container');
	const loading = document.getElementById('loading');
	const errorContainer = document.getElementById('error-container');
	const errorMessage = document.getElementById('error-message');

	// Toolbar elements
	const btnZoomOut = document.getElementById('btn-zoom-out');
	const btnZoomIn = document.getElementById('btn-zoom-in');
	const zoomSelect = document.getElementById('zoom-select');
	const btnPrevPage = document.getElementById('btn-prev-page');
	const btnNextPage = document.getElementById('btn-next-page');
	const pageInput = document.getElementById('page-input');
	const pageTotal = document.getElementById('page-total');
	// Rotate buttons commented out - functionality not needed
	// const btnRotateCW = document.getElementById('btn-rotate-cw');
	// const btnRotateCCW = document.getElementById('btn-rotate-ccw');
	const btnDownload = document.getElementById('btn-download');
	const btnFitWidth = document.getElementById('btn-fit-width');

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

	// Dark mode button
	const btnDarkMode = document.getElementById('btn-dark-mode');

	// Sync toggle button
	const btnSyncToggle = document.getElementById('btn-sync-toggle');

	// State
	let pdf = null;
	let currentPage = 1;
	let currentScale = 'fitWidth'; // Default to fit width mode
	let rotation = 0;
	let pageElements = [];
	let isRendering = false;

	const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
	const MIN_SCALE = 0.25;
	const MAX_SCALE = 5;

	// Search state
	let currentMatchIndex = -1;
	let totalMatches = 0;
	let lastSearchQuery = '';
	// Store original text content of spans for restoration
	const originalSpanTexts = new WeakMap();

	// Dark mode state - load from vscode state if available
	const state = vscode.getState() || {};
	let isDarkMode = state.darkMode || false;

	// Sync mode state: 'off', 'click', 'scroll'
	// Default depends on whether click sync is available
	// Uses stored state if available, otherwise defaults to 'click' when available
	let syncMode = state.syncMode !== undefined ? state.syncMode :
		(settings.enableSyncClick ? 'click' : 'off');

	// Initialize dark mode from saved state
	function initDarkMode() {
		if (isDarkMode) {
			document.body.classList.add('pdf-dark-mode');
			if (btnDarkMode) {
				btnDarkMode.classList.add('active');
				btnDarkMode.title = 'Switch to Light Mode';
			}
		}
	}

	// Toggle dark mode
	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
		document.body.classList.toggle('pdf-dark-mode', isDarkMode);
		if (btnDarkMode) {
			btnDarkMode.classList.toggle('active', isDarkMode);
			btnDarkMode.title = isDarkMode ? 'Switch to Light Mode' : 'Toggle Dark Mode';
		}

		// Persist state
		vscode.setState({ ...vscode.getState(), darkMode: isDarkMode });
	}

	// Initialize sync toggle button - show when sync is available
	function initSyncToggle() {
		if (settings.enableSyncClick && btnSyncToggle) {
			// Show the button when sync is available (LaTeX/Typst preview)
			btnSyncToggle.style.display = '';
			// Apply initial state
			updateSyncButtonState();
		}
	}

	// Update sync button visual state for 3 modes
	function updateSyncButtonState() {
		if (!btnSyncToggle) { return; }

		// Remove all mode classes
		btnSyncToggle.classList.remove('active', 'sync-disabled', 'sync-mode-click', 'sync-mode-scroll');

		switch (syncMode) {
			case 'off':
				btnSyncToggle.classList.add('sync-disabled');
				btnSyncToggle.title = 'Sync Disabled (Click to enable Click Sync)';
				btnSyncToggle.innerHTML = getSyncIcon('off');
				break;
			case 'click':
				btnSyncToggle.classList.add('active', 'sync-mode-click');
				btnSyncToggle.title = 'Click Sync Enabled (Click to switch to Scroll Sync)';
				btnSyncToggle.innerHTML = getSyncIcon('click');
				break;
			case 'scroll':
				btnSyncToggle.classList.add('active', 'sync-mode-scroll');
				btnSyncToggle.title = 'Scroll Sync Enabled (Click to disable)';
				btnSyncToggle.innerHTML = getSyncIcon('scroll');
				break;
		}
	}

	// Get SVG icon for sync mode
	function getSyncIcon(mode) {
		// Base sync/spinner icon
		const baseIcon = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';

		switch (mode) {
			case 'click':
				// Spinner icon only (no extra indicator)
				return baseIcon;
			case 'scroll':
				// Spinner icon with "A" (automatic) in bottom right corner
				return '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/><text x="17" y="23" font-size="10" font-weight="bold" font-family="sans-serif" fill="currentColor">A</text></svg>';
			default:
				return baseIcon;
		}
	}

	// Cycle through sync modes: off -> click -> scroll -> off
	function cycleSyncMode() {
		switch (syncMode) {
			case 'off':
				syncMode = 'click';
				break;
			case 'click':
				syncMode = 'scroll';
				break;
			case 'scroll':
				syncMode = 'off';
				break;
		}
		updateSyncButtonState();

		// Persist state
		vscode.setState({ ...vscode.getState(), syncMode: syncMode });

		// Notify extension about sync mode change
		vscode.postMessage({ type: 'syncModeChanged', mode: syncMode });
	}

	// Initialize dark mode on load
	initDarkMode();

	// Initialize sync toggle on load
	initSyncToggle();

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

	// Wait for pdfjsLib to be available (loaded by the other script tag)
	async function waitForPdfJs(maxWait = 5000) {
		const start = Date.now();
		while (!window.pdfjsLib && (Date.now() - start) < maxWait) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		if (!window.pdfjsLib) {
			throw new Error('PDF.js library not loaded');
		}
		return window.pdfjsLib;
	}

	// Initialize PDF.js worker
	async function initPdfJsWorker(pdfjsLib) {
		try {
			const workerResponse = await fetch(settings.pdfjsWorkerUrl);
			const workerBlob = await workerResponse.blob();
			const workerBlobUrl = URL.createObjectURL(workerBlob);
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;
		} catch (err) {
			console.error('Failed to load PDF.js worker:', err);
			pdfjsLib.GlobalWorkerOptions.workerSrc = settings.pdfjsWorkerUrl;
		}
	}

	// Load PDF
	async function loadPdf(pdfjsLib) {
		try {
			if (!settings.pdfUrl) {
				throw new Error('No PDF URL provided');
			}

			const loadingTask = pdfjsLib.getDocument(settings.pdfUrl);
			pdf = await loadingTask.promise;

			if (loading) {
				loading.style.display = 'none';
			}
			if (container) {
				container.style.display = 'block';
			}

			if (pageTotal) {
				pageTotal.textContent = pdf.numPages;
			}
			if (pageInput) {
				pageInput.value = '1';
			}
			currentPage = 1;

			vscode.postMessage({
				type: 'pageChanged',
				page: 1,
				totalPages: pdf.numPages
			});

			// Use renderWithFitScale to properly handle 'fitWidth' default
			await renderWithFitScale();

			// Initialize fit width button state (default is fitWidth)
			updateFitWidthButtonState();

			// Scroll to sync position if provided
			if (settings.syncPosition && settings.syncPosition.page) {
				goToPage(settings.syncPosition.page);
			}
		} catch (err) {
			showError('Failed to load PDF: ' + err.message);
			console.error('PDF loading error:', err);
		}
	}

	// Render all pages (legacy function - now delegates to renderWithFitScale)
	async function renderAllPages() {
		// Delegate to renderWithFitScale for consistent text layer rendering
		await renderWithFitScale();
	}

	// Update scale
	async function updateScale(newScale) {
		if (!pdf) { return; }

		if (newScale === 'fit' || newScale === 'fitWidth') {
			currentScale = newScale;
		} else {
			currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
		}

		// Update select if scale matches a preset
		if (zoomSelect) {
			const scaleStr = currentScale.toString();
			const option = Array.from(zoomSelect.options).find(o => o.value === scaleStr);
			if (option) {
				zoomSelect.value = scaleStr;
			} else if (typeof currentScale === 'number') {
				zoomSelect.value = currentScale <= 0.5 ? '0.5' : currentScale >= 3 ? '3' : '1.5';
			}
		}

		vscode.postMessage({ type: 'scaleChanged', scale: currentScale });

		await renderWithFitScale();

		// Update fit width button state
		updateFitWidthButtonState();
	}

	// Render with fit scale calculations
	async function renderWithFitScale() {
		if (!pdf || isRendering || !container) { return; }

		let scale = currentScale;

		if (currentScale === 'fit' || currentScale === 'fitWidth') {
			const firstPage = await pdf.getPage(1);
			const baseViewport = firstPage.getViewport({ scale: 1.0, rotation });
			const containerWidth = container.clientWidth - 40;
			const containerHeight = container.clientHeight - 40;

			if (currentScale === 'fitWidth') {
				scale = containerWidth / baseViewport.width;
			} else {
				scale = Math.min(containerWidth / baseViewport.width, containerHeight / baseViewport.height);
			}
		}

		const numericScale = scale;
		isRendering = true;
		container.innerHTML = '';
		pageElements = [];

		for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
			const page = await pdf.getPage(pageNum);
			const viewport = page.getViewport({ scale: numericScale, rotation });

			const pageDiv = document.createElement('div');
			pageDiv.className = 'pdf-page-container';
			if (settings.enableSyncClick) {
				pageDiv.classList.add('synctex-enabled');
			}
			pageDiv.style.width = viewport.width + 'px';
			pageDiv.style.height = viewport.height + 'px';
			pageDiv.dataset.pageNum = pageNum;

			// Create canvas wrapper for proper layering
			const canvasWrapper = document.createElement('div');
			canvasWrapper.className = 'canvasWrapper';

			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			canvas.height = viewport.height;
			canvas.width = viewport.width;

			canvasWrapper.appendChild(canvas);
			pageDiv.appendChild(canvasWrapper);

			// Create text layer for text selection
			const textLayerDiv = document.createElement('div');
			textLayerDiv.className = 'textLayer';

			// Add click handler for SyncTeX on the text layer (it's on top)
			if (settings.enableSyncClick) {
				textLayerDiv.addEventListener('click', (e) => {
					// Only trigger SyncTeX if sync mode is 'click' and no text is selected
					if (syncMode !== 'click') {
						return;
					}
					const selection = window.getSelection();
					if (selection && selection.toString().length > 0) {
						return;
					}
					const rect = pageDiv.getBoundingClientRect();
					const x = (e.clientX - rect.left) / numericScale;
					const y = (e.clientY - rect.top) / numericScale;

					// Try to extract text content from clicked position for source mapping
					let clickedText = '';
					const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
					if (clickedElement) {
						// Check if we clicked on a text span in the text layer
						if (clickedElement.closest('.textLayer')) {
							clickedText = clickedElement.textContent || '';
							// If span text is too short, try to get parent/sibling text
							if (clickedText.length < 3) {
								const parent = clickedElement.parentElement;
								if (parent) {
									clickedText = parent.textContent || '';
								}
							}
						}
						// If still no text, try to get text from nearby elements
						if (!clickedText || clickedText.length < 2) {
							const textSpans = textLayerDiv.querySelectorAll('span');
							for (const span of textSpans) {
								const spanRect = span.getBoundingClientRect();
								// Check if click is within or near this span
								if (e.clientX >= spanRect.left - 5 && e.clientX <= spanRect.right + 5 &&
									e.clientY >= spanRect.top - 5 && e.clientY <= spanRect.bottom + 5) {
									clickedText = span.textContent || '';
									break;
								}
							}
						}
					}

					vscode.postMessage({
						type: 'syncClick',
						page: pageNum,
						x: x,
						y: y,
						text: clickedText.trim().substring(0, 200)
					});
				});
				textLayerDiv.classList.add('synctex-enabled');
			}

			pageDiv.appendChild(textLayerDiv);

			const pageOverlay = document.createElement('div');
			pageOverlay.className = 'page-number-overlay';
			pageOverlay.textContent = pageNum;

			pageDiv.appendChild(pageOverlay);
			container.appendChild(pageDiv);

			// Render the canvas
			await page.render({
				canvasContext: context,
				viewport: viewport
			}).promise;

			// Render the text layer for text selection
			try {
				const textContent = await page.getTextContent();

				// Set CSS variables for proper scaling
				textLayerDiv.style.setProperty('--scale-factor', numericScale);

				// Use PDF.js renderTextLayer API
				const textLayerTask = window.pdfjsLib.renderTextLayer({
					textContentSource: textContent,
					container: textLayerDiv,
					viewport: viewport
				});

				await textLayerTask.promise;
			} catch (textErr) {
				console.warn('Failed to render text layer for page ' + pageNum + ':', textErr);
			}

			pageElements.push({ page, viewport, element: pageDiv, canvas, scale: numericScale });
		}

		isRendering = false;
	}

	// Zoom functions
	function zoomIn() {
		if (typeof currentScale !== 'number') {
			updateScale(1.5);
			return;
		}
		let i = 0;
		for (; i < zoomLevels.length; ++i) {
			if (zoomLevels[i] > currentScale) { break; }
		}
		updateScale(zoomLevels[i] || MAX_SCALE);
	}

	function zoomOut() {
		if (typeof currentScale !== 'number') {
			updateScale(1.0);
			return;
		}
		let i = zoomLevels.length - 1;
		for (; i >= 0; --i) {
			if (zoomLevels[i] < currentScale) { break; }
		}
		updateScale(zoomLevels[i] || MIN_SCALE);
	}

	// Page navigation
	function goToPage(pageNum) {
		if (!pdf) { return; }
		const targetPage = Math.max(1, Math.min(pageNum, pdf.numPages));
		currentPage = targetPage;
		if (pageInput) {
			pageInput.value = targetPage;
		}

		if (container) {
			const pageElement = container.querySelector(`[data-page-num="${targetPage}"]`);
			if (pageElement) {
				pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}

		vscode.postMessage({
			type: 'pageChanged',
			page: currentPage,
			totalPages: pdf.numPages
		});
	}

	function prevPage() {
		goToPage(currentPage - 1);
	}

	function nextPage() {
		goToPage(currentPage + 1);
	}

	// Rotation
	function rotate(degrees) {
		rotation = (rotation + degrees + 360) % 360;
		renderWithFitScale();
	}

	// Download
	async function download() {
		if (!settings.pdfUrl) { return; }

		try {
			if (settings.pdfUrl.startsWith('data:')) {
				const link = document.createElement('a');
				link.href = settings.pdfUrl;
				link.download = 'document.pdf';
				link.click();
			} else {
				const response = await fetch(settings.pdfUrl);
				const blob = await response.blob();
				const blobUrl = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = blobUrl;
				link.download = 'document.pdf';
				link.click();
				setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
			}
		} catch (err) {
			console.error('Failed to download PDF:', err);
		}
	}

	// Toggle fit to width / 100%
	function toggleFitWidth() {
		if (currentScale === 'fitWidth') {
			updateScale(1); // Switch to 100%
		} else {
			updateScale('fitWidth'); // Switch to fit width
		}
	}

	// Update fit width button active state
	function updateFitWidthButtonState() {
		if (btnFitWidth) {
			if (currentScale === 'fitWidth') {
				btnFitWidth.classList.add('active');
			} else {
				btnFitWidth.classList.remove('active');
			}
		}
	}

	// Scroll sync: report scroll position for preview → editor sync
	// Master-slave model: only report scroll if user is interacting with preview (mouse is over it)
	let scrollReportTimeout;
	let isMouseOverPreview = false;

	// Track mouse position to determine who is master
	if (container) {
		container.addEventListener('mouseenter', () => { isMouseOverPreview = true; });
		container.addEventListener('mouseleave', () => { isMouseOverPreview = false; });
	}

	function reportScrollPosition() {
		// Only report if: sync is scroll mode AND user is interacting with preview (mouse is over it)
		// If mouse is NOT over preview, the scroll was triggered by the editor, so don't report back
		if (!container || syncMode !== 'scroll' || !isMouseOverPreview) { return; }

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

	// Track scroll to update current page and report position
	if (container) {
		container.addEventListener('scroll', () => {
			if (!pdf || pageElements.length === 0) { return; }

			const scrollTop = container.scrollTop;
			const containerHeight = container.clientHeight;
			const scrollMiddle = scrollTop + containerHeight / 2;

			for (let i = 0; i < pageElements.length; i++) {
				const pageElement = pageElements[i].element;
				const pageTop = pageElement.offsetTop;
				const pageHeight = pageElement.offsetHeight;

				if (scrollMiddle >= pageTop && scrollMiddle < pageTop + pageHeight) {
					const newPage = i + 1;
					if (newPage !== currentPage) {
						currentPage = newPage;
						if (pageInput) {
							pageInput.value = newPage;
						}
						vscode.postMessage({
							type: 'pageChanged',
							page: currentPage,
							totalPages: pdf.numPages
						});
					}
					break;
				}
			}

			// Report scroll position for bidirectional sync
			reportScrollPosition();
		});
	}

	// Event listeners - add null checks for all toolbar elements
	if (btnZoomOut) {
		btnZoomOut.addEventListener('click', zoomOut);
	}
	if (btnZoomIn) {
		btnZoomIn.addEventListener('click', zoomIn);
	}
	if (zoomSelect) {
		zoomSelect.addEventListener('change', () => {
			const value = zoomSelect.value;
			if (value === 'fit' || value === 'fitWidth') {
				updateScale(value);
			} else {
				updateScale(parseFloat(value));
			}
		});
	}
	if (btnPrevPage) {
		btnPrevPage.addEventListener('click', prevPage);
	}
	if (btnNextPage) {
		btnNextPage.addEventListener('click', nextPage);
	}
	if (pageInput) {
		pageInput.addEventListener('change', () => {
			const pageNum = parseInt(pageInput.value, 10);
			if (!isNaN(pageNum)) {
				goToPage(pageNum);
			}
		});
	}
	// Rotate buttons commented out - functionality not needed
	// btnRotateCW.addEventListener('click', () => rotate(90));
	// btnRotateCCW.addEventListener('click', () => rotate(-90));
	if (btnDownload) {
		btnDownload.addEventListener('click', download);
	}
	if (btnFitWidth) {
		btnFitWidth.addEventListener('click', toggleFitWidth);
	}

	// Dark mode toggle
	if (btnDarkMode) {
		btnDarkMode.addEventListener('click', toggleDarkMode);
	}

	// Sync toggle - cycle through modes
	if (btnSyncToggle) {
		btnSyncToggle.addEventListener('click', cycleSyncMode);
	}

	// ==================== SEARCH/FIND FUNCTIONALITY ====================

	// Toggle findbar
	function toggleFindbar() {
		if (findbar && !findbar.classList.contains('hidden')) {
			closeFindbar();
		} else {
			openFindbar();
		}
	}

	// Open findbar
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

	// Close findbar
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

	// Clear all search highlights and restore original span content
	function clearSearchHighlights() {
		const textLayers = document.querySelectorAll('.textLayer');
		textLayers.forEach(textLayer => {
			const spans = textLayer.querySelectorAll(':scope > span');
			spans.forEach(span => {
				// Restore original text if we have it saved
				const originalText = originalSpanTexts.get(span);
				if (originalText !== undefined) {
					span.textContent = originalText;
				}
			});
		});
		currentMatchIndex = -1;
		totalMatches = 0;
	}

	// Update search results count display
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

	// Perform search across all pages
	function performSearch(query) {
		if (!pdf || !query) {
			clearSearchHighlights();
			updateSearchResultsCount(0, 0);
			lastSearchQuery = '';
			return;
		}

		// Store the query first so highlighting can use it
		lastSearchQuery = query;

		// Clear previous highlights
		clearSearchHighlights();

		// Always apply highlights to count total matches
		applyHighlightsToAllPages();

		// Count total matches by counting highlighted spans
		const allHighlights = container?.querySelectorAll('.textLayer .highlight');
		totalMatches = allHighlights ? allHighlights.length : 0;

		// Update count and navigate to first match
		if (totalMatches > 0) {
			currentMatchIndex = 0;
			updateSearchResultsCount(1, totalMatches);

			// Apply visibility based on highlightAll setting
			updateHighlightVisibility();
			navigateToMatch(0);
		} else {
			currentMatchIndex = -1;
			updateSearchResultsCount(0, 0);
		}
	}

	// Update highlight visibility based on "Highlight all" checkbox
	function updateHighlightVisibility() {
		const highlightAll = findHighlightAll ? findHighlightAll.checked : true;
		const allHighlights = container?.querySelectorAll('.textLayer .highlight');

		if (!allHighlights) {return;}

		allHighlights.forEach((highlight, index) => {
			if (highlightAll) {
				// Show all highlights
				highlight.style.visibility = 'visible';
			} else {
				// Only show the current match
				highlight.style.visibility = (index === currentMatchIndex) ? 'visible' : 'hidden';
			}
		});
	}

	// Apply highlights to text layer spans
	function applyHighlightsToAllPages() {
		if (!lastSearchQuery) {return;}

		const matchCase = findMatchCase ? findMatchCase.checked : false;
		const query = lastSearchQuery;

		// Search directly in each page's text layer spans
		const pageContainers = container?.querySelectorAll('.pdf-page-container');
		if (!pageContainers) {return;}

		pageContainers.forEach(pageContainer => {
			const textLayer = pageContainer.querySelector('.textLayer');
			if (!textLayer) {return;}

			// Get only direct span children (not our highlight spans)
			const spans = textLayer.querySelectorAll(':scope > span');

			spans.forEach(span => {
				highlightTextInSpan(span, query, matchCase);
			});
		});
	}

	// Highlight specific text within a span by wrapping matches in highlight elements
	// Following PDF.js approach: save original text, clear span, rebuild with highlights
	function highlightTextInSpan(span, query, matchCase) {
		// Get original text (either from cache or current content)
		let originalText = originalSpanTexts.get(span);
		if (originalText === undefined) {
			originalText = span.textContent || '';
			originalSpanTexts.set(span, originalText);
		}

		const textToSearch = matchCase ? originalText : originalText.toLowerCase();
		const searchQuery = matchCase ? query : query.toLowerCase();

		// Check if this span contains the search query
		if (!textToSearch.includes(searchQuery)) {
			return 0;
		}

		// Find all match positions
		const matches = [];
		let startIndex = 0;
		let foundIndex;

		while ((foundIndex = textToSearch.indexOf(searchQuery, startIndex)) !== -1) {
			matches.push({
				start: foundIndex,
				end: foundIndex + query.length
			});
			startIndex = foundIndex + 1;
		}

		if (matches.length === 0) {return 0;}

		// Clear span content (PDF.js approach)
		span.textContent = '';

		// Rebuild content with highlights
		let lastEnd = 0;

		matches.forEach(match => {
			// Add text before the match as TextNode
			if (match.start > lastEnd) {
				span.appendChild(document.createTextNode(originalText.substring(lastEnd, match.start)));
			}

			// Add the highlighted match as span (PDF.js uses "highlight appended" class)
			const highlightSpan = document.createElement('span');
			highlightSpan.className = 'highlight appended';
			highlightSpan.appendChild(document.createTextNode(originalText.substring(match.start, match.end)));
			span.appendChild(highlightSpan);

			lastEnd = match.end;
		});

		// Add remaining text after last match
		if (lastEnd < originalText.length) {
			span.appendChild(document.createTextNode(originalText.substring(lastEnd)));
		}

		return matches.length;
	}

	// Navigate to a specific match
	function navigateToMatch(matchIndex) {
		if (totalMatches === 0 || matchIndex < 0) {return;}

		// Remove previous selection
		const prevSelected = document.querySelectorAll('.textLayer .highlight.selected');
		prevSelected.forEach(el => el.classList.remove('selected'));

		// Get all highlights in document order
		const allHighlights = container?.querySelectorAll('.textLayer .highlight');
		if (!allHighlights || allHighlights.length === 0) {return;}

		// Wrap around if needed
		const targetIndex = matchIndex % allHighlights.length;
		const targetHighlight = allHighlights[targetIndex];

		if (targetHighlight) {
			targetHighlight.classList.add('selected');

			// Update visibility based on highlightAll setting
			updateHighlightVisibility();

			// Scroll the highlight into view
			targetHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	// Find next match
	function findNextMatch() {
		if (totalMatches === 0) {return;}

		currentMatchIndex = (currentMatchIndex + 1) % totalMatches;
		updateSearchResultsCount(currentMatchIndex + 1, totalMatches);
		navigateToMatch(currentMatchIndex);
	}

	// Find previous match
	function findPrevMatch() {
		if (totalMatches === 0) {return;}

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
			// Debounce search
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
		findHighlightAll.checked = true; // Default to highlight all
		findHighlightAll.addEventListener('change', () => {
			// Just update visibility, no need to re-search
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

	// Save current view state (for preserving state during PDF updates)
	function saveViewState() {
		if (!container) { return null; }
		return {
			scrollTop: container.scrollTop,
			scrollLeft: container.scrollLeft,
			scale: currentScale,
			page: currentPage,
			rotation: rotation
		};
	}

	// Restore view state after PDF reload
	function restoreViewState(state) {
		if (!state || !container) { return; }

		// Restore scroll position after a short delay to ensure pages are rendered
		setTimeout(() => {
			container.scrollTop = state.scrollTop;
			container.scrollLeft = state.scrollLeft;
		}, 50);
	}

	// Reload PDF with new data while preserving state
	async function reloadPdfWithData(base64Data) {
		if (!window.pdfjsLib) {
			showError('PDF.js not loaded');
			return;
		}

		// Save current state
		const viewState = saveViewState();

		try {
			// Convert base64 to data URL
			const pdfUrl = `data:application/pdf;base64,${base64Data}`;

			// Load new PDF
			const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
			pdf = await loadingTask.promise;

			if (pageTotal) {
				pageTotal.textContent = pdf.numPages;
			}

			// Restore scale before rendering
			if (viewState && typeof viewState.scale === 'number') {
				currentScale = viewState.scale;
			}
			if (viewState) {
				rotation = viewState.rotation || 0;
			}

			await renderWithFitScale();

			// Restore view state
			restoreViewState(viewState);

			vscode.postMessage({
				type: 'pageChanged',
				page: currentPage,
				totalPages: pdf.numPages
			});
		} catch (err) {
			showError('Failed to reload PDF: ' + err.message);
			console.error('PDF reload error:', err);
		}
	}

	// Handle messages from extension
	// Note: No origin check needed - VS Code webview messages come from extension host
	// and the communication channel is already secure by design
	window.addEventListener('message', e => {
		switch (e.data.type) {
			case 'zoomIn':
				zoomIn();
				break;
			case 'zoomOut':
				zoomOut();
				break;
			case 'fitWidth':
				updateScale('fitWidth');
				break;
			case 'fitPage':
				updateScale('fit');
				break;
			case 'goToPage':
				goToPage(e.data.page);
				break;
			case 'setScale':
				updateScale(e.data.scale);
				break;
			case 'rotate':
				rotation = e.data.rotation;
				renderWithFitScale();
				break;
			case 'download':
				download();
				break;
			case 'toggleDarkMode':
				toggleDarkMode();
				break;
			case 'updatePdf':
				// Update PDF with new data while preserving view state
				if (e.data.pdfData) {
					reloadPdfWithData(e.data.pdfData);
				}
				break;
			case 'openFind':
				openFindbar();
				break;
			case 'closeFind':
				closeFindbar();
				break;
		case 'scrollToPercent':
			scrollToPercent(e.data.percent, e.data.source);
			break;
		case 'scrollToText':
			scrollToText(e.data.text, e.data.source);
			break;
		}
	});

	// Scroll to a percentage of the document (for source-to-preview sync)
	// source: 'click' or 'scroll' - must match syncMode to process
	function scrollToPercent(percent, source) {
		// Only process if sync is enabled and source matches mode
		// If no source specified, accept any (backwards compatibility)
		if (!container || syncMode === 'off') { return; }
		if (source && source !== syncMode) { return; }

		const maxScroll = container.scrollHeight - container.clientHeight;
		if (maxScroll > 0) {
			let targetScroll = Math.round(maxScroll * percent);

			// If findbar is open, add offset to ensure content isn't hidden behind it
			if (findbar && !findbar.classList.contains('hidden')) {
				const findbarHeight = findbar.offsetHeight || 40;
				// Add offset so the target position isn't hidden behind the findbar
				targetScroll = Math.min(maxScroll, targetScroll + findbarHeight);
			}

			container.scrollTo({
				top: targetScroll,
				behavior: 'smooth'
			});
		}
		// No need for timeout - master-slave model prevents feedback loop via mouse position
	}

	/**
	 * Scroll to text by searching in the PDF's text layer
	 * This provides accurate source-to-preview sync by finding actual text content
	 * source: 'click' or 'scroll' - must match syncMode to process
	 */
	function scrollToText(searchText, source) {
		// Only process if sync is enabled and source matches mode
		if (!container || !searchText || syncMode === 'off') { return; }
		if (source && source !== syncMode) { return; }

		// Normalize the search text
		const normalizedSearch = searchText.trim().toLowerCase();
		if (normalizedSearch.length < 3) { return; }

		// Search in all text layers
		const textLayers = container.querySelectorAll('.textLayer');
		let foundElement = null;
		let bestMatch = null;
		let bestMatchLength = 0;

		for (const textLayer of textLayers) {
			const spans = textLayer.querySelectorAll('span');
			for (const span of spans) {
				const spanText = (span.textContent || '').toLowerCase();

				// Check for exact match
				if (spanText.includes(normalizedSearch)) {
					foundElement = span;
					break;
				}

				// Track partial matches (first few words)
				const searchWords = normalizedSearch.split(/\s+/).slice(0, 3).join(' ');
				if (searchWords.length >= 5 && spanText.includes(searchWords) && searchWords.length > bestMatchLength) {
					bestMatch = span;
					bestMatchLength = searchWords.length;
				}
			}
			if (foundElement) { break; }
		}

		// Use best match if no exact match found
		const targetElement = foundElement || bestMatch;

		if (targetElement) {
			// Get the element's position relative to the container
			const elementRect = targetElement.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();

			// Calculate scroll position to center the element
			let targetScroll = container.scrollTop + (elementRect.top - containerRect.top) - (container.clientHeight / 3);

			// If findbar is open, adjust offset
			if (findbar && !findbar.classList.contains('hidden')) {
				const findbarHeight = findbar.offsetHeight || 40;
				targetScroll += findbarHeight;
			}

			container.scrollTo({
				top: Math.max(0, targetScroll),
				behavior: 'smooth'
			});
		}
		// No need for timeout - master-slave model prevents feedback loop via mouse position
	}

	// Keyboard shortcuts
	document.addEventListener('keydown', (e) => {
		// Allow typing in input fields except for specific shortcuts
		const isInInput = e.target === pageInput || e.target === findInput;

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
			case 'PageUp':
				e.preventDefault();
				prevPage();
				break;
			case 'PageDown':
				e.preventDefault();
				nextPage();
				break;
			case 'Home':
				e.preventDefault();
				goToPage(1);
				break;
			case 'End':
				if (pdf) {
					e.preventDefault();
					goToPage(pdf.numPages);
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

	// Initialize
	try {
		const pdfjsLib = await waitForPdfJs();
		await initPdfJsWorker(pdfjsLib);
		await loadPdf(pdfjsLib);
	} catch (err) {
		showError(err.message);
	}
})();
