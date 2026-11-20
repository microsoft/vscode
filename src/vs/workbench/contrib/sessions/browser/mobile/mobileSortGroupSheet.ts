/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileSortGroupSheet.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { showMobileContentSheet } from './mobilePickerSheet.js';

const $ = DOM.$;

/**
 * One row in the {@link showMobileSortGroupSheet} bottom sheet.
 */
export interface IMobileSortGroupSheetItem {
	readonly id: string;
	readonly label: string;
	readonly checked: boolean;
	/**
	 * Logical group used for visually separating sort vs. group toggles
	 * with a divider. Items with the same `group` value render together.
	 */
	readonly group: string;
	/**
	 * Optional section title rendered above this group's first item. Only
	 * the first item of a `group` should set `groupTitle` — subsequent
	 * items reuse the existing section.
	 */
	readonly groupTitle?: string;
}

/**
 * Show a phone-friendly bottom sheet of single-select toggle items.
 *
 * Renders as a fixed-position overlay docked at the bottom of the
 * viewport with a translucent backdrop. Tapping a row resolves with that
 * row's `id`; tapping the backdrop, the close button, or pressing Escape
 * resolves with `undefined`.
 *
 * The sheet is purpose-built for mobile UX (large touch targets, native
 * sheet feel, safe-area-aware) — it is intentionally simpler than a
 * generic context menu / quick pick.
 *
 * @param workbenchContainer The workbench root element. The overlay is
 * appended here and removed on dismiss.
 * @param title Sheet title displayed in the header.
 * @param items Items to render. Items grouped by `group` are visually
 * separated.
 * @returns A promise that resolves with the selected item id, or
 * `undefined` if dismissed without selection.
 */
export async function showMobileSortGroupSheet(
	workbenchContainer: HTMLElement,
	title: string,
	items: readonly IMobileSortGroupSheetItem[],
): Promise<string | undefined> {
	let selectedId: string | undefined;
	await showMobileContentSheet(workbenchContainer, title, (list, api) => {
		const disposables = new DisposableStore();
		const focusTargets: HTMLElement[] = [];
		list.classList.add('mobile-sort-group-sheet-list');
		list.setAttribute('role', 'listbox');

		let lastGroup: string | undefined;
		let firstRow: HTMLButtonElement | undefined;
		let firstCheckedRow: HTMLButtonElement | undefined;
		for (const item of items) {
			if (item.group !== lastGroup) {
				if (lastGroup !== undefined) {
					DOM.append(list, $('div.mobile-sort-group-sheet-divider'));
				}
				if (item.groupTitle) {
					const sectionTitle = DOM.append(list, $('div.mobile-sort-group-sheet-section-title'));
					sectionTitle.textContent = item.groupTitle;
				}
				lastGroup = item.group;
			}

			const row = DOM.append(list, $('button.mobile-sort-group-sheet-item', { type: 'button' })) as HTMLButtonElement;
			row.setAttribute('role', 'option');
			row.setAttribute('aria-selected', String(item.checked));
			if (item.checked) {
				row.classList.add('checked');
			}
			focusTargets.push(row);
			firstRow ??= row;
			if (item.checked && !firstCheckedRow) {
				firstCheckedRow = row;
			}

			const checkSlot = DOM.append(row, $('span.mobile-sort-group-sheet-check', { 'aria-hidden': 'true' }));
			if (item.checked) {
				checkSlot.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
			}
			DOM.append(row, $('span.mobile-sort-group-sheet-label')).textContent = item.label;

			disposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, (e: MouseEvent) => {
				e.preventDefault();
				selectedId = item.id;
				api.close();
			}));
		}

		api.setBodyFocusTargets(focusTargets);
		(firstCheckedRow ?? firstRow)?.focus();
		return disposables;
	}, { iconClose: true, trapFocus: true });
	return selectedId;
}
