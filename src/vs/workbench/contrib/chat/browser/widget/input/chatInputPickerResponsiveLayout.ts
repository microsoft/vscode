/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';

const WIDTH_TOLERANCE = 1;

export interface IChatInputPickerResponsiveLayoutDelegate {
	getItems(): readonly IChatInputPickerResponsiveLayoutItem[];
	hasOverflow?(): boolean;
	relayout?(): void;
}

export interface IChatInputPickerResponsiveState {
	isCompact(): boolean;
	setCompact(compact: boolean): void;
}

export interface IChatInputPickerResponsiveLayoutItem extends IChatInputPickerResponsiveState {
	readonly element: HTMLElement | undefined;
}

export function isChatInputPickerResponsiveState(candidate: object | undefined): candidate is IChatInputPickerResponsiveState {
	return !!candidate
		&& 'isCompact' in candidate
		&& typeof candidate.isCompact === 'function'
		&& 'setCompact' in candidate
		&& typeof candidate.setCompact === 'function';
}

/**
 * Compacts a picker lane only when its expanded contents no longer fit the width assigned by its surrounding layout.
 */
export class ChatInputPickerResponsiveLayout extends Disposable {

	private readonly _mutationObserver: MutationObserver;
	private _isLayouting = false;

	constructor(
		name: string,
		private readonly _element: HTMLElement,
		private readonly _delegate: IChatInputPickerResponsiveLayoutDelegate,
	) {
		super();

		const targetWindow = dom.getWindow(_element);
		const resizeObserver = this._register(new dom.DisposableResizeObserver(name, () => this.layout(), targetWindow));
		this._register(resizeObserver.observe(_element));

		this._mutationObserver = new targetWindow.MutationObserver(() => this.layout());
		this._observeMutations();
		this._register(toDisposable(() => this._mutationObserver.disconnect()));
	}

	layout(): void {
		if (this._isLayouting || !this._element.isConnected) {
			return;
		}

		const availableWidth = this._element.getBoundingClientRect().width;
		if (availableWidth <= 0) {
			return;
		}

		this._isLayouting = true;
		this._mutationObserver.disconnect();
		try {
			// Restore as many hidden actions as possible in their shortest form
			// before measuring. Otherwise an overflow menu can hide the very items
			// whose expanded width should keep the lane compact.
			this._setAllCompact(true);
			this._delegate.relayout?.();
			this._setAllCompact(true);
			this._delegate.relayout?.();
			if (this._delegate.hasOverflow?.()) {
				return;
			}

			const items = this._getOrderedVisibleItems();
			for (const item of items) {
				item.setCompact(false);
			}

			for (const item of items) {
				if (this._fitsAvailableWidth(availableWidth)) {
					break;
				}
				item.setCompact(true);
			}
			this._delegate.relayout?.();
		} finally {
			this._observeMutations();
			this._isLayouting = false;
		}
	}

	areAllItemsCompact(): boolean {
		return this._delegate.getItems().every(item => item.isCompact());
	}

	private _setAllCompact(compact: boolean): void {
		for (const item of this._delegate.getItems()) {
			item.setCompact(compact);
		}
	}

	private _getOrderedVisibleItems(): IChatInputPickerResponsiveLayoutItem[] {
		return this._delegate.getItems()
			.filter(item => item.element?.isConnected && item.element.getClientRects().length > 0)
			.sort((a, b) => b.element!.getBoundingClientRect().left - a.element!.getBoundingClientRect().left);
	}

	private _fitsAvailableWidth(availableWidth: number): boolean {
		const items = this._getOrderedVisibleItems();
		const preferredLayout = this._measurePreferredLayout(items);
		if (preferredLayout.width > availableWidth + WIDTH_TOLERANCE) {
			return false;
		}

		const laneBounds = this._element.getBoundingClientRect();
		const itemBounds = items
			.map(item => ({ item, bounds: item.element!.getBoundingClientRect() }))
			.sort((a, b) => a.bounds.left - b.bounds.left);
		for (let index = 0; index < itemBounds.length; index++) {
			const { item, bounds } = itemBounds[index];
			if (bounds.left < laneBounds.left - WIDTH_TOLERANCE || bounds.right > laneBounds.right + WIDTH_TOLERANCE) {
				return false;
			}
			if (index > 0 && bounds.left < itemBounds[index - 1].bounds.right - WIDTH_TOLERANCE) {
				return false;
			}
			const preferredWidth = preferredLayout.itemWidths.get(item);
			if (preferredWidth !== undefined && bounds.width < preferredWidth - WIDTH_TOLERANCE) {
				return false;
			}
		}
		return true;
	}

	private _measurePreferredLayout(items: readonly IChatInputPickerResponsiveLayoutItem[]): { width: number; itemWidths: ReadonlyMap<IChatInputPickerResponsiveLayoutItem, number> } {
		const parent = this._element.parentElement;
		if (!parent) {
			return { width: 0, itemWidths: new Map() };
		}

		const measurementHost = dom.$('.chat-input-picker-measurement-host');
		measurementHost.style.position = 'fixed';
		measurementHost.style.inset = '0 auto auto 0';
		measurementHost.style.width = '0';
		measurementHost.style.height = '0';
		measurementHost.style.overflow = 'hidden';
		measurementHost.style.contain = 'strict';
		measurementHost.style.visibility = 'hidden';
		measurementHost.style.pointerEvents = 'none';

		const measurement = this._element.cloneNode(true) as HTMLElement;
		measurement.setAttribute('aria-hidden', 'true');
		measurement.setAttribute('inert', '');
		measurement.style.position = 'absolute';
		measurement.style.left = '0';
		measurement.style.top = '0';
		measurement.style.width = 'max-content';
		measurement.style.minWidth = 'max-content';
		measurement.style.maxWidth = 'none';
		measurement.style.flex = 'none';
		measurementHost.appendChild(measurement);
		parent.appendChild(measurementHost);
		try {
			const itemWidths = new Map<IChatInputPickerResponsiveLayoutItem, number>();
			for (const item of items) {
				const path = item.element ? this._getElementPath(item.element) : undefined;
				const measuredItem = path ? this._getElementAtPath(measurement, path) : undefined;
				if (measuredItem) {
					measuredItem.style.flex = 'none';
					measuredItem.style.width = 'max-content';
					measuredItem.style.minWidth = 'max-content';
					measuredItem.style.maxWidth = 'none';
					itemWidths.set(item, measuredItem.getBoundingClientRect().width);
				}
			}
			return { width: measurement.getBoundingClientRect().width, itemWidths };
		} finally {
			measurementHost.remove();
		}
	}

	private _getElementPath(element: HTMLElement): readonly number[] | undefined {
		const path: number[] = [];
		let current: HTMLElement | null = element;
		while (current && current !== this._element) {
			const parent: HTMLElement | null = current.parentElement;
			if (!parent) {
				return undefined;
			}
			const index = Array.from(parent.children).indexOf(current);
			if (index < 0) {
				return undefined;
			}
			path.unshift(index);
			current = parent;
		}
		return current === this._element ? path : undefined;
	}

	private _getElementAtPath(root: HTMLElement, path: readonly number[]): HTMLElement | undefined {
		let current: Element = root;
		for (const index of path) {
			const child = current.children.item(index);
			if (!child) {
				return undefined;
			}
			current = child;
		}
		return dom.isHTMLElement(current) ? current : undefined;
	}

	private _observeMutations(): void {
		this._mutationObserver.observe(this._element, {
			attributes: true,
			attributeFilter: ['class', 'hidden', 'style'],
			characterData: true,
			childList: true,
			subtree: true,
		});
	}
}
