/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
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
export function wrapTablesWithScrollable(domNode, layoutParticipants) {
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
        const scrollable = store.add(new DomScrollableElement(tableContainer, {
            vertical: 2 /* ScrollbarVisibility.Hidden */,
            horizontal: 1 /* ScrollbarVisibility.Auto */,
        }));
        const scrollNode = scrollable.getDomNode();
        scrollNode.classList.add('rendered-markdown-table-scroll-wrapper');
        parent?.insertBefore(scrollNode, nextSibling);
        layoutParticipants.value.add(() => { scrollable.scanDomNode(); });
        scrollable.scanDomNode();
    }
    return store;
}
/** Maximum `min-width` (in `ch`) applied to any table column, regardless of its content length. */
const TABLE_COLUMN_MIN_WIDTH_CAP_CH = 3;
function applyTableColumnMinWidths(table) {
    const rows = table.rows;
    const colMaxChars = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hcmtkb3duVGFibGVTY3JvbGxpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duVGFibGVTY3JvbGxpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUV4RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFJN0U7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsT0FBb0IsRUFBRSxrQkFBeUM7SUFDdkcsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUNwQyxnREFBZ0Q7SUFDaEQsS0FBSyxNQUFNLEtBQUssSUFBSSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUN2RCxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQy9CLFNBQVM7UUFDVixDQUFDO1FBRUQseUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFakMsd0VBQXdFO1FBQ3hFLG1FQUFtRTtRQUNuRSx5RUFBeUU7UUFDekUsZ0ZBQWdGO1FBQ2hGLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFDbkMsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQztRQUN0QyxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JELGNBQWMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyx5QkFBeUI7UUFDNUQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLGNBQWMsRUFBRTtZQUNyRSxRQUFRLG9DQUE0QjtZQUNwQyxVQUFVLGtDQUEwQjtTQUNwQyxDQUFDLENBQUMsQ0FBQztRQUNKLE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUMzQyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sRUFBRSxZQUFZLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTlDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEUsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxtR0FBbUc7QUFDbkcsTUFBTSw2QkFBNkIsR0FBRyxDQUFDLENBQUM7QUFFeEMsU0FBUyx5QkFBeUIsQ0FBQyxLQUF1QjtJQUN6RCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBQ3hCLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztJQUNqQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3hCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzNDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLE1BQU0sSUFBSSxDQUFDLENBQUM7WUFDbEQsSUFBSSxHQUFHLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDakMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUN0QixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFDRCxxRUFBcUU7SUFDckUsdUVBQXVFO0lBQ3ZFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6QixJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksS0FBSyxLQUFLLFNBQVMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSw2QkFBNkIsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUMxRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDIn0=