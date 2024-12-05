/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActiveLineMarker } from './activeLineMarker';
import { onceDocumentLoaded } from './events';
import { createPosterForVsCode } from './messaging';
import { getEditorLineNumberForPageOffset, scrollToRevealSourceLine, getLineElementForFragment } from './scroll-sync';
import { SettingsManager, getData } from './settings';
import throttle = require('lodash.throttle');
import morphdom from 'morphdom';
import type { ToWebviewMessage } from '../types/previewMessaging';

let scrollDisabledCount = 0;

const marker = new ActiveLineMarker();
const settings = new SettingsManager();

let documentVersion = 0;
let documentResource = settings.settings.source;

const vscode = acquireVsCodeApi();

const originalState = vscode.getState() ?? {} as any;
const state = {
	...originalState,
	...getData<any>('data-state')
};

if (typeof originalState.scrollProgress !== 'undefined' && originalState?.resource !== state.resource) {
	state.scrollProgress = 0;
}

// Make sure to sync VS Code state here
vscode.setState(state);

const messaging = createPosterForVsCode(vscode, settings);

window.cspAlerter.setPoster(messaging);
window.styleLoadingMonitor.setPoster(messaging);


function doAfterImagesLoaded(cb: () => void) {
	const imgElements = document.getElementsByTagName('img');
	if (imgElements.length > 0) {
		const ps = Array.from(imgElements, e => {
			if (e.complete) {
				return Promise.resolve();
			} else {
				return new Promise<void>((resolve) => {
					e.addEventListener('load', () => resolve());
					e.addEventListener('error', () => resolve());
				});
			}
		});
		Promise.all(ps).then(() => setTimeout(cb, 0));
	} else {
		setTimeout(cb, 0);
	}
}

onceDocumentLoaded(() => {
	const scrollProgress = state.scrollProgress;

	addImageContexts();
	if (typeof scrollProgress === 'number' && !settings.settings.fragment) {
		doAfterImagesLoaded(() => {
			scrollDisabledCount += 1;
			// Always set scroll of at least 1 to prevent VS Code's webview code from auto scrolling us
			const scrollToY = Math.max(1, scrollProgress * document.body.clientHeight);
			window.scrollTo(0, scrollToY);
		});
		return;
	}

	if (settings.settings.scrollPreviewWithEditor) {
		doAfterImagesLoaded(() => {
			// Try to scroll to fragment if available
			if (settings.settings.fragment) {
				let fragment: string;
				try {
					fragment = encodeURIComponent(settings.settings.fragment);
				} catch {
					fragment = settings.settings.fragment;
				}
				state.fragment = undefined;
				vscode.setState(state);

				const element = getLineElementForFragment(fragment, documentVersion);
				if (element) {
					scrollDisabledCount += 1;
					scrollToRevealSourceLine(element.line, documentVersion, settings);
				}
			} else {
				if (!isNaN(settings.settings.line!)) {
					scrollDisabledCount += 1;
					scrollToRevealSourceLine(settings.settings.line!, documentVersion, settings);
				}
			}
		});
	}

	if (typeof settings.settings.selectedLine === 'number') {
		marker.onDidChangeTextEditorSelection(settings.settings.selectedLine, documentVersion);
	}
});

const onUpdateView = (() => {
	const doScroll = throttle((line: number) => {
		scrollDisabledCount += 1;
		doAfterImagesLoaded(() => scrollToRevealSourceLine(line, documentVersion, settings));
	}, 50);

	return (line: number) => {
		if (!isNaN(line)) {
			state.line = line;

			doScroll(line);
		}
	};
})();

window.addEventListener('resize', () => {
	scrollDisabledCount += 1;
	updateScrollProgress();
}, true);

function addImageContexts() {
	const images = document.getElementsByTagName('img');
	let idNumber = 0;
	for (const img of images) {
		img.id = 'image-' + idNumber;
		idNumber += 1;
		img.setAttribute('data-vscode-context', JSON.stringify({ webviewSection: 'image', id: img.id, 'preventDefaultContextMenuItems': true, resource: documentResource }));
	}
}

async function copyImage(image: HTMLImageElement, retries = 5) {
	if (!document.hasFocus() && retries > 0) {
		// copyImage is called at the same time as webview.reveal, which means this function is running whilst the webview is gaining focus.
		// Since navigator.clipboard.write requires the document to be focused, we need to wait for focus.
		// We cannot use a listener, as there is a high chance the focus is gained during the setup of the listener resulting in us missing it.
		setTimeout(() => { copyImage(image, retries - 1); }, 20);
		return;
	}

	try {
		await navigator.clipboard.write([new ClipboardItem({
			'image/png': new Promise((resolve) => {
				const canvas = document.createElement('canvas');
				if (canvas !== null) {
					canvas.width = image.naturalWidth;
					canvas.height = image.naturalHeight;
					const context = canvas.getContext('2d');
					context?.drawImage(image, 0, 0);
				}
				canvas.toBlob((blob) => {
					if (blob) {
						resolve(blob);
					}
					canvas.remove();
				}, 'image/png');
			})
		})]);
	} catch (e) {
		console.error(e);
	}
}

window.addEventListener('message', async event => {
	const data = event.data as ToWebviewMessage.Type;
	switch (data.type) {
		case 'copyImage': {
			const img = document.getElementById(data.id);
			if (img instanceof HTMLImageElement) {
				copyImage(img);
			}
			return;
		}
		case 'onDidChangeTextEditorSelection':
			if (data.source === documentResource) {
				marker.onDidChangeTextEditorSelection(data.line, documentVersion);
			}
			return;

		case 'updateView':
			if (data.source === documentResource) {
				onUpdateView(data.line);
			}
			return;

		case 'updateContent': {
			const root = document.querySelector('.markdown-body')!;

			const parser = new DOMParser();
			const newContent = parser.parseFromString(data.content, 'text/html'); // CodeQL [SM03712] This renderers content from the workspace into the Markdown preview. Webviews (and the markdown preview) have many other security measures in place to make this safe

			// Strip out meta http-equiv tags
			for (const metaElement of Array.from(newContent.querySelectorAll('meta'))) {
				if (metaElement.hasAttribute('http-equiv')) {
					metaElement.remove();
				}
			}

			if (data.source !== documentResource) {
				root.replaceWith(newContent.querySelector('.markdown-body')!);
				documentResource = data.source;
			} else {
				const skippedAttrs = [
					'open', // for details
				];

				// Compare two elements but some elements
				const areEqual = (a: Element, b: Element): boolean => {
					if (a.isEqualNode(b)) {
						return true;
					}

					if (a.tagName !== b.tagName || a.textContent !== b.textContent) {
						return false;
					}

					const aAttrs = [...a.attributes].filter(attr => !skippedAttrs.includes(attr.name));
					const bAttrs = [...b.attributes].filter(attr => !skippedAttrs.includes(attr.name));
					if (aAttrs.length !== bAttrs.length) {
						return false;
					}

					for (let i = 0; i < aAttrs.length; ++i) {
						const aAttr = aAttrs[i];
						const bAttr = bAttrs[i];
						if (aAttr.name !== bAttr.name) {
							return false;
						}
						if (aAttr.value !== bAttr.value && aAttr.name !== 'data-line') {
							return false;
						}
					}

					const aChildren = Array.from(a.children);
					const bChildren = Array.from(b.children);

					return aChildren.length === bChildren.length && aChildren.every((x, i) => areEqual(x, bChildren[i]));
				};

				const newRoot = newContent.querySelector('.markdown-body')!;

				// Move styles to head
				// This prevents an ugly flash of unstyled content
				const styles = newRoot.querySelectorAll('link');
				for (const style of styles) {
					style.remove();
				}
				newRoot.prepend(...styles);
				morphdom(root, newRoot, {
					childrenOnly: true,
					onBeforeElUpdated: (fromEl, toEl) => {
						if (areEqual(fromEl, toEl)) {
							// areEqual doesn't look at `data-line` so copy those over manually
							const fromLines = fromEl.querySelectorAll('[data-line]');
							const toLines = toEl.querySelectorAll('[data-line]');
							if (fromLines.length !== toLines.length) {
								console.log('unexpected line number change');
							}

							for (let i = 0; i < fromLines.length; ++i) {
								const fromChild = fromLines[i];
								const toChild = toLines[i];
								if (toChild) {
									fromChild.setAttribute('data-line', toChild.getAttribute('data-line')!);
								}
							}

							return false;
						}

						if (fromEl.tagName === 'DETAILS' && toEl.tagName === 'DETAILS') {
							if (fromEl.hasAttribute('open')) {
								toEl.setAttribute('open', '');
							}
						}

						return true;
					}
				});
			}

			++documentVersion;

			window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
			addImageContexts();
			break;
		}
	}
}, false);



document.addEventListener('dblclick', event => {
	if (!settings.settings.doubleClickToSwitchToEditor) {
		return;
	}

	// Ignore clicks on links
	for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
		if (node.tagName === 'A') {
			return;
		}
	}

	const offset = event.pageY;
	const line = getEditorLineNumberForPageOffset(offset, documentVersion);
	if (typeof line === 'number' && !isNaN(line)) {
		messaging.postMessage('didClick', { line: Math.floor(line) });
	}
});

const passThroughLinkSchemes = ['http:', 'https:', 'mailto:', 'vscode:', 'vscode-insiders:'];

document.addEventListener('click', event => {
	if (!event) {
		return;
	}

	let node: any = event.target;
	while (node) {
		if (node.tagName && node.tagName === 'A' && node.href) {
			if (node.getAttribute('href').startsWith('#')) {
				return;
			}

			let hrefText = node.getAttribute('data-href');
			if (!hrefText) {
				hrefText = node.getAttribute('href');
				// Pass through known schemes
				if (passThroughLinkSchemes.some(scheme => hrefText.startsWith(scheme))) {
					return;
				}
			}

			// If original link doesn't look like a url, delegate back to VS Code to resolve
			if (!/^[a-z\-]+:/i.test(hrefText)) {
				messaging.postMessage('openLink', { href: hrefText });
				event.preventDefault();
				event.stopPropagation();
				return;
			}

			return;
		}
		node = node.parentNode;
	}
}, true);

window.addEventListener('scroll', throttle(() => {
	updateScrollProgress();

	if (scrollDisabledCount > 0) {
		scrollDisabledCount -= 1;
	} else {
		const line = getEditorLineNumberForPageOffset(window.scrollY, documentVersion);
		if (typeof line === 'number' && !isNaN(line)) {
			messaging.postMessage('revealLine', { line });
		}
	}
}, 50));

function updateScrollProgress() {
	state.scrollProgress = window.scrollY / document.body.clientHeight;
	vscode.setState(state);
}

