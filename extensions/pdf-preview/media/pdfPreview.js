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

	// Dark mode button
	const btnDarkMode = document.getElementById('btn-dark-mode');

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

	// Dark mode state - load from vscode state if available
	const state = vscode.getState() || {};
	let isDarkMode = state.darkMode || false;

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

	// Initialize dark mode on load
	initDarkMode();

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

			// Scroll to sync position if provided
			if (settings.syncPosition && settings.syncPosition.page) {
				goToPage(settings.syncPosition.page);
			}
		} catch (err) {
			showError('Failed to load PDF: ' + err.message);
			console.error('PDF loading error:', err);
		}
	}

	// Render all pages
	async function renderAllPages() {
		if (!pdf || isRendering || !container) { return; }
		isRendering = true;

		container.innerHTML = '';
		pageElements = [];

		for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
			const page = await pdf.getPage(pageNum);
			const viewport = page.getViewport({ scale: currentScale, rotation });

			const pageDiv = document.createElement('div');
			pageDiv.className = 'pdf-page-container';
			if (settings.enableSyncClick) {
				pageDiv.classList.add('synctex-enabled');
			}
			pageDiv.style.width = viewport.width + 'px';
			pageDiv.style.height = viewport.height + 'px';
			pageDiv.dataset.pageNum = pageNum;

			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			canvas.height = viewport.height;
			canvas.width = viewport.width;

			// Add click handler for SyncTeX
			if (settings.enableSyncClick) {
				canvas.addEventListener('click', (e) => {
					const rect = canvas.getBoundingClientRect();
					const x = (e.clientX - rect.left) / currentScale;
					const y = (e.clientY - rect.top) / currentScale;
					vscode.postMessage({
						type: 'syncClick',
						page: pageNum,
						x: x,
						y: y
					});
				});
			}

			// Add page number overlay
			const pageOverlay = document.createElement('div');
			pageOverlay.className = 'page-number-overlay';
			pageOverlay.textContent = pageNum;

			pageDiv.appendChild(canvas);
			pageDiv.appendChild(pageOverlay);
			container.appendChild(pageDiv);

			await page.render({
				canvasContext: context,
				viewport: viewport
			}).promise;

			pageElements.push({ page, viewport, element: pageDiv, canvas });
		}

		isRendering = false;
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

			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			canvas.height = viewport.height;
			canvas.width = viewport.width;

			// Add click handler for SyncTeX
			if (settings.enableSyncClick) {
				canvas.addEventListener('click', (e) => {
					const rect = canvas.getBoundingClientRect();
					const x = (e.clientX - rect.left) / numericScale;
					const y = (e.clientY - rect.top) / numericScale;
					vscode.postMessage({
						type: 'syncClick',
						page: pageNum,
						x: x,
						y: y
					});
				});
			}

			const pageOverlay = document.createElement('div');
			pageOverlay.className = 'page-number-overlay';
			pageOverlay.textContent = pageNum;

			pageDiv.appendChild(canvas);
			pageDiv.appendChild(pageOverlay);
			container.appendChild(pageDiv);

			await page.render({
				canvasContext: context,
				viewport: viewport
			}).promise;

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

	// Fit to width
	function fitWidth() {
		updateScale('fitWidth');
	}

	// Track scroll to update current page
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
		btnFitWidth.addEventListener('click', fitWidth);
	}

	// Dark mode toggle
	if (btnDarkMode) {
		btnDarkMode.addEventListener('click', toggleDarkMode);
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
		}
	});

	// Keyboard shortcuts
	document.addEventListener('keydown', (e) => {
		if (pageInput && e.target === pageInput) { return; }

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
