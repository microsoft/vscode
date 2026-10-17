/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';

import { INewScrollDimensions, INewScrollPosition, ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';

/** A wrapped table whose scrollbar is re-measured from the table container's layout. */
interface ITableScrollable {
	readonly container: HTMLElement;
	readonly scrollable: DomScrollableElement;
	/** The batch this table is waiting in, if any. */
	pending: Set<ITableScrollable> | undefined;
	disposed: boolean;
}

/**
 * Tables waiting to be re-measured at the next animation frame, per window. All of them are measured before any
 * scrollbar is updated, because scanning them one by one forces a synchronous layout of the transcript per table.
 */
const pendingTableScans = new WeakMap<Window, Set<ITableScrollable>>();

function scheduleTableScan(table: ITableScrollable): void {
	if (table.pending || table.disposed) {
		return;
	}
	const targetWindow = dom.getWindow(table.container);
	let pending = pendingTableScans.get(targetWindow);
	if (!pending) {
		const tables = pending = new Set<ITableScrollable>();
		pendingTableScans.set(targetWindow, tables);
		let measurements: ITableMeasurement[] = [];
		dom.measure(targetWindow, () => {
			pendingTableScans.delete(targetWindow);
			measurements = Array.from(tables, measureTable);
		});
		dom.modify(targetWindow, () => {
			for (const { table, dimensions, position } of measurements) {
				if (!table.disposed) {
					table.scrollable.setScrollDimensions(dimensions);
					table.scrollable.setScrollPosition(position);
				}
			}
		});
	}
	pending.add(table);
	table.pending = pending;
}

interface ITableMeasurement {
	readonly table: ITableScrollable;
	readonly dimensions: INewScrollDimensions;
	readonly position: INewScrollPosition;
}

/** Performs the layout reads of {@link DomScrollableElement.scanDomNode} without updating the scrollbar. */
function measureTable(table: ITableScrollable): ITableMeasurement {
	table.pending = undefined;
	const { container } = table;
	return {
		table,
		dimensions: { width: container.clientWidth, scrollWidth: container.scrollWidth, height: container.clientHeight, scrollHeight: container.scrollHeight },
		position: { scrollLeft: container.scrollLeft, scrollTop: container.scrollTop },
	};
}

/**
 * Finds all tables in `domNode` and wraps each in a {@link DomScrollableElement}
 * so they scroll horizontally with the custom VS Code scrollbar instead of the
 * native one. Each wrapped table is pushed onto `orderedDisposablesList` and a
 * callback is registered on `layoutParticipants` so the scrollbar re-measures
 * whenever the container is resized. Measuring is batched with all other tables
 * in the window at the next animation frame, so it never forces a layout per table.
 *
 * Each column's `min-width` is also set to the maximum character count across
 * all cells in that column (in `ch` units), preventing short-content columns
 * like "001" from being squeezed to one character wide. Single-character columns
 * are left unchanged. This is layout-free: only `textContent` lengths are read.
 */
export function wrapTablesWithScrollable(domNode: HTMLElement, layoutParticipants: Lazy<Set<() => void>>): DisposableStore {
	const store = new DisposableStore();
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
		const scrollable = store.add(new DomScrollableElement(tableContainer, { // moves tableContainer into scrollNode
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
		}));
		const scrollNode = scrollable.getDomNode();
		scrollNode.classList.add('rendered-markdown-table-scroll-wrapper');
		parent?.insertBefore(scrollNode, nextSibling);

		const tableScrollable: ITableScrollable = { container: tableContainer, scrollable, pending: undefined, disposed: false };
		store.add(toDisposable(() => {
			tableScrollable.disposed = true;
			tableScrollable.pending?.delete(tableScrollable);
			tableScrollable.pending = undefined;
		}));
		layoutParticipants.value.add(() => scheduleTableScan(tableScrollable));
		scheduleTableScan(tableScrollable);
	}
	return store;
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
	// Apply min-width only to the first row's cells so each column width
	// constraint is set once rather than touching every cell in the table.
	const firstRow = rows[0];
	if (firstRow) {
		for (let c = 0; c < firstRow.cells.length; c++) {
			const minCh = colMaxChars[c];
			if (minCh !== undefined && minCh > 1) {
				firstRow.cells[c].style.minWidth = Math.min(minCh, TABLE_COLUMN_MIN_WIDTH_CAP_CH) + 'ch';
			}
		}
	}
}
