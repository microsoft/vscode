/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getDomNodePagePosition, IDomNodePagePosition } from '../../../../base/browser/dom.js';
import { CodeWindow } from '../../../../base/browser/window.js';

const OVERLAY_CLASSES: string[] = [
	'monaco-menu-container',
	'quick-input-widget',
	'monaco-hover',
	'monaco-dialog-modal-block',
	'notifications-center',
	'notification-toast-container',
	'context-view'
];

export const IBrowserOverlayManager = createDecorator<IBrowserOverlayManager>('browserOverlayManager');

export interface IBrowserOverlayManager {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when overlay state changes
	 */
	readonly onDidChangeOverlayState: Event<void>;

	/**
	 * Check if the given element overlaps with any overlay
	 */
	isOverlappingWithOverlays(element: HTMLElement): boolean;
}

export class BrowserOverlayManager extends Disposable implements IBrowserOverlayManager {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeOverlayState = this._register(new Emitter<void>({
		onWillAddFirstListener: () => {
			// Start observing the document for structural changes
			this._observerIsConnected = true;
			this._structuralObserver.observe(this.targetWindow.document.body, {
				childList: true,
				subtree: true
			});
			this.updateTrackedElements();
		},
		onDidRemoveLastListener: () => {
			// Stop observing when no listeners are present
			this._observerIsConnected = false;
			this._structuralObserver.disconnect();
			this.stopTrackingElements();
		}
	}));
	readonly onDidChangeOverlayState = this._onDidChangeOverlayState.event;

	private readonly _overlayCollections = new Map<string, HTMLCollectionOf<Element>>();
	private _overlayRectangles = new WeakMap<HTMLElement, IDomNodePagePosition>();
	private _elementObservers = new WeakMap<HTMLElement, MutationObserver>();
	private _structuralObserver: MutationObserver;
	private _observerIsConnected: boolean = false;

	constructor(
		private readonly targetWindow: CodeWindow
	) {
		super();

		// Initialize live collections for each overlay selector
		for (const className of OVERLAY_CLASSES) {
			// We need dynamic collections for overlay detection, using getElementsByClassName is intentional here
			// eslint-disable-next-line no-restricted-syntax
			this._overlayCollections.set(className, this.targetWindow.document.getElementsByClassName(className));
		}

		// Setup structural observer to watch for element additions/removals
		this._structuralObserver = new MutationObserver((mutations) => {
			let didRemove = false;
			for (const mutation of mutations) {
				for (const node of mutation.removedNodes) {
					if (this._elementObservers.has(node as HTMLElement)) {
						const observer = this._elementObservers.get(node as HTMLElement);
						observer?.disconnect();
						this._elementObservers.delete(node as HTMLElement);
						didRemove = true;
					}

					if (this._overlayRectangles.delete(node as HTMLElement)) {
						didRemove = true;
					}
				}
			}
			this.updateTrackedElements(didRemove);
		});
	}

	private *overlays(): Iterable<HTMLElement> {
		for (const collection of this._overlayCollections.values()) {
			for (const element of collection) {
				yield element as HTMLElement;
			}
		}
	}

	private updateTrackedElements(shouldEmit = false): void {
		// Scan all overlay collections for elements and ensure they have observers
		for (const overlay of this.overlays()) {
			// Create a new observer for this specific element if we don't already have one
			if (!this._elementObservers.has(overlay)) {
				const observer = new MutationObserver(() => {
					this._overlayRectangles.delete(overlay);
					this._onDidChangeOverlayState.fire();
				});

				// Store the observer in the WeakMap
				this._elementObservers.set(overlay, observer);

				// Start observing this element
				observer.observe(overlay, {
					attributes: true,
					attributeFilter: ['style', 'class'],
					childList: true,
					subtree: true
				});

				shouldEmit = true;
			}
		}

		if (shouldEmit) {
			this._onDidChangeOverlayState.fire();
		}
	}

	private getRect(element: HTMLElement): IDomNodePagePosition {
		if (!this._overlayRectangles.has(element)) {
			const rect = getDomNodePagePosition(element);
			// If the observer is not connected (no listeners), do not cache rectangles as we won't know when they change.
			if (!this._observerIsConnected) {
				return rect;
			}
			this._overlayRectangles.set(element, rect);
		}
		return this._overlayRectangles.get(element)!;
	}

	isOverlappingWithOverlays(element: HTMLElement): boolean {
		const elementRect = getDomNodePagePosition(element);

		// Check against all precomputed overlay rectangles
		for (const overlay of this.overlays()) {
			const overlayRect = this.getRect(overlay);
			if (overlayRect && this.isRectanglesOverlapping(elementRect, overlayRect)) {
				return true;
			}
		}

		return false;
	}

	private isRectanglesOverlapping(rect1: IDomNodePagePosition, rect2: IDomNodePagePosition): boolean {
		// If elements are offscreen or set to zero size, consider them non-overlapping
		if (rect1.width === 0 || rect1.height === 0 || rect2.width === 0 || rect2.height === 0) {
			return false;
		}

		return !(rect1.left + rect1.width <= rect2.left ||
			rect2.left + rect2.width <= rect1.left ||
			rect1.top + rect1.height <= rect2.top ||
			rect2.top + rect2.height <= rect1.top);
	}

	private stopTrackingElements(): void {
		for (const overlay of this.overlays()) {
			const observer = this._elementObservers.get(overlay);
			observer?.disconnect();
		}
		this._overlayRectangles = new WeakMap();
		this._elementObservers = new WeakMap();
	}

	override dispose(): void {
		this._observerIsConnected = false;
		this._structuralObserver.disconnect();
		this.stopTrackingElements();

		super.dispose();
	}
}
