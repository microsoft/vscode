/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use strict";

// This script is loaded as a module, PDF.js is loaded separately
// Shared preview utilities are loaded from sharedPreview.js

(async function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	// Wait for shared preview utilities to load
	// @ts-ignore
	while (!window.createSharedPreview) {
		await new Promise(resolve => setTimeout(resolve, 10));
	}

	// Get settings first to determine sync capabilities
	function getSettingsInternal() {
		const element = document.getElementById('pdf-preview-settings');
		if (element) {
			const data = element.getAttribute('data-settings');
			if (data) {
				return JSON.parse(data);
			}
		}
		throw new Error('Could not load settings');
	}

	const settings = getSettingsInternal();

	// Create shared preview utilities
	// @ts-ignore
	const shared = window.createSharedPreview(vscode, 'pdf-dark-mode', settings.enableSyncClick);

	// Get DOM elements
	const container = document.getElementById('pdf-container');
	const loading = document.getElementById('loading');
	const errorContainer = document.getElementById('error-container');
	const errorMessage = document.getElementById('error-message');

	// Toolbar elements
	const btnZoomOut = document.getElementById('btn-zoom-out');
	const btnZoomIn = document.getElementById('btn-zoom-in');
	const zoomSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('zoom-select'));
	const btnPrevPage = document.getElementById('btn-prev-page');
	const btnNextPage = document.getElementById('btn-next-page');
	const pageInput = /** @type {HTMLInputElement|null} */ (document.getElementById('page-input'));
	const pageTotal = document.getElementById('page-total');
	const btnDownload = document.getElementById('btn-download');
	const btnFitWidth = document.getElementById('btn-fit-width');
	const btnFind = document.getElementById('btn-find');
	const btnDarkMode = document.getElementById('btn-dark-mode');
	const btnSyncToggle = document.getElementById('btn-sync-toggle');

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

	// PDF-specific state
	let pdf = null;
	let currentPage = 1;
	let currentScale = 'fitWidth';
	let rotation = 0;
	let pageElements = [];
	let isRendering = false;

	// Search state - store original text content of spans for restoration
	const originalSpanTexts = new WeakMap();

	// Initialize shared features
	shared.initDarkMode(elements);
	shared.initSyncToggle(elements);
	shared.setupMouseTracking(container);

	// ==================== PDF.js INITIALIZATION ====================

	async function waitForPdfJs(maxWait = 5000) {
		const start = Date.now();
		// @ts-ignore
		while (!window.pdfjsLib && (Date.now() - start) < maxWait) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		// @ts-ignore
		if (!window.pdfjsLib) {
			throw new Error('PDF.js library not loaded');
		}
		// @ts-ignore
		return window.pdfjsLib;
	}

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

	// ==================== PDF LOADING ====================

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

			await renderWithFitScale();
			shared.updateFitWidthButtonState(elements, currentScale === 'fitWidth');

			if (settings.syncPosition && settings.syncPosition.page) {
				goToPage(settings.syncPosition.page);
			}
		} catch (err) {
			shared.showError('Failed to load PDF: ' + err.message, elements);
			console.error('PDF loading error:', err);
		}
	}

	// ==================== RENDERING ====================

	async function updateScale(newScale) {
		if (!pdf) { return; }

		if (newScale === 'fit' || newScale === 'fitWidth') {
			currentScale = newScale;
		} else {
			currentScale = shared.clampScale(newScale);
		}

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
		shared.updateFitWidthButtonState(elements, currentScale === 'fitWidth');
	}

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

			// Add click handler for SyncTeX
			if (settings.enableSyncClick) {
				textLayerDiv.addEventListener('click', (e) => {
					if (shared.state.syncMode !== 'click') { return; }
					const selection = window.getSelection();
					if (selection && selection.toString().length > 0) { return; }

					const rect = pageDiv.getBoundingClientRect();
					const x = (e.clientX - rect.left) / numericScale;
					const y = (e.clientY - rect.top) / numericScale;

					let clickedText = '';
					const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
					if (clickedElement) {
						if (clickedElement.closest('.textLayer')) {
							clickedText = clickedElement.textContent || '';
							if (clickedText.length < 3) {
								const parent = clickedElement.parentElement;
								if (parent) {
									clickedText = parent.textContent || '';
								}
							}
						}
						if (!clickedText || clickedText.length < 2) {
							const textSpans = textLayerDiv.querySelectorAll('span');
							for (const span of textSpans) {
								const spanRect = span.getBoundingClientRect();
								if (e.clientX >= spanRect.left - 5 && e.clientX <= spanRect.right + 5 &&
									e.clientY >= spanRect.top - 5 && e.clientY <= spanRect.bottom + 5) {
									clickedText = span.textContent || '';
									break;
								}
							}
						}
					}

					shared.markPreviewInitiatedSync();
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

			await page.render({
				canvasContext: context,
				viewport: viewport
			}).promise;

			// Render text layer
			try {
				const textContent = await page.getTextContent();
				textLayerDiv.style.setProperty('--scale-factor', numericScale);

				// @ts-ignore
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

	// ==================== ZOOM FUNCTIONS ====================

	function zoomIn() {
		updateScale(shared.getZoomInLevel(currentScale));
	}

	function zoomOut() {
		updateScale(shared.getZoomOutLevel(currentScale));
	}

	function toggleFitWidth() {
		if (currentScale === 'fitWidth') {
			updateScale(1);
		} else {
			updateScale('fitWidth');
		}
	}

	// ==================== PAGE NAVIGATION ====================

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

	// ==================== DOWNLOAD ====================

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

	// ==================== SEARCH FUNCTIONALITY ====================

	function clearSearchHighlights() {
		const textLayers = document.querySelectorAll('.textLayer');
		textLayers.forEach(textLayer => {
			const spans = textLayer.querySelectorAll(':scope > span');
			spans.forEach(span => {
				const originalText = originalSpanTexts.get(span);
				if (originalText !== undefined) {
					span.textContent = originalText;
				}
			});
		});
		shared.state.currentMatchIndex = -1;
		shared.state.totalMatches = 0;
	}

	function performSearch(query) {
		if (!pdf || !query) {
			clearSearchHighlights();
			shared.updateSearchResultsCount(elements, 0, 0);
			shared.state.lastSearchQuery = '';
			return;
		}

		shared.state.lastSearchQuery = query;
		clearSearchHighlights();
		applyHighlightsToAllPages();

		const allHighlights = container?.querySelectorAll('.textLayer .highlight');
		shared.state.totalMatches = allHighlights ? allHighlights.length : 0;

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
		const allHighlights = container?.querySelectorAll('.textLayer .highlight');

		if (!allHighlights) { return; }

		allHighlights.forEach((highlight, index) => {
			if (highlightAll) {
				/** @type {HTMLElement} */ (highlight).style.visibility = 'visible';
			} else {
				/** @type {HTMLElement} */ (highlight).style.visibility = (index === shared.state.currentMatchIndex) ? 'visible' : 'hidden';
			}
		});
	}

	function applyHighlightsToAllPages() {
		if (!shared.state.lastSearchQuery) { return; }

		const matchCase = findMatchCase ? findMatchCase.checked : false;
		const query = shared.state.lastSearchQuery;

		const pageContainers = container?.querySelectorAll('.pdf-page-container');
		if (!pageContainers) { return; }

		pageContainers.forEach(pageContainer => {
			const textLayer = pageContainer.querySelector('.textLayer');
			if (!textLayer) { return; }

			const spans = textLayer.querySelectorAll(':scope > span');
			spans.forEach(span => {
				highlightTextInSpan(span, query, matchCase);
			});
		});
	}

	function highlightTextInSpan(span, query, matchCase) {
		let originalText = originalSpanTexts.get(span);
		if (originalText === undefined) {
			originalText = span.textContent || '';
			originalSpanTexts.set(span, originalText);
		}

		const textToSearch = matchCase ? originalText : originalText.toLowerCase();
		const searchQuery = matchCase ? query : query.toLowerCase();

		if (!textToSearch.includes(searchQuery)) {
			return 0;
		}

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

		if (matches.length === 0) { return 0; }

		span.textContent = '';

		let lastEnd = 0;
		matches.forEach(match => {
			if (match.start > lastEnd) {
				span.appendChild(document.createTextNode(originalText.substring(lastEnd, match.start)));
			}

			const highlightSpan = document.createElement('span');
			highlightSpan.className = 'highlight appended';
			highlightSpan.appendChild(document.createTextNode(originalText.substring(match.start, match.end)));
			span.appendChild(highlightSpan);

			lastEnd = match.end;
		});

		if (lastEnd < originalText.length) {
			span.appendChild(document.createTextNode(originalText.substring(lastEnd)));
		}

		return matches.length;
	}

	function navigateToMatch(matchIndex) {
		if (shared.state.totalMatches === 0 || matchIndex < 0) { return; }

		const prevSelected = document.querySelectorAll('.textLayer .highlight.selected');
		prevSelected.forEach(el => el.classList.remove('selected'));

		const allHighlights = container?.querySelectorAll('.textLayer .highlight');
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

	function scrollToText(searchText, source) {
		if (!container || !searchText || !shared.shouldProcessScroll(source)) { return; }

		const normalizedSearch = searchText.trim().toLowerCase();
		if (normalizedSearch.length < 3) { return; }

		const textLayers = container.querySelectorAll('.textLayer');
		let foundElement = null;
		let bestMatch = null;
		let bestMatchLength = 0;

		for (const textLayer of textLayers) {
			const spans = textLayer.querySelectorAll('span');
			for (const span of spans) {
				const spanText = (span.textContent || '').toLowerCase();

				if (spanText.includes(normalizedSearch)) {
					foundElement = span;
					break;
				}

				const searchWords = normalizedSearch.split(/\s+/).slice(0, 3).join(' ');
				if (searchWords.length >= 5 && spanText.includes(searchWords) && searchWords.length > bestMatchLength) {
					bestMatch = span;
					bestMatchLength = searchWords.length;
				}
			}
			if (foundElement) { break; }
		}

		const targetElement = foundElement || bestMatch;

		if (targetElement) {
			const elementRect = targetElement.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();

			let targetScroll = container.scrollTop + (elementRect.top - containerRect.top) - (container.clientHeight / 3);

			if (findbar && !findbar.classList.contains('hidden')) {
				const findbarHeight = findbar.offsetHeight || 40;
				targetScroll += findbarHeight;
			}

			container.scrollTo({
				top: Math.max(0, targetScroll),
				behavior: 'smooth'
			});
		}
	}

	// ==================== PDF STATE MANAGEMENT ====================

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

	function restoreViewState(state) {
		if (!state || !container) { return; }
		setTimeout(() => {
			container.scrollTop = state.scrollTop;
			container.scrollLeft = state.scrollLeft;
		}, 50);
	}

	async function reloadPdfWithData(base64Data) {
		// @ts-ignore
		if (!window.pdfjsLib) {
			shared.showError('PDF.js not loaded', elements);
			return;
		}

		const viewState = saveViewState();

		try {
			const pdfUrl = `data:application/pdf;base64,${base64Data}`;
			// @ts-ignore
			const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
			pdf = await loadingTask.promise;

			if (pageTotal) {
				pageTotal.textContent = pdf.numPages;
			}

			if (viewState && typeof viewState.scale === 'number') {
				currentScale = viewState.scale;
			}
			if (viewState) {
				rotation = viewState.rotation || 0;
			}

			await renderWithFitScale();
			restoreViewState(viewState);

			vscode.postMessage({
				type: 'pageChanged',
				page: currentPage,
				totalPages: pdf.numPages
			});
		} catch (err) {
			shared.showError('Failed to reload PDF: ' + err.message, elements);
			console.error('PDF reload error:', err);
		}
	}

	// ==================== EVENT LISTENERS ====================

	// Toolbar buttons
	if (btnZoomOut) { btnZoomOut.addEventListener('click', zoomOut); }
	if (btnZoomIn) { btnZoomIn.addEventListener('click', zoomIn); }
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
	if (btnPrevPage) { btnPrevPage.addEventListener('click', prevPage); }
	if (btnNextPage) { btnNextPage.addEventListener('click', nextPage); }
	if (pageInput) {
		pageInput.addEventListener('change', () => {
			const pageNum = parseInt(pageInput.value, 10);
			if (!isNaN(pageNum)) {
				goToPage(pageNum);
			}
		});
	}
	if (btnDownload) { btnDownload.addEventListener('click', download); }
	if (btnFitWidth) { btnFitWidth.addEventListener('click', toggleFitWidth); }
	if (btnDarkMode) { btnDarkMode.addEventListener('click', () => shared.toggleDarkMode(elements)); }
	if (btnSyncToggle) { btnSyncToggle.addEventListener('click', () => shared.cycleSyncMode(elements)); }

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

			reportScrollPosition();
		});
	}

	// Keyboard shortcuts and wheel zoom
	shared.setupKeyboardShortcuts(elements, clearSearchHighlights, zoomIn, zoomOut, pageInput);
	shared.setupWheelZoom(container, zoomIn, zoomOut);

	// PDF-specific keyboard shortcuts
	document.addEventListener('keydown', (e) => {
		const isInInput = e.target === pageInput || e.target === findInput;
		if (isInInput) { return; }

		switch (e.key) {
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

	// ==================== MESSAGE HANDLING ====================

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
				shared.toggleDarkMode(elements);
				break;
			case 'updatePdf':
				if (e.data.pdfData) {
					reloadPdfWithData(e.data.pdfData);
				}
				break;
			case 'openFind':
				shared.openFindbar(elements);
				break;
			case 'closeFind':
				shared.closeFindbar(elements, clearSearchHighlights);
				break;
			case 'scrollToPercent':
				scrollToPercent(e.data.percent, e.data.source);
				break;
			case 'scrollToText':
				scrollToText(e.data.text, e.data.source);
				break;
		}
	});

	// ==================== INITIALIZATION ====================

	try {
		const pdfjsLib = await waitForPdfJs();
		await initPdfJsWorker(pdfjsLib);
		await loadPdf(pdfjsLib);
	} catch (err) {
		shared.showError(err.message, elements);
	}
})();
