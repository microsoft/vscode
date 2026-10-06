/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { onDidChangeZoomLevel } from '../../../../../../base/browser/browser.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';

const WIDTH_TOLERANCE = 1;

export interface IChatInputPickerResponsiveLayoutDelegate {
	getItems(): readonly IChatInputPickerResponsiveLayoutItem[];
	/** Size a content-fitting lane against its intrinsic width, ignoring animated item bounds. */
	readonly usePreferredWidth?: boolean;
	isCompactionEnabled?(): boolean;
	hasOverflow?(): boolean;
	relayout?(): void;
}

export interface IChatInputPickerResponsiveState {
	isCompact(): boolean;
	setCompact(compact: boolean): void;
	isMinimal?(): boolean;
	setMinimal?(minimal: boolean): void;
}

export interface IChatInputPickerResponsiveLayoutItem extends IChatInputPickerResponsiveState {
	readonly id?: string;
	readonly element: HTMLElement | undefined;
	/** Let the item's CSS minimum width determine when its expanded form compacts. */
	readonly canShrink?: boolean;
}

export function isChatInputPickerResponsiveState(candidate: object | undefined): candidate is IChatInputPickerResponsiveState {
	return !!candidate
		&& 'isCompact' in candidate
		&& typeof candidate.isCompact === 'function'
		&& 'setCompact' in candidate
		&& typeof candidate.setCompact === 'function';
}

const enum PickerPresentation {
	Expanded,
	Compact,
	Minimal,
}

interface IPickerLayoutStep {
	readonly presentations: readonly PickerPresentation[];
	readonly width: number;
}

interface IPickerLayoutMeasurement {
	readonly items: readonly IChatInputPickerResponsiveLayoutItem[];
	readonly order: readonly number[];
	readonly steps: IPickerLayoutStep[];
}

function getPresentation(item: IChatInputPickerResponsiveLayoutItem): PickerPresentation {
	return item.isMinimal?.() ? PickerPresentation.Minimal : item.isCompact() ? PickerPresentation.Compact : PickerPresentation.Expanded;
}

function sameItems(a: readonly IChatInputPickerResponsiveLayoutItem[], b: readonly IChatInputPickerResponsiveLayoutItem[]): boolean {
	return a.length === b.length && a.every((item, index) =>
		item.id === b[index].id && item.element === b[index].element && item.canShrink === b[index].canShrink && !!item.setMinimal === !!b[index].setMinimal);
}

function fit(steps: readonly IPickerLayoutStep[], availableWidth: number): IPickerLayoutStep | undefined {
	return steps.find(step => step.width <= availableWidth + WIDTH_TOLERANCE);
}

function withoutDimensions(style: string | null): string {
	return (style ?? '').split(';').filter(property => !/^\s*(width|height)\s*:/.test(property)).join(';');
}

/**
 * Measures presentation thresholds on content changes, then fits the lane without expanding and measuring live pickers on every resize.
 */
export class ChatInputPickerResponsiveLayout extends Disposable {

	private readonly _mutationObserver: MutationObserver;
	private readonly _scheduledLayout = this._register(new MutableDisposable());
	private _isLayouting = false;
	private _measurement: IPickerLayoutMeasurement | undefined;
	private _lastLayout: {
		width: number;
		items: readonly IChatInputPickerResponsiveLayoutItem[];
		presentations: readonly PickerPresentation[];
		compactionEnabled: boolean;
		overflow: boolean;
	} | undefined;

	constructor(
		name: string,
		private readonly _element: HTMLElement,
		private readonly _delegate: IChatInputPickerResponsiveLayoutDelegate,
		resizeObserverCtor?: typeof ResizeObserver,
	) {
		super();

		const targetWindow = dom.getWindow(_element);
		const resizeObserver = this._register(new dom.DisposableResizeObserver(name, entries => {
			this.layout(entries[0]?.borderBoxSize[0]?.inlineSize);
		}, targetWindow, { resizeObserverCtor }));
		this._register(resizeObserver.observe(_element, { box: 'border-box' }));

		this._mutationObserver = new targetWindow.MutationObserver(records => {
			if (this._hasContentChanges(records)) {
				this.invalidate();
			} else {
				this.scheduleLayout();
			}
		});
		this._observeMutations();
		this._register(toDisposable(() => this._mutationObserver.disconnect()));
		this._register(dom.addDisposableListener(targetWindow.document.fonts, 'loadingdone', () => this.invalidate()));
		this._register(onDidChangeZoomLevel(windowId => {
			if (windowId === targetWindow.vscodeWindowId) {
				this.invalidate();
			}
		}));
	}

	/** Coalesces parent layout and content notifications without waiting for resizing to finish. */
	scheduleLayout(): void {
		if (!this._store.isDisposed && !this._scheduledLayout.value) {
			this._scheduledLayout.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this._element), () => this.layout());
		}
	}

	/** Call when styles or configuration outside the observed lane change its intrinsic sizes. */
	invalidate(): void {
		this._measurement = undefined;
		this._lastLayout = undefined;
		this.scheduleLayout();
	}

	layout(availableWidth?: number): void {
		if (this._store.isDisposed || this._isLayouting) {
			return;
		}

		this._scheduledLayout.clear();
		if (!this._element.isConnected) {
			this._measurement = undefined;
			this._lastLayout = undefined;
			return;
		}
		if (this._hasContentChanges(this._mutationObserver.takeRecords())) {
			this._measurement = undefined;
			this._lastLayout = undefined;
		}
		availableWidth ??= this._element.getBoundingClientRect().width;
		if (availableWidth <= 0) {
			this._measurement = undefined;
			this._lastLayout = undefined;
			return;
		}

		const items = this._delegate.getItems();
		const compactionEnabled = this._delegate.isCompactionEnabled?.() !== false;
		const overflow = !!this._delegate.hasOverflow?.();
		const unchangedItems = this._lastLayout && sameItems(items, this._lastLayout.items)
			&& items.every((item, index) => getPresentation(item) === this._lastLayout!.presentations[index]);
		if (unchangedItems && this._lastLayout?.width === availableWidth && this._lastLayout.compactionEnabled === compactionEnabled && this._lastLayout.overflow === overflow) {
			return;
		}
		if (!unchangedItems) {
			this._measurement = undefined;
		}

		this._isLayouting = true;
		this._mutationObserver.disconnect();
		try {
			if (!this._restoreCompactItems()) {
				return;
			}

			const items = this._delegate.getItems();
			if (this._measurement && !sameItems(items, this._measurement.items)) {
				this._measurement = undefined;
			}
			if (!compactionEnabled) {
				this._apply(items, items.map(() => PickerPresentation.Expanded));
				return;
			}

			if (!this._measurement) {
				const order = this._getVisibleItemBounds()
					.sort((a, b) => b.bounds.left - a.bounds.left)
					.map(({ item }) => items.findIndex(candidate => candidate.element === item.element));
				const presentations = items.map(getPresentation);
				for (const index of order) {
					presentations[index] = PickerPresentation.Expanded;
				}
				this._apply(items, presentations);
				this._delegate.relayout?.();
				this._measurement = {
					items: items.map(item => ({ ...item })), order,
					steps: [{ presentations, width: this._measurePreferredLayout(items).width }],
				};
			}

			const measurement = this._measurement;
			let fittingStep = fit(measurement.steps, availableWidth);
			while (!fittingStep) {
				const presentations = [...measurement.steps[measurement.steps.length - 1].presentations];
				const index = measurement.order.find(index => presentations[index] < (items[index].setMinimal ? PickerPresentation.Minimal : PickerPresentation.Compact));
				if (index === undefined) {
					break;
				}
				presentations[index]++;
				this._apply(items, presentations);
				const step = { presentations, width: this._measurePreferredLayout(items).width };
				measurement.steps.push(step);
				fittingStep = fit([step], availableWidth);
			}
			const step = fittingStep ?? measurement.steps[measurement.steps.length - 1];
			this._apply(items, step.presentations);
			if (!fittingStep) {
				this._delegate.relayout?.();
			}
		} finally {
			const items = this._delegate.getItems();
			this._lastLayout = { width: availableWidth, items: items.map(item => ({ ...item })), presentations: items.map(getPresentation), compactionEnabled, overflow: !!this._delegate.hasOverflow?.() };
			this._observeMutations();
			this._isLayouting = false;
		}
	}

	private _apply(items: readonly IChatInputPickerResponsiveLayoutItem[], presentations: readonly PickerPresentation[]): void {
		let changed = false;
		for (const [index, item] of items.entries()) {
			const minimal = presentations[index] === PickerPresentation.Minimal;
			const compact = presentations[index] !== PickerPresentation.Expanded;
			if (item.setMinimal && item.isMinimal?.() !== minimal) {
				item.setMinimal(minimal);
				changed = true;
			}
			if (item.isCompact() !== compact) {
				item.setCompact(compact);
				changed = true;
			}
		}
		if (changed) {
			this._delegate.relayout?.();
		}
	}

	areAllItemsCompact(): boolean {
		return this._delegate.getItems().every(item => item.isCompact() && (!item.isMinimal || item.isMinimal()));
	}

	private _restoreCompactItems(): boolean {
		if (!this._delegate.hasOverflow?.()) {
			return true;
		}

		let visibleItemCount = this._getVisibleItemBounds().length;
		while (true) {
			this._setHiddenItemsCompact();
			this._delegate.relayout?.();
			if (!this._delegate.hasOverflow?.()) {
				return true;
			}

			const nextVisibleItemCount = this._getVisibleItemBounds().length;
			if (nextVisibleItemCount <= visibleItemCount) {
				return false;
			}
			visibleItemCount = nextVisibleItemCount;
		}
	}

	private _setHiddenItemsCompact(): void {
		for (const item of this._delegate.getItems()) {
			if (!item.element?.isConnected) {
				if (!item.isCompact()) {
					item.setCompact(true);
				}
				if (item.setMinimal && !item.isMinimal?.()) {
					item.setMinimal(true);
				}
			}
		}
	}

	private _getVisibleItemBounds(): { item: IChatInputPickerResponsiveLayoutItem; bounds: DOMRect }[] {
		const items: { item: IChatInputPickerResponsiveLayoutItem; bounds: DOMRect }[] = [];
		for (const item of this._delegate.getItems()) {
			const element = item.element;
			if (element?.isConnected && element.getClientRects().length > 0) {
				items.push({ item, bounds: element.getBoundingClientRect() });
			}
		}
		return items;
	}

	private _measurePreferredLayout(items: readonly IChatInputPickerResponsiveLayoutItem[]): { width: number } {
		const parent = this._element.parentElement;
		if (!parent) {
			return { width: 0 };
		}

		const measurement = this._element.cloneNode(true) as HTMLElement;
		measurement.classList.add('chat-input-picker-measurement');
		measurement.setAttribute('aria-hidden', 'true');
		measurement.setAttribute('inert', '');
		measurement.style.position = 'fixed';
		measurement.style.inset = '0 auto auto 0';
		measurement.style.width = 'max-content';
		measurement.style.minWidth = 'max-content';
		measurement.style.maxWidth = 'none';
		measurement.style.flex = 'none';
		measurement.style.contain = 'layout style paint';
		measurement.style.visibility = 'hidden';
		measurement.style.pointerEvents = 'none';

		const minimum = measurement.cloneNode(true) as HTMLElement;
		const measuredItems: { item: IChatInputPickerResponsiveLayoutItem; preferred: HTMLElement; minimum: HTMLElement }[] = [];
		for (const item of items) {
			const path = item.element ? this._getElementPath(item.element) : undefined;
			const measuredItem = path ? this._getElementAtPath(measurement, path) : undefined;
			const minimumItem = path ? this._getElementAtPath(minimum, path) : undefined;
			if (measuredItem && minimumItem) {
				measuredItem.style.flex = 'none';
				measuredItem.style.width = 'max-content';
				measuredItem.style.minWidth = 'max-content';
				measuredItem.style.maxWidth = 'none';
				if (item.canShrink && !this._delegate.usePreferredWidth) {
					minimumItem.style.flexBasis = '0';
					minimumItem.style.width = 'min-content';
				} else {
					minimumItem.style.flexShrink = '0';
				}
				measuredItems.push({ item, preferred: measuredItem, minimum: minimumItem });
			}
		}

		// Attach prepared clones as siblings so ancestor-dependent sizing rules still apply.
		parent.append(measurement, minimum);
		try {
			if (this._delegate.usePreferredWidth) {
				return { width: measurement.getBoundingClientRect().width };
			}
			const laneBounds = minimum.getBoundingClientRect();
			let width = laneBounds.width;
			const bounds = measuredItems
				.filter(item => item.minimum.getClientRects().length > 0)
				.map(({ item, minimum, preferred }) => ({ item, bounds: minimum.getBoundingClientRect(), preferredWidth: preferred.getBoundingClientRect().width }))
				.sort((a, b) => a.bounds.left - b.bounds.left);
			for (let index = 0; index < bounds.length; index++) {
				const current = bounds[index];
				if (current.bounds.left < laneBounds.left - WIDTH_TOLERANCE
					|| (index > 0 && current.bounds.left < bounds[index - 1].bounds.right - WIDTH_TOLERANCE)
					|| (!current.item.canShrink && current.bounds.width < current.preferredWidth - WIDTH_TOLERANCE)) {
					return { width: Number.POSITIVE_INFINITY };
				}
				width = Math.max(width, current.bounds.right - laneBounds.left);
			}
			return { width };
		} finally {
			measurement.remove();
			minimum.remove();
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
			attributeOldValue: true,
			attributeFilter: ['class', 'hidden', 'style', 'disabled', 'aria-disabled', 'aria-label'],
			characterData: true,
			childList: true,
			subtree: true,
		});
	}

	private _hasContentChanges(records: readonly MutationRecord[]): boolean {
		const attributes = new Map<Node, Map<string, string | null>>();
		for (const record of records) {
			if (record.type !== 'attributes') {
				return true;
			}
			const name = record.attributeName!;
			let targetAttributes = attributes.get(record.target);
			if (!targetAttributes) {
				attributes.set(record.target, targetAttributes = new Map());
			}
			if (!targetAttributes.has(name)) {
				targetAttributes.set(name, record.oldValue);
			}
		}
		for (const [target, changes] of attributes) {
			if (!dom.isHTMLElement(target)) {
				continue;
			}
			for (const [name, oldValue] of changes) {
				const value = target.getAttribute(name);
				if (target === this._element && name === 'style') {
					if (withoutDimensions(value) !== withoutDimensions(oldValue)) {
						return true;
					}
				} else if (value !== oldValue) {
					return true;
				}
			}
		}
		return false;
	}
}
