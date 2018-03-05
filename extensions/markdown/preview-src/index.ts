/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSettings } from './settings';
import { postCommand, postMessage } from './messaging';

// From https://remysharp.com/2010/07/21/throttling-function-calls
function throttle(fn: (x: any) => any, threshhold: any, scope?: any) {
	threshhold = threshhold || (threshhold = 250);
	var last: any, deferTimer: any;
	return function (this: any, ...x: any[]) {
		var context = scope || this;

		var now = +new Date,
			args = arguments;
		if (last && now < last + threshhold) {
			// hold on to it
			clearTimeout(deferTimer);
			deferTimer = setTimeout(function () {
				last = now;
				fn.apply(context, args);
			}, threshhold + last - now);
		} else {
			last = now;
			fn.apply(context, args);
		}
	};
}

function clamp(min: number, max: number, value: number) {
	return Math.min(max, Math.max(min, value));
}

function clampLine(line: number) {
	return clamp(0, settings.lineCount - 1, line);
}


interface CodeLineElement {
	element: HTMLElement;
	line: number;
}

const getCodeLineElements = (() => {
	let elements: CodeLineElement[];
	return () => {
		if (!elements) {
			elements = Array.prototype.map.call(
				document.getElementsByClassName('code-line'),
				(element: any) => {
					const line = +element.getAttribute('data-line');
					return { element, line };
				})
				.filter((x: any) => !isNaN(x.line));
		}
		return elements;
	};
})();

/**
 * Find the html elements that map to a specific target line in the editor.
 *
 * If an exact match, returns a single element. If the line is between elements,
 * returns the element prior to and the element after the given line.
 */
function getElementsForSourceLine(targetLine: number): { previous: CodeLineElement; next?: CodeLineElement; } {
	const lineNumber = Math.floor(targetLine);
	const lines = getCodeLineElements();
	let previous = lines[0] || null;
	for (const entry of lines) {
		if (entry.line === lineNumber) {
			return { previous: entry, next: undefined };
		}
		else if (entry.line > lineNumber) {
			return { previous, next: entry };
		}
		previous = entry;
	}
	return { previous };
}

/**
 * Find the html elements that are at a specific pixel offset on the page.
 */
function getLineElementsAtPageOffset(offset: number): { previous: CodeLineElement; next?: CodeLineElement; } {
	const lines = getCodeLineElements();
	const position = offset - window.scrollY;
	let lo = -1;
	let hi = lines.length - 1;
	while (lo + 1 < hi) {
		const mid = Math.floor((lo + hi) / 2);
		const bounds = lines[mid].element.getBoundingClientRect();
		if (bounds.top + bounds.height >= position) {
			hi = mid;
		}
		else {
			lo = mid;
		}
	}
	const hiElement = lines[hi];
	const hiBounds = hiElement.element.getBoundingClientRect();
	if (hi >= 1 && hiBounds.top > position) {
		const loElement = lines[lo];
		return { previous: loElement, next: hiElement };
	}
	return { previous: hiElement };
}

/**
 * Attempt to reveal the element for a source line in the editor.
 */
function scrollToRevealSourceLine(line: number) {
	const { previous, next } = getElementsForSourceLine(line);
	if (previous && settings.scrollPreviewWithEditor) {
		let scrollTo = 0;
		const rect = previous.element.getBoundingClientRect();
		const previousTop = rect.top;
		if (next && next.line !== previous.line) {
			// Between two elements. Go to percentage offset between them.
			const betweenProgress = (line - previous.line) / (next.line - previous.line);
			const elementOffset = next.element.getBoundingClientRect().top - previousTop;
			scrollTo = previousTop + betweenProgress * elementOffset;
		}
		else {
			scrollTo = previousTop;
		}
		window.scroll(0, Math.max(1, window.scrollY + scrollTo));
	}
}

function getEditorLineNumberForPageOffset(offset: number) {
	const { previous, next } = getLineElementsAtPageOffset(offset);
	if (previous) {
		const previousBounds = previous.element.getBoundingClientRect();
		const offsetFromPrevious = (offset - window.scrollY - previousBounds.top);
		if (next) {
			const progressBetweenElements = offsetFromPrevious / (next.element.getBoundingClientRect().top - previousBounds.top);
			const line = previous.line + progressBetweenElements * (next.line - previous.line);
			return clampLine(line);
		}
		else {
			const progressWithinElement = offsetFromPrevious / (previousBounds.height);
			const line = previous.line + progressWithinElement;
			return clampLine(line);
		}
	}
	return null;
}

class ActiveLineMarker {
	private _current: any;

	onDidChangeTextEditorSelection(line: number) {
		const { previous } = getElementsForSourceLine(line);
		this._update(previous && previous.element);
	}

	_update(before: HTMLElement | undefined) {
		this._unmarkActiveElement(this._current);
		this._markActiveElement(before);
		this._current = before;
	}

	_unmarkActiveElement(element: HTMLElement | undefined) {
		if (!element) {
			return;
		}
		element.className = element.className.replace(/\bcode-active-line\b/g, '');
	}

	_markActiveElement(element: HTMLElement | undefined) {
		if (!element) {
			return;
		}
		element.className += ' code-active-line';
	}
}

var scrollDisabled = true;
const marker = new ActiveLineMarker();
const settings = getSettings();

function onLoad() {
	if (settings.scrollPreviewWithEditor) {
		setTimeout(() => {
			const initialLine = +settings.line;
			if (!isNaN(initialLine)) {
				scrollDisabled = true;
				scrollToRevealSourceLine(initialLine);
			}
		}, 0);
	}
}

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


if (document.readyState === 'loading' || document.readyState === 'uninitialized') {
	document.addEventListener('DOMContentLoaded', onLoad);
} else {
	onLoad();
}


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