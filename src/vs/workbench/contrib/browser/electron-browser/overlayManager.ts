/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getDomNodePagePosition, getActiveWindow } from '../../../../base/browser/dom.js';

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

interface IRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export class BrowserOverlayManager extends Disposable implements IBrowserOverlayManager {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeOverlayState = this._register(new Emitter<void>());
	readonly onDidChangeOverlayState = this._onDidChangeOverlayState.event;

	private readonly overlaySelectors: string[] = [
		'monaco-menu-container',
		'quick-input-widget',
		'monaco-hover',
		'monaco-dialog-modal-block',
		'notifications-center',
		'context-view'
	];

	private readonly overlayCollections = new Map<string, HTMLCollectionOf<Element>>();
	private readonly overlayRectangles = new WeakMap<HTMLElement, IRect>();
	private readonly elementObservers = new WeakMap<HTMLElement, MutationObserver>();
	private structuralObserver: MutationObserver | null = null;

	constructor() {
		super();

		this.initializeOverlayTracking();
	}

	private initializeOverlayTracking(): void {
		const activeWindow = getActiveWindow();

		// Initialize live collections for each overlay selector
		for (const selector of this.overlaySelectors) {
			// We need dynamic collections for overlay detection, using getElementsByClassName is intentional here
			// eslint-disable-next-line no-restricted-syntax
			this.overlayCollections.set(selector, activeWindow.document.getElementsByClassName(selector));
		}

		// Setup structural observer to watch for element additions/removals
		this.structuralObserver = new MutationObserver((mutations) => {
			let didRemove = false;
			for (const mutation of mutations) {
				if (mutation.type === 'childList') {
					for (const node of mutation.removedNodes) {
						if (this.elementObservers.delete(node as HTMLElement)) {
							didRemove = true;
						}
						if (this.overlayRectangles.delete(node as HTMLElement)) {
							didRemove = true;
						}
					}
				}
			}
			this.updateTrackedElements(didRemove);
		});

		// Start observing the document for structural changes
		this.structuralObserver.observe(activeWindow.document.body, {
			childList: true,
			subtree: true
		});

		// Initial element tracking setup
		this.updateTrackedElements();
	}

	private updateTrackedElements(emit = false): void {
		// Scan all overlay collections for elements and ensure they have observers
		for (const collection of this.overlayCollections.values()) {
			for (const element of collection) {
				const htmlElement = element as HTMLElement;

				// Create a new observer for this specific element if we don't already have one
				if (!this.elementObservers.has(htmlElement)) {
					const observer = new MutationObserver(() => {
						this.overlayRectangles.delete(htmlElement);
						this._onDidChangeOverlayState.fire();
					});

					// Store the observer in the WeakMap
					this.elementObservers.set(htmlElement, observer);

					// Start observing this element
					observer.observe(htmlElement, {
						attributes: true,
						attributeFilter: ['style', 'class'],
						childList: true,
						subtree: true
					});

					emit = true;
				}
			}
		}

		if (emit) {
			this._onDidChangeOverlayState.fire();
		}
	}

	private getRect(element: HTMLElement): IRect {
		if (!this.overlayRectangles.has(element)) {
			const rect = getDomNodePagePosition(element);
			this.overlayRectangles.set(element, rect);
		}
		return this.overlayRectangles.get(element)!;
	}

	public isOverlappingWithOverlays(element: HTMLElement): boolean {
		const elementRect = getDomNodePagePosition(element);

		// Check against all precomputed overlay rectangles
		for (const collection of this.overlayCollections.values()) {
			for (const element of collection) {
				const overlayRect = this.getRect(element as HTMLElement);
				if (overlayRect && this.isRectanglesOverlapping(elementRect, overlayRect)) {
					return true;
				}
			}
		}

		return false;
	}

	private isRectanglesOverlapping(rect1: IRect, rect2: IRect): boolean {
		return !(rect1.left + rect1.width <= rect2.left ||
			rect2.left + rect2.width <= rect1.left ||
			rect1.top + rect1.height <= rect2.top ||
			rect2.top + rect2.height <= rect1.top);
	}

	override dispose(): void {
		if (this.structuralObserver) {
			this.structuralObserver.disconnect();
			this.structuralObserver = null;
		}

		// Note: Individual element observers will be cleaned up automatically
		// when their elements are garbage collected due to WeakMap usage
		super.dispose();
	}
}
