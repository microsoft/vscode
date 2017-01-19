/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

(function () {
	/**
	 * Find the elements around line.
	 *
	 * If an exact match, returns a single element. If the line is between elements,
	 * returns the element before and the element after the given line.
	 */
	function getElementsAroundSourceLine(targetLine) {
		const lines = document.getElementsByClassName('code-line');
		let before = null;
		for (const element of lines) {
			const lineNumber = +element.getAttribute('data-line');
			if (isNaN(lineNumber)) {
				continue;
			}
			const entry = { line: lineNumber, element: element };
			if (lineNumber === targetLine) {
				return { before: entry, after: null };
			} else if (lineNumber > targetLine) {
				return { before, after: entry };
			}
			before = entry;
		}
		return { before };
	}

	function getSourceRevealAddedOffset() {
		return -(window.innerHeight * 1 / 5);
	}

	/**
	 * Attempt to reveal the element for a source line in the editor.
	 */
	function scrollToRevealSourceLine(line) {
		const {before, after} = getElementsAroundSourceLine(line);
		marker.update(before && before.element);
		if (before) {
			let scrollTo = 0;
			if (after) {
				// Between two elements. Go to percentage offset between them.
				const betweenProgress = (line - before.line) / (after.line - before.line);
				const elementOffset = after.element.getBoundingClientRect().top - before.element.getBoundingClientRect().top;
				scrollTo = before.element.getBoundingClientRect().top + betweenProgress * elementOffset;
			} else {
				scrollTo = before.element.getBoundingClientRect().top;
			}
			window.scroll(0, window.scrollY + scrollTo + getSourceRevealAddedOffset());
		}
	}

	function didUpdateScrollPosition(offset) {
		const lines = document.getElementsByClassName('code-line');
		let nearest = lines[0];
		for (let i = lines.length - 1; i >= 0; --i) {
			const lineElement = lines[i];
			if (offset <= window.scrollY + lineElement.getBoundingClientRect().top + lineElement.getBoundingClientRect().height) {
				nearest = lineElement;
			} else {
				break;
			}
		}

		if (nearest) {
			const line = +nearest.getAttribute('data-line');
			const args = [window.initialData.source, line];
			window.parent.postMessage({
				command: "did-click-link",
				data: `command:_markdown.didClick?${encodeURIComponent(JSON.stringify(args))}`
			}, "file://");
		}
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

	var pageHeight = 0;
	var marker = new ActiveLineMarker();

	window.onload = () => {
		pageHeight = document.body.getBoundingClientRect().height;

		if (window.initialData.enablePreviewSync) {
			const initialLine = +window.initialData.line || 0;
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
				scrollToRevealSourceLine(line);
			}
		}, false);

		document.ondblclick = (e) => {
			const offset = e.pageY;
			didUpdateScrollPosition(offset);
		};

		/*
		window.onscroll = () => {
			didUpdateScrollPosition(window.scrollY);
		};
		*/
	}
}());