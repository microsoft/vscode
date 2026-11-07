/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface TocEntry {
	readonly element: HTMLElement;
	readonly level: number;
	readonly text: string;
	readonly id: string;
}

const TOC_CLASS = 'markdown-toc';
const TOC_ENTRY_CLASS = 'markdown-toc-entry';
const TOC_ACTIVE_CLASS = 'active';
const TOC_BODY_CLASS = 'has-toc';
const TOC_RESIZE_HANDLE_CLASS = 'markdown-toc-resize-handle';
const TOC_RESIZING_BODY_CLASS = 'resizing-toc';
const TOC_WIDTH_STORAGE_KEY = 'markdown.tocWidth';
const TOC_MIN_WIDTH = 120;
const TOC_MAX_WIDTH = 500;
const TOC_EDGE_GAP = 4;

let tocEntries: TocEntry[] = [];
let tocPanel: HTMLElement | undefined;
let tocList: HTMLElement | undefined;
let activeEntry: HTMLElement | undefined;
let tocVisible = true;

/**
 * Build the table of contents from the headings in the document.
 * Safe to call multiple times (e.g. after the document is re-rendered).
 */
export function buildTableOfContents(): void {
	removeTableOfContents();
	if (!tocVisible) {
		return;
	}

	const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
		.filter(heading => heading.classList.contains('code-line'));

	if (headings.length === 0) {
		return;
	}

	// Activate the two-column layout (TOC on the left, content on the right).
	document.body.classList.add(TOC_BODY_CLASS);

	tocEntries = headings.map(heading => {
		const id = heading.id || '';
		return {
			element: heading,
			level: Number(heading.tagName[1]),
			text: heading.textContent?.trim() || '',
			id
		};
	});

	tocPanel = document.createElement('nav');
	tocPanel.className = TOC_CLASS;
	tocPanel.setAttribute('aria-label', 'Table of contents');

	// Restore the persisted width, if any.
	const savedWidth = Number(localStorage.getItem(TOC_WIDTH_STORAGE_KEY));
	if (savedWidth >= TOC_MIN_WIDTH && savedWidth <= TOC_MAX_WIDTH) {
		setTocWidth(savedWidth);
	}

	// Drag handle to resize the TOC column.
	const resizeHandle = document.createElement('div');
	resizeHandle.className = TOC_RESIZE_HANDLE_CLASS;
	resizeHandle.setAttribute('role', 'separator');
	resizeHandle.setAttribute('aria-orientation', 'vertical');
	resizeHandle.setAttribute('aria-label', 'Resize table of contents');
	resizeHandle.addEventListener('mousedown', (e) => {
		e.preventDefault();
		startResizing(e.clientX);
	});
	tocPanel.appendChild(resizeHandle);

	tocList = document.createElement('ul');
	tocPanel.appendChild(tocList);

	for (const entry of tocEntries) {
		const item = document.createElement('li');
		item.className = TOC_ENTRY_CLASS;
		item.style.setProperty('--toc-level', String(entry.level));

		const link = document.createElement('a');
		link.href = entry.id ? `#${entry.id}` : '#';
		link.textContent = entry.text;
		link.addEventListener('click', (e) => {
			e.preventDefault();
			entry.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
		item.appendChild(link);
		tocList.appendChild(item);
	}

	document.body.appendChild(tocPanel);
	updateActiveTocEntry();
}

/**
 * Remove the table of contents panel, if present.
 */
export function removeTableOfContents(): void {
	tocPanel?.remove();
	tocPanel = undefined;
	tocList = undefined;
	tocEntries = [];
	activeEntry = undefined;
	document.body.classList.remove(TOC_BODY_CLASS);
}

/**
 * Toggle the visibility of the table of contents. When hidden, the TOC panel
 * is removed and the body layout returns to normal. When shown, the TOC is
 * rebuilt from the document headings.
 */
export function toggleTableOfContents(): void {
	tocVisible = !tocVisible;
	if (tocVisible) {
		buildTableOfContents();
	} else {
		removeTableOfContents();
	}
}

/**
 * Update which TOC entry is highlighted based on the current scroll position.
 * Called on scroll and on resize.
 */
export function updateActiveTocEntry(): void {
	if (!tocList || tocEntries.length === 0) {
		return;
	}

	// Find the last heading whose top is above (or at) the top of the viewport.
	let current: TocEntry | undefined;
	for (const entry of tocEntries) {
		if (entry.element.getBoundingClientRect().top <= 1) {
			current = entry;
		} else {
			break;
		}
	}

	// When scrolled to the very top of the document, if the document starts
	// with a heading, that heading should be considered active.
	if (!current && isFirstElementOfDocument(tocEntries[0].element)) {
		const firstHeadingTop = tocEntries[0].element.getBoundingClientRect().top;
		if (firstHeadingTop > 0 && firstHeadingTop < 100) {
			current = tocEntries[0];
		}
	}

	const nextActive = current
		? tocList.children[Math.max(0, tocEntries.indexOf(current))]
		: undefined;

	if (nextActive === activeEntry) {
		return;
	}

	activeEntry?.classList.remove(TOC_ACTIVE_CLASS);
	activeEntry = nextActive as HTMLElement | undefined;
	activeEntry?.classList.add(TOC_ACTIVE_CLASS);

	// Keep the active entry visible in the TOC column. If the active heading
	// is scrolled out of the visible part of the TOC, scroll the TOC so that
	// it comes back into view, leaving a small gap at the top.
	scrollActiveEntryIntoView();
}

/**
 * Scroll the TOC column so that the active entry stays visible, with a small
 * gap between the entry and the top/bottom edges of the TOC. Only scrolls
 * the minimal amount needed — the spacing between entries is unchanged and
 * the next entry is not revealed.
 */
function scrollActiveEntryIntoView(): void {
	if (!tocPanel || !activeEntry) {
		return;
	}

	const panelRect = tocPanel.getBoundingClientRect();
	const entryRect = activeEntry.getBoundingClientRect();

	if (entryRect.top < panelRect.top + TOC_EDGE_GAP) {
		// Entry is above the visible area (or too close to the top edge):
		// scroll up so it sits just below the top edge.
		tocPanel.scrollTop -= (panelRect.top + TOC_EDGE_GAP - entryRect.top);
	} else if (entryRect.bottom > panelRect.bottom - TOC_EDGE_GAP) {
		// Entry is below the visible area (or too close to the bottom edge):
		// scroll down just enough so it sits just above the bottom edge.
		tocPanel.scrollTop += (entryRect.bottom - (panelRect.bottom - TOC_EDGE_GAP));
	}
}

/**
 * Check whether the given element is the first meaningful element of the
 * document body (i.e. the document starts with this element).
 */
function isFirstElementOfDocument(element: HTMLElement): boolean {
	// The first `code-line` element inside the markdown body is the first
	// rendered element of the document. If it is the given heading, then the
	// document starts with that heading.
	const firstCodeLine = document.querySelector('.markdown-body .code-line');
	return firstCodeLine === element;
}

/**
 * Set the TOC column width. The variable is set on both the body (for the
 * content padding) and the TOC panel (for the column width).
 */
function setTocWidth(width: number): void {
	document.body.style.setProperty('--toc-width', `${width}px`);
	tocPanel?.style.setProperty('--toc-width', `${width}px`);
}

/**
 * Start resizing the TOC column by dragging the resize handle.
 */
function startResizing(startX: number): void {
	if (!tocPanel) {
		return;
	}

	const startWidth = tocPanel.getBoundingClientRect().width;
	document.body.classList.add(TOC_RESIZING_BODY_CLASS);

	const onMouseMove = (e: MouseEvent) => {
		const newWidth = Math.min(TOC_MAX_WIDTH, Math.max(TOC_MIN_WIDTH, startWidth + (e.clientX - startX)));
		setTocWidth(newWidth);
	};

	const onMouseUp = () => {
		document.body.classList.remove(TOC_RESIZING_BODY_CLASS);
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mouseup', onMouseUp);

		// Persist the final width.
		if (tocPanel) {
			const finalWidth = tocPanel.getBoundingClientRect().width;
			localStorage.setItem(TOC_WIDTH_STORAGE_KEY, String(Math.round(finalWidth)));
		}
	};

	window.addEventListener('mousemove', onMouseMove);
	window.addEventListener('mouseup', onMouseUp);
}
