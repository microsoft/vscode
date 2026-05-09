/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { initializeMermaidWebview } from './mermaidWebview';
import { VsCodeApi } from './vscodeApi';

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();


initializeMermaidWebview(vscode).then(panZoomHandler => {
	if (!panZoomHandler) {
		return;
	}

	// Wire up zoom controls
	const zoomInBtn = document.querySelector('.zoom-in-btn');
	const zoomOutBtn = document.querySelector('.zoom-out-btn');
	const zoomResetBtn = document.querySelector('.zoom-reset-btn');

	zoomInBtn?.addEventListener('click', () => panZoomHandler.zoomIn());
	zoomOutBtn?.addEventListener('click', () => panZoomHandler.zoomOut());
	zoomResetBtn?.addEventListener('click', () => panZoomHandler.reset());
});
