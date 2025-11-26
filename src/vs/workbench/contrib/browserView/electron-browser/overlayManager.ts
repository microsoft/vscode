/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getDomNodePagePosition, IDomNodePagePosition } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';

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
			this.observerIsConnected = true;
			this.structuralObserver.observe(mainWindow.document.body, {
				childList: true,
				subtree: true
			});
			this.updateTrackedElements();
		},
		onDidRemoveLastListener: () => {
			// Stop observing when no listeners are present
			this.observerIsConnected = false;
			this.structuralObserver.disconnect();
			this.stopTrackingElements();
		}
	}));
	public readonly onDidChangeOverlayState = this._onDidChangeOverlayState.event;

	private readonly overlayCollections = new Map<string, HTMLCollectionOf<Element>>();
	private overlayRectangles = new WeakMap<HTMLElement, IDomNodePagePosition>();
	private elementObservers = new WeakMap<HTMLElement, MutationObserver>();
	private structuralObserver: MutationObserver;
	private observerIsConnected: boolean = false;

	constructor() {
		super();

		// Initialize live collections for each overlay selector
		for (const className of OVERLAY_CLASSES) {
			// We need dynamic collections for overlay detection, using getElementsByClassName is intentional here
			// eslint-disable-next-line no-restricted-syntax
			this.overlayCollections.set(className, mainWindow.document.getElementsByClassName(className));
		}

		// Setup structural observer to watch for element additions/removals
		this.structuralObserver = new MutationObserver((mutations) => {
			let didRemove = false;
			for (const mutation of mutations) {
				for (const node of mutation.removedNodes) {
					if (this.elementObservers.has(node as HTMLElement)) {
						const observer = this.elementObservers.get(node as HTMLElement);
						observer?.disconnect();
						this.elementObservers.delete(node as HTMLElement);
						didRemove = true;
					}

					if (this.overlayRectangles.delete(node as HTMLElement)) {
						didRemove = true;
					}
				}
			}
			this.updateTrackedElements(didRemove);
		});
	}

	private *overlays(): Iterable<HTMLElement> {
		for (const collection of this.overlayCollections.values()) {
			for (const element of collection) {
				yield element as HTMLElement;
			}
		}
	}

	private updateTrackedElements(shouldEmit = false): void {
		// Scan all overlay collections for elements and ensure they have observers
		for (const overlay of this.overlays()) {
			// Create a new observer for this specific element if we don't already have one
			if (!this.elementObservers.has(overlay)) {
				const observer = new MutationObserver(() => {
					this.overlayRectangles.delete(overlay);
					this._onDidChangeOverlayState.fire();
				});

				// Store the observer in the WeakMap
				this.elementObservers.set(overlay, observer);

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
		if (!this.overlayRectangles.has(element)) {
			const rect = getDomNodePagePosition(element);
			// If the observer is not connected (no listeners), do not cache rectangles as we won't know when they change.
			if (!this.observerIsConnected) {
				return rect;
			}
			this.overlayRectangles.set(element, rect);
		}
		return this.overlayRectangles.get(element)!;
	}

	public isOverlappingWithOverlays(element: HTMLElement): boolean {
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
			const observer = this.elementObservers.get(overlay);
			observer?.disconnect();
		}
		this.overlayRectangles = new WeakMap();
		this.elementObservers = new WeakMap();
	}

	override dispose(): void {
		this.observerIsConnected = false;
		this.structuralObserver.disconnect();
		this.stopTrackingElements();

		super.dispose();
	}
}
