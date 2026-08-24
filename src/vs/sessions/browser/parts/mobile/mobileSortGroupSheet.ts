/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileSortGroupSheet.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { localize } from '../../../../nls.js';

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
export function showMobileSortGroupSheet(
	workbenchContainer: HTMLElement,
	title: string,
	items: readonly IMobileSortGroupSheetItem[],
): Promise<string | undefined> {
	return new Promise<string | undefined>(resolve => {
		const disposables: (() => void)[] = [];
		let resolved = false;

		const finish = (id: string | undefined) => {
			if (resolved) {
				return;
			}
			resolved = true;
			// Animate sheet out before removal for a more native feel.
			sheet.classList.add('closing');
			backdrop.classList.add('closing');
			DOM.getWindow(workbenchContainer).setTimeout(() => {
				for (const d of disposables) {
					try { d(); } catch { /* ignore */ }
				}
				overlay.remove();
				resolve(id);
			}, 180);
		};

		// -- DOM: backdrop + sheet -------------------------------------
		const overlay = DOM.append(workbenchContainer, $('div.mobile-sort-group-sheet-overlay'));
		const backdrop = DOM.append(overlay, $('div.mobile-sort-group-sheet-backdrop'));
		const sheet = DOM.append(overlay, $('div.mobile-sort-group-sheet'));
		sheet.setAttribute('role', 'dialog');
		sheet.setAttribute('aria-modal', 'true');
		sheet.setAttribute('aria-label', title);

		// -- Header (handle bar + title + close) -----------------------
		DOM.append(sheet, $('div.mobile-sort-group-sheet-handle'));
		const header = DOM.append(sheet, $('div.mobile-sort-group-sheet-header'));
		DOM.append(header, $('div.mobile-sort-group-sheet-title')).textContent = title;
		const closeBtn = DOM.append(header, $('button.mobile-sort-group-sheet-close', { type: 'button' })) as HTMLButtonElement;
		closeBtn.setAttribute('aria-label', localize('sortGroupSheet.close', "Close"));
		DOM.append(closeBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
		const closeGesture = Gesture.addTarget(closeBtn);
		disposables.push(() => closeGesture.dispose());
		const closeClick = DOM.addDisposableListener(closeBtn, DOM.EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			finish(undefined);
		});
		disposables.push(() => closeClick.dispose());
		const closeTap = DOM.addDisposableListener(closeBtn, TouchEventType.Tap, () => finish(undefined));
		disposables.push(() => closeTap.dispose());

		// -- Items list ------------------------------------------------
		const list = DOM.append(sheet, $('div.mobile-sort-group-sheet-list'));
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
			firstRow ??= row;
			if (item.checked && !firstCheckedRow) {
				firstCheckedRow = row;
			}

			const checkSlot = DOM.append(row, $('span.mobile-sort-group-sheet-check'));
			if (item.checked) {
				checkSlot.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
			}
			DOM.append(row, $('span.mobile-sort-group-sheet-label')).textContent = item.label;

			const rowGesture = Gesture.addTarget(row);
			disposables.push(() => rowGesture.dispose());
			const rowClick = DOM.addDisposableListener(row, DOM.EventType.CLICK, (e: MouseEvent) => {
				e.preventDefault();
				finish(item.id);
			});
			disposables.push(() => rowClick.dispose());
			const rowTap = DOM.addDisposableListener(row, TouchEventType.Tap, () => finish(item.id));
			disposables.push(() => rowTap.dispose());
		}

		// -- Dismissal: backdrop + Escape ------------------------------
		const backdropClick = DOM.addDisposableListener(backdrop, DOM.EventType.CLICK, () => finish(undefined));
		disposables.push(() => backdropClick.dispose());
		const backdropGesture = Gesture.addTarget(backdrop);
		disposables.push(() => backdropGesture.dispose());
		const backdropTap = DOM.addDisposableListener(backdrop, TouchEventType.Tap, () => finish(undefined));
		disposables.push(() => backdropTap.dispose());

		const keyHandler = DOM.addDisposableListener(DOM.getWindow(workbenchContainer), DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				finish(undefined);
			}
		}, true);
		disposables.push(() => keyHandler.dispose());

		// Focus the first checked row (or the first row) for keyboard users.
		(firstCheckedRow ?? firstRow)?.focus();
	});
}
