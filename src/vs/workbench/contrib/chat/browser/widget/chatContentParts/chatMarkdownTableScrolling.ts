/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';

/**
 * Finds all tables in `domNode` and wraps each in a {@link DomScrollableElement}
 * so they scroll horizontally with the custom VS Code scrollbar instead of the
 * native one. Each wrapped table is pushed onto `orderedDisposablesList` and a
 * `scanDomNode` callback is registered on `layoutParticipants` so the scrollbar
 * re-measures whenever the container is resized.
 *
 * Each column's `min-width` is also set to the maximum character count across
 * all cells in that column (in `ch` units), preventing short-content columns
 * like "001" from being squeezed to one character wide. Single-character columns
 * are left unchanged. This is layout-free: only `textContent` lengths are read.
 */
export function wrapTablesWithScrollable(domNode: HTMLElement, orderedDisposablesList: IDisposable[], layoutParticipants: Lazy<Set<() => void>>): void {
	// eslint-disable-next-line no-restricted-syntax
	for (const table of domNode.querySelectorAll('table')) {
		if (!dom.isHTMLElement(table)) {
			continue;
		}

		applyTableColumnMinWidths(table);

		// Wrap the table in a div so DomScrollableElement can compare the div's
		// constrained clientWidth against the table's natural scrollWidth.
		// Passing the table directly doesn't work because a table always expands
		// to its content width, so clientWidth == scrollWidth and no scrollbar appears.
		const parent = table.parentElement;
		const nextSibling = table.nextSibling;
		const tableContainer = document.createElement('div');
		tableContainer.appendChild(table); // moves table out of DOM
		const scrollable = new DomScrollableElement(tableContainer, { // moves tableContainer into scrollNode
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
		});
		orderedDisposablesList.push(scrollable);
		const scrollNode = scrollable.getDomNode();
		scrollNode.classList.add('rendered-markdown-table-scroll-wrapper');
		parent?.insertBefore(scrollNode, nextSibling);

		layoutParticipants.value.add(() => { scrollable.scanDomNode(); });
		scrollable.scanDomNode();
	}
}

/** Maximum `min-width` (in `ch`) applied to any table column, regardless of its content length. */
const TABLE_COLUMN_MIN_WIDTH_CAP_CH = 3;

function applyTableColumnMinWidths(table: HTMLTableElement): void {
	const rows = table.rows;
	const colMaxChars: number[] = [];
	for (const row of rows) {
		for (let c = 0; c < row.cells.length; c++) {
			const len = row.cells[c].textContent?.length ?? 0;
			if (len > (colMaxChars[c] ?? 0)) {
				colMaxChars[c] = len;
			}
		}
	}
	for (const row of rows) {
		for (let c = 0; c < row.cells.length; c++) {
			const minCh = colMaxChars[c];
			if (minCh !== undefined && minCh > 1) {
				row.cells[c].style.minWidth = Math.min(minCh, TABLE_COLUMN_MIN_WIDTH_CAP_CH) + 'ch';
			}
		}
	}
}
