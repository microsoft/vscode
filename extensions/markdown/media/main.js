/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

(function () {
	/**
	 * Find the html elements that map to a specific target line in the editor.
	 *
	 * If an exact match, returns a single element. If the line is between elements,
	 * returns the element prior to and the element after the given line.
	 */
	function getElementsForSourceLine(targetLine) {
		const lines = document.getElementsByClassName('code-line');
		let previous = lines[0] && +lines[0].getAttribute('data-line') ? { line: +lines[0].getAttribute('data-line'), element: lines[0] } : null;
		for (const element of lines) {
			const lineNumber = +element.getAttribute('data-line');
			if (isNaN(lineNumber)) {
				continue;
			}
			const entry = { line: lineNumber, element: element };
			if (lineNumber === targetLine) {
				return { previous: entry, next: null };
			} else if (lineNumber > targetLine) {
				return { previous, next: entry };
			}
			previous = entry;
		}
		return { previous };
	}

	/**
	 * Find the html elements that are at a specific pixel offset on the page.
	 */
	function getLineElementsAtPageOffset(offset) {
		const lines = document.getElementsByClassName('code-line');
		let previous = null;
		for (const element of lines) {
			const line = +element.getAttribute('data-line');
			if (isNaN(line)) {
				continue;
			}
			const entry = { element, line };
			if (offset >= window.scrollY + element.getBoundingClientRect().top && offset <= window.scrollY + element.getBoundingClientRect().top + element.getBoundingClientRect().height) {
				return { previous: entry };
			} else if (offset < window.scrollY + element.getBoundingClientRect().top) {
				return { previous, next: entry };
			}
			previous = entry;
		}
		return { previous };
	}

	function getSourceRevealAddedOffset() {
		return -(window.innerHeight * 1 / 5);
	}

	/**
	 * Attempt to reveal the element for a source line in the editor.
	 */
	function scrollToRevealSourceLine(line) {
		const {previous, next} = getElementsForSourceLine(line);
		marker.update(previous && previous.element);
		if (previous) {
			let scrollTo = 0;
			if (next) {
				// Between two elements. Go to percentage offset between them.
				const betweenProgress = (line - previous.line) / (next.line - previous.line);
				const elementOffset = next.element.getBoundingClientRect().top - previous.element.getBoundingClientRect().top;
				scrollTo = previous.element.getBoundingClientRect().top + betweenProgress * elementOffset;
			} else {
				scrollTo = previous.element.getBoundingClientRect().top;
			}
			window.scroll(0, window.scrollY + scrollTo + getSourceRevealAddedOffset());
		}
	}

	function getEditorLineNumberForPageOffset(offset) {
		const {previous, next} = getLineElementsAtPageOffset(offset);
		if (previous) {
			if (next) {
				const betweenProgress = (offset - window.scrollY - previous.element.getBoundingClientRect().top) / (next.element.getBoundingClientRect().top - previous.element.getBoundingClientRect().top);
				return previous.line + betweenProgress * (next.line - previous.line);
			} else {
				return previous.line;
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

	var scrollDisabled = false;
	var pageHeight = 0;
	var marker = new ActiveLineMarker();

	window.onload = () => {
		pageHeight = document.body.getBoundingClientRect().height;

		if (window.initialData.enablePreviewSync) {
			const initialLine = +window.initialData.line || 0;
			scrollDisabled = true;
			scrollToRevealSourceLine(initialLine);
		}
	};

	window.addEventListener('resize', () => {
		const currentOffset = window.scrollY;
		const newPageHeight = document.body.getBoundingClientRect().height;
		const dHeight = newPageHeight / pageHeight;
		window.scrollTo(0, currentOffset * dHeight);
		pageHeight = newPageHeight;
	}, true);

	if (window.initialData.enablePreviewSync) {

		window.addEventListener('message', event => {
			const line = +event.data.line;
			if (!isNaN(line)) {
				scrollDisabled = true;
				scrollToRevealSourceLine(line);
			}
		}, false);

		document.ondblclick = (e) => {
			const offset = e.pageY;
			const line = getEditorLineNumberForPageOffset(offset);
			if (!isNaN(line)) {
				const args = [window.initialData.source, line];
				window.parent.postMessage({
					command: "did-click-link",
					data: `command:_markdown.didClick?${encodeURIComponent(JSON.stringify(args))}`
				}, "file://");
			}
		};

		if (window.initialData.enableScrollSync) {
			window.onscroll = () => {
				if (scrollDisabled) {
					scrollDisabled = false;
				} else {
					const line = getEditorLineNumberForPageOffset(window.scrollY);
					if (!isNaN(line)) {
						const args = [window.initialData.source, line];
						window.parent.postMessage({
							command: "did-click-link",
							data: `command:_markdown.revealLine?${encodeURIComponent(JSON.stringify(args))}`
						}, "file://");
					}
				}
			};
		}
	}
}());