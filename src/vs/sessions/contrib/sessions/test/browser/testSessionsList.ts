/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey, isDefined } from '../../../../../base/common/types.js';
import { SessionListItem, SessionsList, SessionsListItemReference } from '../../browser/views/sessionsList.js';

/**
 * A sessions list whose focus, selection, collapse state, and rendered rows can be
 * driven by model identity. For tests and component fixtures only: production code
 * reaches these states through user input and the owning services.
 */
export class TestSessionsList extends SessionsList {

	/** Moves the tree focus to the referenced row, revealing it. Returns `false` when the row is not in the list. */
	setFocusedItem(item: SessionsListItemReference | undefined): boolean {
		if (!item) {
			this.tree.setFocus([]);
			return true;
		}
		const element = this.findItem(item);
		if (!element) {
			return false;
		}
		this.revealElement(element);
		this.tree.setFocus([element]);
		return true;
	}

	/** Selects the referenced session and chat rows. Returns `false` when a row is missing or is a header. */
	setSelectedItems(items: readonly SessionsListItemReference[]): boolean {
		if (!items.every(item => hasKey(item, { session: true }))) {
			return false;
		}
		const elements = items.map(item => this.findItem(item));
		if (!elements.every(isDefined)) {
			return false;
		}
		for (const element of elements) {
			this.tree.expandTo(element);
		}
		this.tree.setSelection(elements);
		return true;
	}

	/** Collapses or expands the referenced row. Returns `false` when the row is missing or not collapsible. */
	setItemCollapsed(item: SessionsListItemReference, collapsed: boolean): boolean {
		const element = this.findItem(item);
		if (!element || !this.tree.isCollapsible(element)) {
			return false;
		}
		this.tree.expandTo(element);
		if (collapsed) {
			this.tree.collapse(element);
		} else {
			this.tree.expand(element);
		}
		return true;
	}

	/** Scrolls the referenced row into view, expanding its ancestors. Returns `false` when the row is not in the list. */
	revealItem(item: SessionsListItemReference): boolean {
		const element = this.findItem(item);
		if (!element) {
			return false;
		}
		this.revealElement(element);
		return true;
	}

	/** Returns the rendered row of the referenced item, or `undefined` while it is collapsed or scrolled out of view. */
	getItemRow(item: SessionsListItemReference): HTMLElement | undefined {
		const element = this.findItem(item);
		if (!element) {
			return undefined;
		}
		const navigator = this.tree.navigate();
		for (let current = navigator.first(), index = 0; current; current = navigator.next(), index++) {
			if (current === element) {
				return this.tree.getHTMLElement().querySelector<HTMLElement>(`.monaco-list-rows > .monaco-list-row[data-index="${index}"]`) ?? undefined;
			}
		}
		return undefined;
	}

	private revealElement(element: SessionListItem): void {
		if (this.tree.getRelativeTop(element) === null) {
			this.tree.reveal(element, 0.5);
		}
	}
}
