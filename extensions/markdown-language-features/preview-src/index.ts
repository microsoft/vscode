/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActiveLineMarker } from './activeLineMarker';
import { onceDocumentLoaded } from './events';
import { createPosterForVsCode } from './messaging';
import { getEditorLineNumberForPageOffset, scrollToRevealSourceLine, getLineElementForFragment } from './scroll-sync';
import { getSettings, getData } from './settings';
import throttle = require('lodash.throttle');

declare var acquireVsCodeApi: any;

let scrollDisabled = true;
const marker = new ActiveLineMarker();
const settings = getSettings();

const vscode = acquireVsCodeApi();

// Set VS Code state
let state = getData<{ line: number, fragment: string }>('data-state');
vscode.setState(state);

const messaging = createPosterForVsCode(vscode);

window.cspAlerter.setPoster(messaging);
window.styleLoadingMonitor.setPoster(messaging);

window.onload = () => {
	updateImageSizes();
};

onceDocumentLoaded(() => {
	if (settings.scrollPreviewWithEditor) {
		setTimeout(() => {
			// Try to scroll to fragment if available
			if (state.fragment) {
				const element = getLineElementForFragment(state.fragment);
				if (element) {
					scrollDisabled = true;
					scrollToRevealSourceLine(element.line);
				}
			} else {
				const initialLine = +settings.line;
				if (!isNaN(initialLine)) {
					scrollDisabled = true;
					scrollToRevealSourceLine(initialLine);
				}
			}
		}, 0);
	}
});

const onUpdateView = (() => {
	const doScroll = throttle((line: number) => {
		scrollDisabled = true;
		scrollToRevealSourceLine(line);
	}, 50);

	return (line: number, settings: any) => {
		if (!isNaN(line)) {
			settings.line = line;
			doScroll(line);
		}
	};
})();

let updateImageSizes = throttle(() => {
	const imageInfo: { id: string, height: number, width: number }[] = [];
	let images = document.getElementsByTagName('img');
	if (images) {
		let i;
		for (i = 0; i < images.length; i++) {
			const img = images[i];

			if (img.classList.contains('loading')) {
				img.classList.remove('loading');
			}

			imageInfo.push({
				id: img.id,
				height: img.height,
				width: img.width
			});
		}

		messaging.postMessage('cacheImageSizes', imageInfo);
	}
}, 50);

window.addEventListener('resize', () => {
	scrollDisabled = true;
	updateImageSizes();
}, true);

window.addEventListener('message', event => {
	if (event.data.source !== settings.source) {
		return;
	}

	switch (event.data.type) {
		case 'onDidChangeTextEditorSelection':
			marker.onDidChangeTextEditorSelection(event.data.line);
			break;

		case 'updateView':
			onUpdateView(event.data.line, settings);
			break;
	}
}, false);

document.addEventListener('dblclick', event => {
	if (!settings.doubleClickToSwitchToEditor) {
		return;
	}

	// Ignore clicks on links
	for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
		if (node.tagName === 'A') {
			return;
		}
	}

	const offset = event.pageY;
	const line = getEditorLineNumberForPageOffset(offset);
	if (typeof line === 'number' && !isNaN(line)) {
		messaging.postMessage('didClick', { line: Math.floor(line) });
	}
});

document.addEventListener('click', event => {
	if (!event) {
		return;
	}

	let node: any = event.target;
	while (node) {
		if (node.tagName && node.tagName === 'A' && node.href) {
			if (node.getAttribute('href').startsWith('#')) {
				break;
			}
			if (node.href.startsWith('file://') || node.href.startsWith('vscode-resource:') || node.href.startsWith(settings.webviewResourceRoot)) {
				const [path, fragment] = node.href.replace(/^(file:\/\/|vscode-resource:)/i, '').replace(new RegExp(`^${escapeRegExp(settings.webviewResourceRoot)}`)).split('#');
				messaging.postMessage('clickLink', { path, fragment });
				event.preventDefault();
				event.stopPropagation();
				break;
			}
			break;
		}
		node = node.parentNode;
	}
}, true);

if (settings.scrollEditorWithPreview) {
	window.addEventListener('scroll', throttle(() => {
		if (scrollDisabled) {
			scrollDisabled = false;
		} else {
			const line = getEditorLineNumberForPageOffset(window.scrollY);
			if (typeof line === 'number' && !isNaN(line)) {
				messaging.postMessage('revealLine', { line });
				state.line = line;
				vscode.setState(state);
			}
		}
	}, 50));
}

function escapeRegExp(text: string) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
