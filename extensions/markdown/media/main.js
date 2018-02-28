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
	 * @param {number} min
	 * @param {number} max
	 * @param {number} value
	 */
	function clamp(min, max, value) {
		return Math.min(max, Math.max(min, value));
	}

	/**
	 * @param {number} line
	 */
	function clampLine(line) {
		return clamp(0, settings.lineCount - 1, line);
	}

	/**
	 * Post a message to the markdown extension
	 *
	 * @param {string} type
	 * @param {object} body
	 */
	function postMessage(type, body) {
		window.parent.postMessage({
			type,
			body
		}, '*');
	}

	/**
	 * Post a command to be executed to the markdown extension
	 *
	 * @param {string} command
	 * @param {any[]} args
	 */
	function postCommand(command, args) {
		postMessage('command', { command, args });
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
		const lineNumber = Math.floor(targetLine)
		const lines = getCodeLineElements();
		let previous = lines[0] || null;
		for (const entry of lines) {
			if (entry.line === lineNumber) {
				return { previous: entry, next: null };
			} else if (entry.line > lineNumber) {
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

	/**
	 * Attempt to reveal the element for a source line in the editor.
	 *
	 * @param {number} line
	 */
	function scrollToRevealSourceLine(line) {
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
			} else {
				scrollTo = previousTop;
			}

			window.scroll(0, Math.max(1, window.scrollY + scrollTo));
		}
	}

	/**
	 * @param {number} offset
	 */
	function getEditorLineNumberForPageOffset(offset) {
		const { previous, next } = getLineElementsAtPageOffset(offset);
		if (previous) {
			if (next) {
				const betweenProgress = (offset - window.scrollY - previous.element.getBoundingClientRect().top) / (next.element.getBoundingClientRect().top - previous.element.getBoundingClientRect().top);
				const line = previous.line + betweenProgress * (next.line - previous.line);
				return clampLine(line);
			} else {
				return clampLine(previous.line);
			}
		}
		return null;
	}

	class ActiveLineMarker {
		onDidChangeTextEditorSelection(line) {
			const { previous } = getElementsForSourceLine(line);
			this._update(previous && previous.element);
		}

		_update(before) {
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
	const marker = new ActiveLineMarker();
	const settings = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-settings'));

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
		const doScroll = throttle(line => {
			scrollDisabled = true;
			scrollToRevealSourceLine(line);
		}, 50);

		return (line, settings) => {
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
		for (let node = /** @type {HTMLElement} */(event.target); node; node = /** @type {HTMLElement} */(node.parentNode)) {
			if (node.tagName === "A") {
				return;
			}
		}

		const offset = event.pageY;
		const line = getEditorLineNumberForPageOffset(offset);
		if (!isNaN(line)) {
			postCommand('_markdown.didClick', [settings.source, line]);
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
				if (!isNaN(line)) {
					postCommand('_markdown.revealLine', [settings.source, line]);
				}
			}
		}, 50));
	}
}());
