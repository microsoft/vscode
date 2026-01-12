/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SettingsManager } from './settings';

const codeLineClass = 'code-line';


export class CodeLineElement {
	private readonly _detailParentElements: readonly HTMLDetailsElement[];

	constructor(
		readonly element: HTMLElement,
		readonly line: number,
		readonly codeElement?: HTMLElement,
		readonly endLine?: number,
	) {
		this._detailParentElements = Array.from(getParentsWithTagName<HTMLDetailsElement>(element, 'DETAILS'));
	}

	get isVisible(): boolean {
		if (this._detailParentElements.some(x => !x.open)) {
			return false;
		}

		const style = window.getComputedStyle(this.element);
		if (style.display === 'none' || style.visibility === 'hidden') {
			return false;
		}

		const bounds = this.element.getBoundingClientRect();
		if (bounds.height === 0 || bounds.width === 0) {
			return false;
		}

		return true;
	}
}

const getCodeLineElements = (() => {
	let cachedElements: CodeLineElement[] | undefined;
	let cachedVersion = -1;
	return (documentVersion: number) => {
		if (!cachedElements || documentVersion !== cachedVersion) {
			cachedVersion = documentVersion;
			cachedElements = [new CodeLineElement(document.body, -1)];
			for (const element of document.getElementsByClassName(codeLineClass)) {
				if (!(element instanceof HTMLElement)) {
					continue;
				}

				const line = +element.getAttribute('data-line')!;
				if (isNaN(line)) {
					continue;
				}




				if (element.tagName === 'CODE' && element.parentElement && element.parentElement.tagName === 'PRE') {
					// Fenced code blocks are a special case since the `code-line` can only be marked on
					// the `<code>` element and not the parent `<pre>` element.
					// Calculate the end line by counting newlines in the code block
					const text = element.textContent || '';
					const lineCount = (text.match(/\n/g) || []).length + 1;
					const endLine = line + lineCount - 1;
					cachedElements.push(new CodeLineElement(element.parentElement, line, element, endLine));
				} else if (element.tagName === 'PRE') {
					// Skip PRE elements as they will be handled via their CODE children
					// This prevents duplicate entries for the same line number
				} else if (element.tagName === 'UL' || element.tagName === 'OL') {
					// Skip adding list elements since the first child has the same code line (and should be preferred)
				} else {
					cachedElements.push(new CodeLineElement(element, line));
				}
			}
		}
		return cachedElements;
	};
})();

/**
 * Find the html elements that map to a specific target line in the editor.
 *
 * If an exact match, returns a single element. If the line is between elements,
 * returns the element prior to and the element after the given line.
 */
export function getElementsForSourceLine(targetLine: number, documentVersion: number): { previous: CodeLineElement; next?: CodeLineElement } {
	const lineNumber = Math.floor(targetLine);
	const lines = getCodeLineElements(documentVersion);
	let previous = lines[0] || null;
	for (const entry of lines) {
		if (entry.line === lineNumber) {
			return { previous: entry, next: undefined };
		} else if (entry.line > lineNumber) {
			return { previous, next: entry };
		}
		previous = entry;
	}
	return { previous };
}

/**
 * Find the html elements that are at a specific pixel offset on the page.
 */
export function getLineElementsAtPageOffset(offset: number, documentVersion: number): { previous: CodeLineElement; next?: CodeLineElement } {
	const lines = getCodeLineElements(documentVersion).filter(x => x.isVisible);
	const position = offset - window.scrollY;
	let lo = -1;
	let hi = lines.length - 1;
	while (lo + 1 < hi) {
		const mid = Math.floor((lo + hi) / 2);
		const bounds = getElementBounds(lines[mid]);
		if (bounds.top + bounds.height >= position) {
			hi = mid;
		}
		else {
			lo = mid;
		}
	}
	const hiElement = lines[hi];
	const hiBounds = getElementBounds(hiElement);

	if (hi >= 1 && hiBounds.top > position) {
		const loElement = lines[lo];
		return { previous: loElement, next: hiElement };
	}
	if (hi > 1 && hi < lines.length && hiBounds.top + hiBounds.height > position) {
		return { previous: hiElement, next: lines[hi + 1] };
	}
	return { previous: hiElement };
}

function getElementBounds(codeLineElement: CodeLineElement): { top: number; height: number } {
	const { element, codeElement } = codeLineElement;
	const myBounds = element.getBoundingClientRect();

	// For fenced code blocks (PRE elements containing CODE), use the full height
	// Don't look for children as the CODE element itself would be found as a child
	if (codeElement) {
		return myBounds;
	}

	// Some code line elements may contain other code line elements.
	// In those cases, only take the height up to that child.
	const codeLineChild = element.querySelector(`.${codeLineClass}`);
	if (codeLineChild) {
		const childBounds = codeLineChild.getBoundingClientRect();
		const height = Math.max(1, (childBounds.top - myBounds.top));
		return {
			top: myBounds.top,
			height: height
		};
	}

	return myBounds;
}

/**
 * Get the content bounds for a code line element, accounting for padding.
 * For code blocks, returns the bounds of the content area (excluding padding).
 * For other elements, returns the same as getElementBounds.
 */
function getContentBounds(codeLineElement: CodeLineElement): {
	top: number;
	height: number;
	paddingTop: number;
	paddingBottom: number;
} {
	const { element, codeElement } = codeLineElement;
	const bounds = getElementBounds(codeLineElement);

	// For code blocks (PRE elements), account for padding
	if (codeElement) {
		const computedStyle = window.getComputedStyle(element);
		const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
		const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

		return {
			top: bounds.top + paddingTop,
			height: bounds.height - paddingTop - paddingBottom,
			paddingTop,
			paddingBottom
		};
	}

	// For non-code elements, no padding adjustment needed
	return {
		top: bounds.top,
		height: bounds.height,
		paddingTop: 0,
		paddingBottom: 0
	};
}

/**
 * Attempt to reveal the element for a source line in the editor.
 */
export function scrollToRevealSourceLine(line: number, documentVersion: number, settingsManager: SettingsManager) {
	if (!settingsManager.settings?.scrollPreviewWithEditor) {
		return;
	}

	if (line <= 0) {
		window.scroll(window.scrollX, 0);
		return;
	}

	const { previous, next } = getElementsForSourceLine(line, documentVersion);
	if (!previous) {
		return;
	}
	let scrollTo = 0;
	const rect = getElementBounds(previous);
	const previousTop = rect.top;


	// Check if previous is a multi-line code block
	if (previous.endLine && previous.endLine > previous.line) {
		if (line < previous.endLine) {
			// We're inside the code block - scroll proportionally through its content height (excluding padding)
			const contentBounds = getContentBounds(previous);
			const progressInCodeBlock = (line - previous.line) / (previous.endLine - previous.line);


			// Calculate absolute position to content area
			const contentAbsoluteTop = window.scrollY + contentBounds.top;
			const targetAbsoluteY = contentAbsoluteTop + (contentBounds.height * progressInCodeBlock);
			scrollTo = targetAbsoluteY;

		} else if (next && next.line !== previous.line) {
			// We're after the code block but before the next element
			const betweenProgress = (line - previous.endLine) / (next.line - previous.endLine);
			const elementAbsoluteEnd = window.scrollY + previousTop + rect.height;
			const nextAbsoluteTop = window.scrollY + next.element.getBoundingClientRect().top;
			const betweenHeight = nextAbsoluteTop - elementAbsoluteEnd;
			scrollTo = elementAbsoluteEnd + betweenProgress * betweenHeight;
		} else {
			// Shouldn't happen, but fall back to end of element
			scrollTo = window.scrollY + previousTop + rect.height;
		}
	} else if (next && next.line !== previous.line) {
		// Original logic: Between two elements. Go to percentage offset between them.
		const betweenProgress = (line - previous.line) / (next.line - previous.line);
		const elementAbsoluteEnd = window.scrollY + previousTop + rect.height;
		const nextAbsoluteTop = window.scrollY + next.element.getBoundingClientRect().top;
		const betweenHeight = nextAbsoluteTop - elementAbsoluteEnd;
		scrollTo = elementAbsoluteEnd + betweenProgress * betweenHeight;
	} else {
		const progressInElement = line - Math.floor(line);
		scrollTo = window.scrollY + previousTop + (rect.height * progressInElement);
	}


	window.scroll(window.scrollX, Math.max(1, scrollTo));
}

export function getEditorLineNumberForPageOffset(offset: number, documentVersion: number): number | null {
	const { previous, next } = getLineElementsAtPageOffset(offset, documentVersion);
	if (previous) {
		if (previous.line < 0) {
			return 0;
		}
		const previousBounds = getElementBounds(previous);
		const offsetFromPrevious = (offset - window.scrollY - previousBounds.top);


		// Check if previous is a multi-line code block
		if (previous.endLine && previous.endLine > previous.line) {
			// Use content bounds to exclude padding from the calculation
			const contentBounds = getContentBounds(previous);
			const offsetFromContent = offset - window.scrollY - contentBounds.top;


			// Check if we're within the code block's content area (excluding padding)
			if (offsetFromContent >= 0 && offsetFromContent <= contentBounds.height) {
				const progressWithinCodeBlock = offsetFromContent / contentBounds.height;
				const calculatedLine = previous.line + progressWithinCodeBlock * (previous.endLine - previous.line);
				return calculatedLine;
			} else if (next && offsetFromContent > contentBounds.height) {
				// We're in the gap after the code block content (including bottom padding)
				const gapOffset = offsetFromContent - contentBounds.height;
				const nextBounds = getElementBounds(next);
				const contentEnd = contentBounds.top + contentBounds.height;
				const gapHeight = nextBounds.top - contentEnd;
				const progressInGap = gapOffset / gapHeight;
				const calculatedLine = previous.endLine + progressInGap * (next.line - previous.endLine);
				return calculatedLine;
			} else if (offsetFromContent < 0) {
				// We're in the top padding area
				// Fall through to original logic
			}
		}

		// Original logic
		if (next) {
			const progressBetweenElements = offsetFromPrevious / (getElementBounds(next).top - previousBounds.top);
			const calculatedLine = previous.line + progressBetweenElements * (next.line - previous.line);
			return calculatedLine;
		} else {
			const progressWithinElement = offsetFromPrevious / (previousBounds.height);
			const calculatedLine = previous.line + progressWithinElement;
			return calculatedLine;
		}
	}
	return null;
}

/**
 * Try to find the html element by using a fragment id
 */
export function getLineElementForFragment(fragment: string, documentVersion: number): CodeLineElement | undefined {
	return getCodeLineElements(documentVersion).find((element) => {
		return element.element.id === fragment;
	});
}

function* getParentsWithTagName<T extends HTMLElement>(element: HTMLElement, tagName: string): Iterable<T> {
	for (let parent = element.parentElement; parent; parent = parent.parentElement) {
		if (parent.tagName === tagName) {
			yield parent as T;
		}
	}
}

