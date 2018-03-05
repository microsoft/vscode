/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSettings } from './settings';
import { postCommand, postMessage } from './messaging';
import { onceDocumentLoaded } from './events';
import { getEditorLineNumberForPageOffset, scrollToRevealSourceLine } from './scroll-sync';
import { ActiveLineMarker } from './activeLineMarker';
import throttle = require('lodash.throttle');

var scrollDisabled = true;
const marker = new ActiveLineMarker();
const settings = getSettings();

onceDocumentLoaded(() => {
	if (settings.scrollPreviewWithEditor) {
		setTimeout(() => {
			const initialLine = +settings.line;
			if (!isNaN(initialLine)) {
				scrollDisabled = true;
				scrollToRevealSourceLine(initialLine);
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

window.addEventListener('resize', () => {
	scrollDisabled = true;
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
		postMessage('didClick', { line });
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
			if (node.href.startsWith('file://') || node.href.startsWith('vscode-workspace-resource:')) {
				const [path, fragment] = node.href.replace(/^(file:\/\/|vscode-workspace-resource:)/i, '').split('#');
				postCommand('_markdown.openDocumentLink', [{ path, fragment }]);
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
				postMessage('revealLine', { line });
			}
		}
	}, 50));
}