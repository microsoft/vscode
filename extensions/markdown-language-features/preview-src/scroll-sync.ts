/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSettings } from './settings';


function clamp(min: number, max: number, value: number) {
	return Math.min(max, Math.max(min, value));
}

function clampLine(line: number) {
	return clamp(0, getSettings().lineCount - 1, line);
}


export interface CodeLineElement {
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
export function getElementsForSourceLine(targetLine: number): { previous: CodeLineElement; next?: CodeLineElement; } {
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
export function getLineElementsAtPageOffset(offset: number): { previous: CodeLineElement; next?: CodeLineElement; } {
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
export function scrollToRevealSourceLine(line: number) {
	const { previous, next } = getElementsForSourceLine(line);
	if (previous && getSettings().scrollPreviewWithEditor) {
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

export function getEditorLineNumberForPageOffset(offset: number) {
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
