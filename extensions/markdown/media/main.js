/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
'use strict';

(function () {
	// From https://remysharp.com/2010/07/21/throttling-function-calls
	function throttle(fn, threshhold, scope) {
		threshhold || (threshhold = 250);
		var last, deferTimer;
		return function () {
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

	/**
	 * @param {string} command
	 * @param {any[]} args
	 */
	function postMessage(command, args) {
		window.parent.postMessage({
			command,
			args
		}, '*');
	}

	/**
	 * @typedef {{ element: Element, line: number }} CodeLineElement
	 */

	/**
	 * @return {CodeLineElement[]}
	 */
	const getCodeLineElements = (() => {
		/** @type {CodeLineElement[]} */
		let elements;
		return () => {
			if (!elements) {
				elements = Array.prototype.map.call(
					document.getElementsByClassName('code-line'),
					element => {
						const line = +element.getAttribute('data-line');
						return { element, line }
					})
					.filter(x => !isNaN(x.line));
			}
			return elements;
		};
	})()

	/**
	 * Find the html elements that map to a specific target line in the editor.
	 *
	 * If an exact match, returns a single element. If the line is between elements,
	 * returns the element prior to and the element after the given line.
	 *
	 * @param {number} targetLine
	 *
	 * @returns {{ previous: CodeLineElement, next?: CodeLineElement }}
	 */
	function getElementsForSourceLine(targetLine) {
		const lines = getCodeLineElements();
		let previous = lines[0] || null;
		for (const entry of lines) {
			if (entry.line === targetLine) {
				return { previous: entry, next: null };
			} else if (entry.line > targetLine) {
				return { previous, next: entry };
			}
			previous = entry;
		}
		return { previous };
	}

	/**
	 * Find the html elements that are at a specific pixel offset on the page.
	 *
	 * @returns {{ previous: CodeLineElement, next?: CodeLineElement }}
	 */
	function getLineElementsAtPageOffset(offset) {
		const lines = getCodeLineElements()

		const position = offset - window.scrollY;

		let lo = -1;
		let hi = lines.length - 1;
		while (lo + 1 < hi) {
			const mid = Math.floor((lo + hi) / 2);
			const bounds = lines[mid].element.getBoundingClientRect();
			if (bounds.top + bounds.height >= position) {
				hi = mid;
			} else {
				lo = mid;
			}
		}

		const hiElement = lines[hi];
		if (hi >= 1 && hiElement.element.getBoundingClientRect().top > position) {
			const loElement = lines[lo];
			const bounds = loElement.element.getBoundingClientRect();
			const previous = { element: loElement.element, line: loElement.line + (position - bounds.top) / (bounds.height) };
			const next = { element: hiElement.element, line: hiElement.line, fractional: 0 };
			return { previous, next };
		}

		const bounds = hiElement.element.getBoundingClientRect();
		const previous = { element: hiElement.element, line: hiElement.line + (position - bounds.top) / (bounds.height) };
		return { previous };
	}

	function getSourceRevealAddedOffset() {
		return -(window.innerHeight * 1 / 5);
	}

	/**
	 * Attempt to reveal the element for a source line in the editor.
	 *
	 * @param {number} line
	 */
	function scrollToRevealSourceLine(line) {
		const { previous, next } = getElementsForSourceLine(line);
		marker.update(previous && previous.element);
		if (previous && settings.scrollPreviewWithEditorSelection) {
			let scrollTo = 0;
			if (next) {
				// Between two elements. Go to percentage offset between them.
				const betweenProgress = (line - previous.line) / (next.line - previous.line);
				const elementOffset = next.element.getBoundingClientRect().top - previous.element.getBoundingClientRect().top;
				scrollTo = previous.element.getBoundingClientRect().top + betweenProgress * elementOffset;
			} else {
				scrollTo = previous.element.getBoundingClientRect().top;
			}
			window.scroll(0, Math.max(1, window.scrollY + scrollTo + getSourceRevealAddedOffset()));
		}
	}

	function getEditorLineNumberForPageOffset(offset) {
		const { previous, next } = getLineElementsAtPageOffset(offset);
		if (previous) {
			if (next) {
				const betweenProgress = (offset - window.scrollY - previous.element.getBoundingClientRect().top) / (next.element.getBoundingClientRect().top - previous.element.getBoundingClientRect().top);
				const line = previous.line + betweenProgress * (next.line - previous.line);
				return Math.max(line, 0);
			} else {
				return Math.max(previous.line, 0);
			}
		}
		return null;
	}


	class ActiveLineMarker {
		update(before) {
			this._unmarkActiveElement(this._current);
			this._markActiveElement(before);
			this._current = before;
		}

		_unmarkActiveElement(element) {
			if (!element) {
				return;
			}
			element.className = element.className.replace(/\bcode-active-line\b/g);
		}

		_markActiveElement(element) {
			if (!element) {
				return;
			}
			element.className += ' code-active-line';
		}
	}

	var scrollDisabled = true;
	var marker = new ActiveLineMarker();
	const settings = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-settings'));

	function onLoad() {
		if (settings.scrollPreviewWithEditorSelection) {
			setTimeout(() => {
				const initialLine = +settings.line;
				if (!isNaN(initialLine)) {
					scrollDisabled = true;
					scrollToRevealSourceLine(initialLine);
				}
			}, 0);
		}
	}

	if (document.readyState === 'loading' || document.readyState === 'uninitialized') {
		document.addEventListener('DOMContentLoaded', onLoad);
	} else {
		onLoad();
	}


	window.addEventListener('resize', () => {
		scrollDisabled = true;
	}, true);

	window.addEventListener('message', (() => {
		const doScroll = throttle(line => {
			scrollDisabled = true;
			scrollToRevealSourceLine(line);
		}, 50);
		return event => {
			if (event.data.source !== settings.source) {
				return;
			}

			const line = +event.data.line;
			if (!isNaN(line)) {
				settings.line = line;
				doScroll(line);
			}
		};
	})(), false);

	document.addEventListener('dblclick', event => {
		if (!settings.doubleClickToSwitchToEditor) {
			return;
		}

		// Ignore clicks on links
		for (let node = /** @type {HTMLElement} */(event.target); node; node = /** @type {HTMLElement} */(node.parentNode)) {
			if (node.tagName === "A") {
				return;
			}
		}

		const offset = event.pageY;
		const line = getEditorLineNumberForPageOffset(offset);
		if (!isNaN(line)) {
			postMessage('_markdown.didClick', [settings.source, line]);
		}
	});

	document.addEventListener('click', event => {
		if (!event) {
			return;
		}

		const baseElement = document.getElementsByTagName('base')[0];

		/** @type {*} */
		let node = event.target;
		while (node) {
			if (node.tagName && node.tagName === 'A' && node.href) {
				if (node.getAttribute('href').startsWith('#')) {
					break;
				}
				if (node.href.startsWith('file://') || node.href.startsWith('vscode-workspace-resource:')) {
					const [path, fragment] = node.href.replace(/^(file:\/\/|vscode-workspace-resource:)/i, '').split('#');
					postMessage('_markdown.openDocumentLink', [{ path, fragment }]);
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
				if (!isNaN(line)) {
					postMessage('_markdown.revealLine', [settings.source, line]);
				}
			}
		}, 50));
	}
}());