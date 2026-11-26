/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';

const $ = DOM.$;

/**
 * Focuses the first visible item unless a visible entry is already focused,
 * for example when focus was kept on an entry inside a collapsed group.
 */
export function focusFirstCustomizationTreeItem<T>(
	list: { getFocus(): readonly (T | null)[]; setFocus(elements: T[]): void },
	entries: readonly T[],
	isItem: (entry: T) => boolean,
	isVisible: (entry: T) => boolean = () => true,
): void {
	if (!list.getFocus().some(entry => entry !== null && isVisible(entry))) {
		const firstItem = entries.find(entry => isItem(entry) && isVisible(entry)) ?? entries[0];
		if (firstItem) {
			list.setFocus([firstItem]);
		}
	}
}

export function createCustomizationCardPrimaryAction(parent: HTMLElement, ariaLabel: string, ...classNames: string[]): HTMLButtonElement {
	const button = DOM.append(parent, $('button.customization-card-primary-action')) as HTMLButtonElement;
	button.type = 'button';
	button.setAttribute('aria-label', ariaLabel);
	button.classList.add(...classNames);
	return button;
}

export function setVirtualizedRowActionsTabbable(container: HTMLElement, tabbable: boolean): void {
	const visit = (element: Element): void => {
		if (DOM.isHTMLElement(element)) {
			const role = element.getAttribute('role');
			const isAction = DOM.isHTMLButtonElement(element)
				|| DOM.isHTMLAnchorElement(element) && element.hasAttribute('href')
				|| role === 'button'
				|| role === 'switch'
				|| role === 'checkbox'
				|| role === 'menuitem';
			if (isAction) {
				const disabled = DOM.isHTMLButtonElement(element) && element.disabled || element.getAttribute('aria-disabled') === 'true';
				const tabIndex = tabbable && !disabled ? 0 : -1;
				if (element.tabIndex !== tabIndex) {
					element.tabIndex = tabIndex;
				}
			}
		}
		for (const child of element.children) {
			visit(child);
		}
	};
	visit(container);
}

export function stopListRowActionKeyDownPropagation(container: HTMLElement): IDisposable {
	return DOM.addDisposableListener(container, DOM.EventType.KEY_DOWN, event => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.stopPropagation();
		}
	});
}
