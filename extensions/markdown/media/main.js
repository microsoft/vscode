/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

var height;

function updateScrollPosition(line) {
	const lines = document.getElementsByClassName('code-line');
	let previous = null;
	let next = null;
	for (const element of lines) {
		const lineNumber = +element.getAttribute('data-line');
		if (lineNumber === line) {
			previous = { line: lineNumber, element: element  };
			break;
		} else if (lineNumber < line) {
			previous = { line: lineNumber, element: element };
		} else {
			next = { line: lineNumber, element: element };
			break;
		}
	}

	if (previous) {
		if (next) {
			const betweenOffset = (line - previous.line) / (next.line - previous.line);
			const d = betweenOffset * ((window.scrollY + next.element.getBoundingClientRect().top) - (window.scrollY + previous.element.getBoundingClientRect().top));
			window.scroll(0, window.scrollY + previous.element.getBoundingClientRect().top + d);

		} else {
			window.scroll(0, window.scrollY + previous.element.getBoundingClientRect().top);
		}
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

window.addEventListener('message', event => {
	const line = +event.data.line;
	if (!isNaN(line)) {
		updateScrollPosition(line);
	}
}, false);

window.onload = () => {
	const initialLine = +window.initialData.line || 0;
	updateScrollPosition(initialLine);
	height = window.document.body.getBoundingClientRect().height;
};

document.onclick = (e) => {
	const offset = e.pageY;
	didUpdateScrollPosition(offset);
};


window.onscroll = () => {
	didUpdateScrollPosition(window.scrollY);
};

/*
window.addEventListener('resize', (e) => {
	const currentOffset = window.scrollY;
	const dHeight = window.document.body.getBoundingClientRect().height / height;
	window.scrollTo(0, currentOffset * dHeight);
	height = window.document.body.getBoundingClientRect().height ;
}, true);*/