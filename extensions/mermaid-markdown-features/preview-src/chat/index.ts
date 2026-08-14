/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { initializeMermaidWebview } from './mermaidWebview';
import { VsCodeApi } from './vscodeApi';

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();


async function main() {
	await initializeMermaidWebview(vscode);

	const openInModalButton = document.querySelector('.open-in-modal-btn');
	openInModalButton?.addEventListener('click', event => {
		event.stopPropagation();
		vscode.postMessage({ type: 'openInModal' });
	});

	const openBtn = document.querySelector('.open-in-editor-btn');
	if (openBtn) {
		openBtn.addEventListener('click', e => {
			e.stopPropagation();
			vscode.postMessage({ type: 'openInEditor' });
		});
	}
}
main();
