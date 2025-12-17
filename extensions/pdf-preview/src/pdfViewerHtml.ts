/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { generateUuid } from './util/uuid';

declare function btoa(data: string): string;

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

export function getPdfViewerHtml(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	pdfUri: vscode.Uri,
	pdfData?: Uint8Array,
	syncPosition?: { page: number; x?: number; y?: number },
	enableSyncClick?: boolean
): string {
	const nonce = generateUuid();
	const cspSource = webview.cspSource;

	// Get PDF.js URIs
	const pdfjsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'vendors', 'pdfjs', 'pdf.min.mjs'));
	const pdfjsWorkerUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'vendors', 'pdfjs', 'pdf.worker.min.mjs'));
	const pdfjsViewerCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'vendors', 'pdfjs', 'pdf_viewer.css'));
	const previewCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pdfPreview.css'));
	const sharedJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sharedPreview.js'));
	const previewJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pdfPreview.js'));

	// Convert PDF data to base64 if provided
	let pdfDataUrl = '';
	if (pdfData) {
		const base64 = uint8ArrayToBase64(pdfData);
		pdfDataUrl = `data:application/pdf;base64,${base64}`;
	}

	const pdfSrcUri = pdfData ? pdfDataUrl : webview.asWebviewUri(pdfUri).toString();

	const settings = {
		pdfUrl: pdfSrcUri,
		pdfjsWorkerUrl: pdfjsWorkerUri.toString(),
		syncPosition: syncPosition,
		enableSyncClick: enableSyncClick || false
	};

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${cspSource}; style-src ${cspSource} 'unsafe-inline'; connect-src data: ${cspSource} https:; worker-src blob: ${cspSource}; child-src blob:;">
	<link rel="stylesheet" href="${pdfjsViewerCssUri}">
	<link rel="stylesheet" href="${previewCssUri}">
	<meta id="pdf-preview-settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
	<title>PDF Preview</title>
</head>
<body>
	<div id="toolbar">
		<div class="toolbar-group toolbar-group-nav">
			<button class="toolbar-button toolbar-button-nav" id="btn-prev-page" title="Previous Page">
				<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			</button>
			<div class="pagination-container">
				<input type="text" class="toolbar-input-page" id="page-input" value="1" title="Current Page">
				<span class="toolbar-page-separator">/</span>
				<span class="toolbar-page-total" id="page-total">1</span>
			</div>
			<button class="toolbar-button toolbar-button-nav" id="btn-next-page" title="Next Page">
				<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
			</button>
		</div>
		<div class="toolbar-divider"></div>
		<div class="toolbar-group">
			<button class="toolbar-button toolbar-button-icon" id="btn-find" title="Find in Document (Ctrl+F)">
				<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
			</button>
		</div>
		<div class="toolbar-divider"></div>
		<div class="toolbar-group toolbar-group-zoom">
			<button class="toolbar-button toolbar-button-icon" id="btn-zoom-out" title="Zoom Out">
				<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>
			</button>
			<select class="toolbar-select" id="zoom-select" title="Zoom Level">
				<option value="0.5">50%</option>
				<option value="0.75">75%</option>
				<option value="1">100%</option>
				<option value="1.25">125%</option>
				<option value="1.5">150%</option>
				<option value="2">200%</option>
				<option value="3">300%</option>
				<option value="fit">Fit Page</option>
				<option value="fitWidth" selected>Fit Width</option>
			</select>
			<button class="toolbar-button toolbar-button-icon" id="btn-zoom-in" title="Zoom In">
				<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
			</button>
		</div>
		<div class="toolbar-divider"></div>
		<div class="toolbar-group">
			<button class="toolbar-button toolbar-button-icon" id="btn-fit-width" title="Fit to Width">
				<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
			</button>
		</div>
		<!-- Rotate buttons commented out - functionality not needed
		<div class="toolbar-group">
			<button class="toolbar-button" id="btn-rotate-ccw" title="Rotate Counter-Clockwise">&#x21BA;</button>
			<button class="toolbar-button" id="btn-rotate-cw" title="Rotate Clockwise">&#x21BB;</button>
		</div>
		-->
		<div class="toolbar-group toolbar-group-right">
			<button class="toolbar-button toolbar-button-icon sync-toggle-btn" id="btn-sync-toggle" title="Toggle Editor Sync (Enabled)" style="display: none;">
				<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
			</button>
			<button class="toolbar-button toolbar-button-icon" id="btn-dark-mode" title="Toggle Dark Mode">
				<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.5-.04-.99-.13-1.46A5.47 5.47 0 0 1 14.5 13a5.5 5.5 0 0 1-5.5-5.5c0-2.47 1.64-4.56 3.88-5.24A9.1 9.1 0 0 0 12 3z"/></svg>
			</button>
			<button class="toolbar-button toolbar-button-icon" id="btn-download" title="Download PDF">
				<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
			</button>
		</div>
	</div>
	<div id="findbar" class="findbar hidden">
		<div class="findbar-input-container">
			<input type="text" id="find-input" class="findbar-input" placeholder="Find in document..." title="Find">
			<div class="findbar-buttons">
				<button class="findbar-button" id="find-prev" title="Previous match">
					<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
				</button>
				<button class="findbar-button" id="find-next" title="Next match">
					<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
				</button>
			</div>
		</div>
		<div class="findbar-options">
			<label class="findbar-option">
				<input type="checkbox" id="find-highlight-all">
				<span>Highlight all</span>
			</label>
			<label class="findbar-option">
				<input type="checkbox" id="find-match-case">
				<span>Match case</span>
			</label>
		</div>
		<div class="findbar-status">
			<span id="find-results-count"></span>
		</div>
		<button class="findbar-close" id="find-close" title="Close">
			<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
		</button>
	</div>
	<div id="loading">
		<div class="loading-spinner"></div>
		<p>Loading PDF...</p>
	</div>
	<div id="error-container" style="display: none;">
		<p id="error-message"></p>
	</div>
	<div id="pdf-container" style="display: none;"></div>

	<script nonce="${nonce}">
		// Load PDF.js as ES module and expose it globally
		import("${pdfjsUri}").then(pdfjsLib => {
			window.pdfjsLib = pdfjsLib;
		}).catch(err => {
			console.error('Failed to load PDF.js:', err);
			document.getElementById('loading').style.display = 'none';
			document.getElementById('error-container').style.display = 'block';
			document.getElementById('error-message').textContent = 'Failed to load PDF.js: ' + err.message;
		});
	</script>
	<script nonce="${nonce}" src="${sharedJsUri}"></script>
	<script nonce="${nonce}" src="${previewJsUri}"></script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
	return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
