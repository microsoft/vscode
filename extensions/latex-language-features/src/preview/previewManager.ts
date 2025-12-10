/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from '../utils/logger';

/**
 * Manages LaTeX PDF preview in webview panels
 * Based on LaTeX-Workshop patterns with SyncTeX support
 */
export class PreviewManager implements vscode.Disposable {
	private previewPanels = new Map<string, vscode.WebviewPanel>();
	private texUriMap = new Map<string, vscode.Uri>(); // Map panel keys to tex URIs
	private texContentMap = new Map<string, string>(); // Map panel keys to tex file content

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly logger: OutputChannelLogger
	) { }

	/**
	 * Show preview and optionally sync to a specific position
	 */
	async showPreview(texUri: vscode.Uri, pdfPath: string, pdfData?: Uint8Array, position?: vscode.Position): Promise<void> {
		const key = texUri.toString();
		let panel = this.previewPanels.get(key);

		// Load LaTeX source content for better SyncTeX accuracy
		let texContent = this.texContentMap.get(key);
		if (!texContent) {
			try {
				const document = await vscode.workspace.openTextDocument(texUri);
				texContent = document.getText();
				this.texContentMap.set(key, texContent);
			} catch (error) {
				this.logger.warn(`Failed to load LaTeX source for SyncTeX: ${error}`);
			}
		}

		// Get base name from URI
		const uriPath = texUri.path;
		const lastSlash = uriPath.lastIndexOf('/');
		const fileName = lastSlash >= 0 ? uriPath.substring(lastSlash + 1) : uriPath;

		if (panel) {
			panel.reveal();
			// Only reload PDF if the path/data has changed or position is explicitly provided
			// Don't reload when just switching back to the preview
			const storedPdfPath = (panel as { _pdfPath?: string })._pdfPath || '';
			const storedPdfData = (panel as { _pdfData?: Uint8Array })._pdfData;

			// Check if PDF has changed (path changed or data changed)
			const pdfPathChanged = storedPdfPath !== pdfPath;
			const pdfDataChanged = storedPdfData !== pdfData;

			// Only reload if PDF changed or position is explicitly provided (sync request)
			if (pdfPathChanged || pdfDataChanged || position !== undefined) {
				await this.loadPdfInWebview(panel, pdfPath, pdfData, position, texUri);
				// Update stored values
				(panel as { _pdfPath?: string })._pdfPath = pdfPath;
				(panel as { _pdfData?: Uint8Array })._pdfData = pdfData;
			}
		} else {
			// Get PDF URI
			const pdfUri = typeof pdfPath === 'string' && pdfPath.startsWith('file://')
				? vscode.Uri.parse(pdfPath)
				: typeof pdfPath === 'string'
					? vscode.Uri.file(pdfPath)
					: pdfPath as vscode.Uri;

			// Get directory URI for local resource roots
			const pdfDirUri = vscode.Uri.joinPath(pdfUri, '..');

			panel = vscode.window.createWebviewPanel(
				'latexPreview',
				`LaTeX Preview: ${fileName}`,
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					localResourceRoots: [
						vscode.Uri.joinPath(this.context.extensionUri, 'media'),
						vscode.Uri.joinPath(this.context.extensionUri, 'vendors'),
						pdfDirUri
					]
				}
			);

			panel.onDidDispose(() => {
				this.previewPanels.delete(key);
				this.texUriMap.delete(key);
				this.texContentMap.delete(key);
			});

			// Set up message handling for SyncTeX
			const currentPanel = panel; // Capture panel for closure
			panel.webview.onDidReceiveMessage(
				async (message) => {
					switch (message.type) {
						case 'syncFromPdf':
							await this.syncFromPdf(texUri, message.line, message.column);
							break;
						case 'refresh': {
							// Get stored pdfPath and pdfData
							const storedPdfPath = (currentPanel as { _pdfPath?: string })._pdfPath || pdfPath;
							const storedPdfData = (currentPanel as { _pdfData?: Uint8Array })._pdfData || pdfData;
							await this.loadPdfInWebview(currentPanel, storedPdfPath, storedPdfData, undefined, texUri);
							break;
						}
					}
				},
				null,
				this.context.subscriptions
			);

			// Store pdfPath and pdfData for refresh
			(panel as { _pdfPath?: string; _pdfData?: Uint8Array })._pdfPath = pdfPath;
			(panel as { _pdfPath?: string; _pdfData?: Uint8Array })._pdfData = pdfData;

			this.previewPanels.set(key, panel);
			this.texUriMap.set(key, texUri);

			// Load PDF after panel is created
			await this.loadPdfInWebview(panel, pdfPath, pdfData, position, texUri);
		}
	}

	/**
	 * Sync from source to PDF (SyncTeX forward)
	 */
	async syncFromSource(texUri: vscode.Uri, position: vscode.Position): Promise<void> {
		const key = texUri.toString();
		const panel = this.previewPanels.get(key);
		if (!panel) {
			// Preview not open, open it first (will sync automatically via position parameter)
			await this.showPreview(texUri, '', undefined, position);
			return;
		}

		// Send sync message to webview
		panel.webview.postMessage({
			type: 'syncFromSource',
			line: position.line + 1, // PDF.js uses 1-based line numbers
			column: position.character + 1
		});
	}

	/**
	 * Sync from PDF to source (SyncTeX backward)
	 */
	private async syncFromPdf(texUri: vscode.Uri, line: number, column: number): Promise<void> {
		try {
			const document = await vscode.workspace.openTextDocument(texUri);
			const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
			const editor = await vscode.window.showTextDocument(document);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
			this.logger.info(`Synced to source: line ${line}, column ${column}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to sync from PDF: ${message}`);
		}
	}

	private async loadPdfInWebview(panel: vscode.WebviewPanel, pdfPath: string, pdfData?: Uint8Array, position?: vscode.Position, texUri?: vscode.Uri): Promise<void> {
		// If PDF data is provided, use it directly (from WASM compilation)
		// Otherwise, try to load from file path
		let pdfUri: vscode.Uri | undefined;
		if (!pdfData) {
			// Convert local file path to webview URI
			pdfUri = typeof pdfPath === 'string' && pdfPath.startsWith('file://')
				? panel.webview.asWebviewUri(vscode.Uri.parse(pdfPath))
				: typeof pdfPath === 'string'
					? panel.webview.asWebviewUri(vscode.Uri.file(pdfPath))
					: panel.webview.asWebviewUri(pdfPath as vscode.Uri);
		}

		// Get LaTeX content for SyncTeX
		let texContent = '';
		if (texUri) {
			const key = texUri.toString();
			texContent = this.texContentMap.get(key) || '';
		}

		// Create HTML content with PDF viewer
		const html = this.getPdfViewerHtml(panel, pdfUri, pdfData, position, texContent);
		panel.webview.html = html;

		this.logger.info(`Preview loaded: ${pdfData ? 'from data' : pdfPath}`);
	}

	private getPdfViewerHtml(panel: vscode.WebviewPanel, pdfUri: vscode.Uri | undefined, pdfData?: Uint8Array, position?: vscode.Position, texContent?: string): string {
		const nonce = this.getNonce();
		const cspSource = panel.webview.cspSource;

		// Get PDF.js URIs if available
		const pdfjsUri = vscode.Uri.joinPath(this.context.extensionUri, 'vendors', 'pdfjs', 'pdf.min.mjs');
		const pdfjsWorkerUri = vscode.Uri.joinPath(this.context.extensionUri, 'vendors', 'pdfjs', 'pdf.worker.min.mjs');
		const pdfjsViewerCssUri = vscode.Uri.joinPath(this.context.extensionUri, 'vendors', 'pdfjs', 'pdf_viewer.css');

		const pdfjsUriWebview = panel.webview.asWebviewUri(pdfjsUri);
		const pdfjsWorkerUriWebview = panel.webview.asWebviewUri(pdfjsWorkerUri);
		const pdfjsViewerCssUriWebview = panel.webview.asWebviewUri(pdfjsViewerCssUri);

		// Convert PDF data to base64 data URL if provided
		let pdfDataUrl = '';
		if (pdfData) {
			// Convert Uint8Array to base64 efficiently without spreading
			// Spreading large arrays can cause "Maximum call stack size exceeded"
			// Use a loop to build the binary string character by character
			let binaryString = '';
			for (let i = 0; i < pdfData.length; i++) {
				binaryString += String.fromCharCode(pdfData[i]);
			}
			const base64 = btoa(binaryString);
			pdfDataUrl = `data:application/pdf;base64,${base64}`;
		}

		// SyncTeX position (if provided)
		const syncLine = position ? position.line + 1 : undefined;
		const syncColumn = position ? position.character + 1 : undefined;

		// Escape LaTeX content for embedding in JavaScript
		const texContentEscaped = texContent ? JSON.stringify(texContent) : 'null';

		// Use PDF.js for proper rendering with correct CSP
		// Fix CSP to allow PDF.js worker script
		// allow-any-unicode-next-line
		const zoomOutChar = '−';
		// allow-any-unicode-next-line
		const prevPageChar = '◀';
		// allow-any-unicode-next-line
		const nextPageChar = '▶';
		// allow-any-unicode-next-line
		const refreshChar = '↻';
		// allow-any-unicode-next-line
		const downloadChar = '⬇';
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${cspSource}; style-src ${cspSource} 'unsafe-inline'; connect-src data: ${cspSource} https:; worker-src blob: ${cspSource}; child-src blob:;">
	<link rel="stylesheet" href="${pdfjsViewerCssUriWebview}">
	<style nonce="${nonce}">
		html, body {
			margin: 0;
			padding: 0;
			height: 100%;
			width: 100%;
			overflow: hidden;
			background: var(--vscode-editor-background);
		}
		body {
			display: flex;
			flex-direction: column;
		}
		#toolbar {
			position: sticky;
			top: 0;
			z-index: 1000;
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			background: var(--vscode-titleBar-activeBackground);
			border-bottom: 1px solid var(--vscode-panel-border);
			flex-shrink: 0;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		}
		.toolbar-group {
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 0 8px;
			border-right: 1px solid var(--vscode-panel-border);
		}
		.toolbar-group:last-child {
			border-right: none;
			margin-left: auto;
		}
		.toolbar-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 4px 8px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: 1px solid var(--vscode-button-border);
			border-radius: 2px;
			cursor: pointer;
			font-size: 12px;
			min-width: 28px;
			height: 28px;
		}
		.toolbar-button:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.toolbar-button:active {
			background: var(--vscode-button-secondaryActiveBackground);
		}
		.toolbar-button.active {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.toolbar-button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		.toolbar-input {
			padding: 4px 8px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			font-size: 12px;
			width: 60px;
			height: 28px;
			box-sizing: border-box;
		}
		.toolbar-label {
			color: var(--vscode-foreground);
			font-size: 12px;
			margin: 0 4px;
		}
		#pdf-container {
			flex: 1;
			width: 100%;
			overflow: auto;
			padding: 20px;
			box-sizing: border-box;
			min-height: 0;
			position: relative;
		}
		.pdf-page-container {
			position: relative;
			margin: 0 auto 20px auto;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		}
		.pdf-page-container canvas {
			display: block;
		}
		#loading {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			text-align: center;
			padding: 2rem;
			color: var(--vscode-foreground);
			z-index: 1;
		}
		#error {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			text-align: center;
			padding: 2rem;
			color: var(--vscode-errorForeground);
			display: none;
			z-index: 1;
		}
	</style>
</head>
<body>
	<div id="toolbar">
		<div class="toolbar-group">
			<button class="toolbar-button" id="btn-zoom-out" title="Zoom Out">${zoomOutChar}</button>
			<span class="toolbar-label" id="zoom-level">150%</span>
			<button class="toolbar-button" id="btn-zoom-in" title="Zoom In">+</button>
		</div>
		<div class="toolbar-group">
			<button class="toolbar-button" id="btn-fit-width" title="Fit to Width">Fit Width</button>
			<button class="toolbar-button" id="btn-fit-page" title="Fit to Page">Fit Page</button>
			<button class="toolbar-button" id="btn-actual-size" title="Actual Size">100%</button>
		</div>
		<div class="toolbar-group">
			<button class="toolbar-button" id="btn-prev-page" title="Previous Page">${prevPageChar}</button>
			<input type="text" class="toolbar-input" id="page-input" value="1" title="Page number">
			<span class="toolbar-label" id="page-total">/ 1</span>
			<button class="toolbar-button" id="btn-next-page" title="Next Page">${nextPageChar}</button>
		</div>
		<div class="toolbar-group">
			<button class="toolbar-button" id="btn-refresh" title="Refresh">${refreshChar}</button>
			<button class="toolbar-button" id="btn-download" title="Download PDF">${downloadChar}</button>
		</div>
	</div>
	<div id="loading">Loading PDF...</div>
	<div id="error"></div>
	<div id="pdf-container" style="display: none;"></div>
	
	<script type="module" nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		import * as pdfjsLib from "${pdfjsUriWebview}";
		
		const pdfUrl = ${pdfDataUrl ? `"${pdfDataUrl}"` : pdfUri ? `"${pdfUri}"` : 'null'};
		const container = document.getElementById('pdf-container');
		const loading = document.getElementById('loading');
		const error = document.getElementById('error');
		const syncLine = ${syncLine !== undefined ? syncLine : 'undefined'};
		const syncColumn = ${syncColumn !== undefined ? syncColumn : 'undefined'};
		const texContent = ${texContentEscaped};
		
		// Toolbar elements
		const btnZoomOut = document.getElementById('btn-zoom-out');
		const btnZoomIn = document.getElementById('btn-zoom-in');
		const btnFitWidth = document.getElementById('btn-fit-width');
		const btnFitPage = document.getElementById('btn-fit-page');
		const btnActualSize = document.getElementById('btn-actual-size');
		const btnPrevPage = document.getElementById('btn-prev-page');
		const btnNextPage = document.getElementById('btn-next-page');
		const pageInput = document.getElementById('page-input');
		const pageTotal = document.getElementById('page-total');
		const zoomLevel = document.getElementById('zoom-level');
		const btnRefresh = document.getElementById('btn-refresh');
		const btnDownload = document.getElementById('btn-download');
		
		// State
		let pdf = null;
		let currentPage = 1;
		let currentScale = 1.5;
		let synctexEnabled = false; // SyncTeX disabled
		let pageElements = [];
		
		// Handle messages from extension host
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'syncFromSource':
					// Scroll to specific line/column in PDF
					// Note: Full SyncTeX requires parsing .synctex.gz file
					// For now, we'll just scroll to approximate position
					if (message.line && container && pdf) {
						// Scroll to page containing the line
						const pageHeight = container.scrollHeight / pdf.numPages;
						const targetPage = Math.min(Math.max(1, Math.floor(message.line / 25)), pdf.numPages);
						goToPage(targetPage);
					}
					break;
			}
		});
		
		// Set up PDF.js worker synchronously before loading PDF
		// Create blob URL for PDF.js worker to avoid CSP issues
		(async function() {
			try {
				const workerResponse = await fetch("${pdfjsWorkerUriWebview}");
				const workerBlob = await workerResponse.blob();
				const workerBlobUrl = URL.createObjectURL(workerBlob);
				pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;
			} catch (err) {
				console.error('Failed to load PDF.js worker:', err);
				// Fallback to direct URL
				pdfjsLib.GlobalWorkerOptions.workerSrc = "${pdfjsWorkerUriWebview}";
			}
			
			// Now load the PDF after worker is configured
			loadPdf();
		})();
		
		// Zoom functions
		function updateZoom(scale) {
			currentScale = scale;
			zoomLevel.textContent = Math.round(scale * 100) + '%';
			renderAllPages();
		}
		
		function zoomIn() {
			updateZoom(Math.min(currentScale + 0.25, 5.0));
		}
		
		function zoomOut() {
			updateZoom(Math.max(currentScale - 0.25, 0.25));
		}
		
		function fitWidth() {
			if (!pdf || pageElements.length === 0) return;
			// Get the actual page at scale 1.0 to calculate proper dimensions
			const firstPageObj = pageElements[0].page;
			const baseViewport = firstPageObj.getViewport({ scale: 1.0 });
			const containerWidth = container.clientWidth - 40; // Account for padding (20px on each side)
			const scale = containerWidth / baseViewport.width;
			updateZoom(scale);
		}
		
		function fitPage() {
			if (!pdf || pageElements.length === 0) return;
			// Get the actual page at scale 1.0 to calculate proper dimensions
			const firstPageObj = pageElements[0].page;
			const baseViewport = firstPageObj.getViewport({ scale: 1.0 });
			const containerWidth = container.clientWidth - 40; // Account for padding
			const containerHeight = container.clientHeight - 40; // Account for padding
			const scale = Math.min(containerWidth / baseViewport.width, containerHeight / baseViewport.height);
			updateZoom(scale);
		}
		
		function actualSize() {
			updateZoom(1.0);
		}
		
		// Page navigation
		function goToPage(pageNum) {
			if (!pdf) return;
			const targetPage = Math.max(1, Math.min(pageNum, pdf.numPages));
			currentPage = targetPage;
			pageInput.value = targetPage;
			
			// Scroll to page
			const pageElement = container.querySelector('[data-page-num="' + targetPage + '"]');
			if (pageElement) {
				pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}
		
		function prevPage() {
			goToPage(currentPage - 1);
		}
		
		function nextPage() {
			goToPage(currentPage + 1);
		}
		
		// Render all pages with current scale
		async function renderAllPages() {
			if (!pdf) return;
			
			// Clear existing pages
			container.innerHTML = '';
			pageElements = [];
			
			// Render all pages
			for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
				const page = await pdf.getPage(pageNum);
				const viewport = page.getViewport({ scale: currentScale });
				
				const pageDiv = document.createElement('div');
				pageDiv.className = 'pdf-page-container';
				pageDiv.style.width = viewport.width + 'px';
				pageDiv.style.height = viewport.height + 'px';
				pageDiv.dataset.pageNum = pageNum;
				
				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');
				canvas.height = viewport.height;
				canvas.width = viewport.width;
				
				// SyncTeX disabled - click handler removed
				/*
				if (synctexEnabled) {
					canvas.addEventListener('click', async (e) => {
						const rect = canvas.getBoundingClientRect();
						const canvasX = e.clientX - rect.left;
						const canvasY = e.clientY - rect.top;
						
						// Convert canvas coordinates to PDF coordinates using viewport
						// PDF coordinates: origin at bottom-left, Y increases upward
						// Canvas coordinates: origin at top-left, Y increases downward
						const pdfPoint = viewport.convertToPdfPoint(canvasX, canvasY);
						const pdfX = pdfPoint[0];
						const pdfY = pdfPoint[1];
						
						// Try to get text content to find the closest text element
						try {
							const textContent = await page.getTextContent();
							let closestText = null;
							let minDistance = Infinity;
							
							// Find the text element closest to the click position
							for (const item of textContent.items) {
								if (item.transform) {
									// item.transform is [a, b, c, d, e, f] representing a transformation matrix
									// e (index 4), f (index 5) are the x, y translation (position)
									const textX = item.transform[4];
									const textY = item.transform[5];
									
									// Calculate distance from click to text position
									const distance = Math.sqrt(
										Math.pow(pdfX - textX, 2) + Math.pow(pdfY - textY, 2)
									);
									
									if (distance < minDistance) {
										minDistance = distance;
										closestText = item;
									}
								}
							}
							
							// Try to find the clicked text in the LaTeX source for accurate SyncTeX
							let line = 1;
							let column = 1;
							
							if (closestText && closestText.str && texContent) {
								// Get the text string from the clicked element
								const clickedText = closestText.str.trim();
								
								// Try to find this text in the LaTeX source
								// Remove LaTeX commands and special characters for matching
								const normalizeText = (text) => {
									return text.replace(/\\\\[a-zA-Z]+\{/g, '')
										.replace(/\{[^}]*\}/g, '')
										.replace(/[{}]/g, '')
										.replace(/\s+/g, ' ')
										.trim();
								};
								
								const normalizedClicked = normalizeText(clickedText);
								const lines = texContent.split('\\n');
								
								// Search for the text in the LaTeX source
								let bestMatch = null;
								let bestMatchLine = 0;
								
								for (let i = 0; i < lines.length; i++) {
									const normalizedLine = normalizeText(lines[i]);
									if (normalizedLine.includes(normalizedClicked) || normalizedClicked.includes(normalizedLine)) {
										// Found a match - use this line
										bestMatch = lines[i];
										bestMatchLine = i;
										break;
									}
								}
								
								if (bestMatch !== null) {
									// Found the text in source - use that line
									line = bestMatchLine + 1;
									// Try to find the column position within the line
									const originalLine = lines[bestMatchLine];
									const matchIndex = originalLine.toLowerCase().indexOf(clickedText.toLowerCase());
									column = matchIndex >= 0 ? matchIndex + 1 : 1;
								} else {
									// Text not found in source - fall back to position-based estimation
									const pageViewport = page.getViewport({ scale: 1.0 });
									const pageHeight = pageViewport.height;
									const textY = closestText.transform[5];
									const yFromTop = pageHeight - textY;
									line = Math.max(1, Math.floor((yFromTop - 72) / 12) + 1);
									
									const textX = closestText.transform[4];
									const xFromLeft = textX - 72;
									column = Math.max(1, Math.floor(xFromLeft / 6.5) + 1);
								}
							} else {
								// No text content available - estimate based on PDF coordinates
								const pageViewport = page.getViewport({ scale: 1.0 });
								const pageHeight = pageViewport.height;
								const yFromTop = pageHeight - pdfY;
								line = Math.max(1, Math.floor((yFromTop - 72) / 12) + 1);
								
								const xFromLeft = pdfX - 72;
								column = Math.max(1, Math.floor(xFromLeft / 6.5) + 1);
							}
							
							vscode.postMessage({
								type: 'syncFromPdf',
								line: line,
								column: column,
								page: pageNum
							});
						} catch (err) {
							// Fallback if text content extraction fails
							const pageViewport = page.getViewport({ scale: 1.0 });
							const pageHeight = pageViewport.height;
							const yFromTop = pageHeight - pdfY;
							const line = Math.max(1, Math.floor((yFromTop - 72) / 12) + 1);
							
							const xFromLeft = pdfX - 72;
							const column = Math.max(1, Math.floor(xFromLeft / 6.5) + 1);
							
							vscode.postMessage({
								type: 'syncFromPdf',
								line: line,
								column: column,
								page: pageNum
							});
						}
					});
				}
				*/
				
				pageDiv.appendChild(canvas);
				container.appendChild(pageDiv);
				
				await page.render({
					canvasContext: context,
					viewport: viewport
				}).promise;
				
				pageElements.push({ page, viewport, element: pageDiv });
			}
			
			// Update page total
			pageTotal.textContent = '/ ' + pdf.numPages;
		}
		
		// Event listeners
		btnZoomOut.addEventListener('click', zoomOut);
		btnZoomIn.addEventListener('click', zoomIn);
		btnFitWidth.addEventListener('click', fitWidth);
		btnFitPage.addEventListener('click', fitPage);
		btnActualSize.addEventListener('click', actualSize);
		btnPrevPage.addEventListener('click', prevPage);
		btnNextPage.addEventListener('click', nextPage);
		pageInput.addEventListener('change', () => {
			const pageNum = parseInt(pageInput.value, 10);
			if (!isNaN(pageNum)) {
				goToPage(pageNum);
			}
		});
		btnRefresh.addEventListener('click', () => {
			vscode.postMessage({ type: 'refresh' });
		});
		// SyncTeX button removed - functionality disabled
		btnDownload.addEventListener('click', async () => {
			if (!pdfUrl) return;
			
			try {
				// For data URLs, we can download directly
				if (pdfUrl.startsWith('data:')) {
					const link = document.createElement('a');
					link.href = pdfUrl;
					link.download = 'document.pdf';
					link.click();
				} else {
					// For file URLs, fetch and download
					const response = await fetch(pdfUrl);
					const blob = await response.blob();
					const blobUrl = URL.createObjectURL(blob);
					const link = document.createElement('a');
					link.href = blobUrl;
					link.download = 'document.pdf';
					link.click();
					// Clean up blob URL after a delay
					setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
				}
			} catch (err) {
				console.error('Failed to download PDF:', err);
				vscode.postMessage({
					type: 'downloadError',
					error: err.message
				});
			}
		});
		
		// Track scroll to update current page
		container.addEventListener('scroll', () => {
			if (!pdf || pageElements.length === 0) return;
			const scrollTop = container.scrollTop;
			const containerHeight = container.clientHeight;
			const scrollMiddle = scrollTop + containerHeight / 2;
			
			// Find which page is in the middle of the viewport
			for (let i = 0; i < pageElements.length; i++) {
				const pageElement = pageElements[i].element;
				const pageTop = pageElement.offsetTop;
				const pageHeight = pageElement.offsetHeight;
				
				if (scrollMiddle >= pageTop && scrollMiddle < pageTop + pageHeight) {
					const newPage = i + 1;
					if (newPage !== currentPage) {
						currentPage = newPage;
						pageInput.value = newPage;
					}
					break;
				}
			}
		});
		
		async function loadPdf() {
			try {
				if (!pdfUrl) {
					throw new Error('No PDF URL or data provided');
				}
				
				// Ensure worker is configured
				if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
					pdfjsLib.GlobalWorkerOptions.workerSrc = "${pdfjsWorkerUriWebview}";
				}
				
				const loadingTask = pdfjsLib.getDocument(pdfUrl);
				pdf = await loadingTask.promise;
				
				loading.style.display = 'none';
				container.style.display = 'block';
				
				// Update page total
				pageTotal.textContent = '/ ' + pdf.numPages;
				currentPage = 1;
				pageInput.value = '1';
				
				// Render all pages
				await renderAllPages();
				
				// Sync to position if provided
				if (syncLine !== undefined && container) {
					// Scroll to approximate position based on line number
					const targetPage = Math.min(Math.max(1, Math.floor(syncLine / 25)), pdf.numPages);
					goToPage(targetPage);
				}
			} catch (err) {
				loading.style.display = 'none';
				error.style.display = 'block';
				error.textContent = 'Failed to load PDF: ' + err.message;
				console.error('PDF loading error:', err);
			}
		}
	</script>
</body>
</html>`;
	}

	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	dispose(): void {
		this.previewPanels.forEach(panel => panel.dispose());
		this.previewPanels.clear();
	}
}

