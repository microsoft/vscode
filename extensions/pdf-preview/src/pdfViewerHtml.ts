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
			<button class="toolbar-button toolbar-button-icon" id="btn-dark-mode" title="Toggle Dark Mode">
				<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.5-.04-.99-.13-1.46A5.47 5.47 0 0 1 14.5 13a5.5 5.5 0 0 1-5.5-5.5c0-2.47 1.64-4.56 3.88-5.24A9.1 9.1 0 0 0 12 3z"/></svg>
			</button>
			<button class="toolbar-button toolbar-button-icon" id="btn-download" title="Download PDF">
				<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
			</button>
		</div>
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
	<script nonce="${nonce}" src="${previewJsUri}"></script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
	return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
