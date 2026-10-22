/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, isHTMLElement } from '../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';

const DEFAULT_WATERMARK_HEIGHT = 3 * 28;

/** Aligns the first action to the default three-action panel watermark, keeping search fields and status text above it. */
export class SessionsEmptyStateLayout extends Disposable {
	private readonly reference: HTMLElement;
	private offset = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly elements: readonly HTMLElement[],
		private readonly anchor: HTMLElement = elements[0],
		ResizeObserverCtor: typeof ResizeObserver = getWindow(container).ResizeObserver,
	) {
		super();
		this.reference = container.closest<HTMLElement>('.editor-group-container') ?? container;
		for (const element of elements) {
			element.classList.add('sessions-empty-state-aligned');
		}
		const observer = new ResizeObserverCtor(() => this.layout());
		this._register(toDisposable(() => observer.disconnect()));
		const observed = new Set<HTMLElement>([container, this.reference, this.anchor, ...elements]);
		// Only preceding toolbars can change the space available above the aligned content.
		for (let sibling = elements[0].previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
			if (isHTMLElement(sibling)) {
				observed.add(sibling);
			}
		}
		for (const element of observed) {
			observer.observe(element);
		}
		this._register(toDisposable(() => {
			for (const element of elements) {
				element.classList.remove('sessions-empty-state-aligned');
				element.style.removeProperty('translate');
			}
		}));
		this.layout();
	}

	layout(): void {
		const bounds = this.elements.map(element => element.getBoundingClientRect());
		if (!bounds.length || bounds.some(bounds => bounds.height === 0)) {
			return;
		}
		const available = this.container.getBoundingClientRect();
		const reference = this.reference.getBoundingClientRect();
		let availableTop = available.top;
		for (let sibling = this.elements[0].previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
			const bounds = sibling.getBoundingClientRect();
			if (bounds.height > 0) {
				availableTop = Math.max(availableTop, bounds.bottom);
			}
		}
		const top = Math.min(...bounds.map(bounds => bounds.top));
		const bottom = Math.max(...bounds.map(bounds => bounds.bottom));
		const desired = this.offset + (reference.top + reference.bottom - DEFAULT_WATERMARK_HEIGHT) / 2 - this.anchor.getBoundingClientRect().top;
		const minimum = this.offset + availableTop - top;
		const maximum = this.offset + available.bottom - bottom;
		const offset = Math.max(minimum, Math.min(maximum, desired));
		if (Math.abs(offset - this.offset) < 0.25) {
			return;
		}
		this.offset = offset;
		for (const element of this.elements) {
			element.style.translate = `0 ${offset}px`;
		}
	}
}
