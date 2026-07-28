/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, MicrotaskEmitter } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getDomNodePagePosition, IDomNodePagePosition } from '../../../../base/browser/dom.js';
import { CodeWindow } from '../../../../base/browser/window.js';

export enum BrowserOverlayType {
	Menu = 'menu',
	QuickInput = 'quickInput',
	Hover = 'hover',
	Dialog = 'dialog',
	Notification = 'notification',
	Unknown = 'unknown'
}

const OVERLAY_DEFINITIONS: ReadonlyArray<{ className: string; type: BrowserOverlayType }> = [
	{ className: 'monaco-menu-container', type: BrowserOverlayType.Menu },
	{ className: 'action-list-submenu-panel', type: BrowserOverlayType.Menu },
	{ className: 'quick-input-widget', type: BrowserOverlayType.QuickInput },
	{ className: 'monaco-hover', type: BrowserOverlayType.Hover },
	{ className: 'editor-widget', type: BrowserOverlayType.Hover },
	{ className: 'suggest-details-container', type: BrowserOverlayType.Hover },
	{ className: 'monaco-dialog-modal-block', type: BrowserOverlayType.Dialog },
	{ className: 'monaco-modal-editor-block', type: BrowserOverlayType.Dialog },
	{ className: 'notifications-center', type: BrowserOverlayType.Notification },
	{ className: 'notification-toast-container', type: BrowserOverlayType.Notification },
	// Context view is very generic, so treat the content as unknown
	{ className: 'context-view', type: BrowserOverlayType.Unknown }
];

// Transparent full-screen layers that context menus and action widgets render to capture clicks.
// They sit in higher z-index stacking contexts above other UI, but are not tracked overlays,
// so hit-testing must skip them to find the overlay actually painted underneath.
const CONTEXT_VIEW_BLOCKER_CLASSES = ['context-view-block', 'context-view-pointerBlock'];

function isContextViewBlocker(element: Element): boolean {
	return CONTEXT_VIEW_BLOCKER_CLASSES.some(className => element.classList.contains(className));
}

export const IBrowserOverlayManager = createDecorator<IBrowserOverlayManager>('browserOverlayManager');

export interface IBrowserOverlayInfo {
	type: BrowserOverlayType;
	rect: IDomNodePagePosition;
}

export interface IBrowserOverlayManager {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when overlay state changes
	 */
	readonly onDidChangeOverlayState: Event<void>;

	/**
	 * Get overlays overlapping with the given element
	 */
	getOverlappingOverlays(element: HTMLElement): IBrowserOverlayInfo[];
}

export class BrowserOverlayManager extends Disposable implements IBrowserOverlayManager {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeOverlayState = this._register(new MicrotaskEmitter<void>({
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
		},

		// Must be passed to prevent duplicate emits
		merge: () => { }
	}));
	readonly onDidChangeOverlayState = this._onDidChangeOverlayState.event;

	private readonly _overlayCollections = new Map<string, { type: BrowserOverlayType; collection: HTMLCollectionOf<Element> }>();
	private _overlayRectangles = new WeakMap<HTMLElement, IDomNodePagePosition>();
	private _elementObservers = new WeakMap<HTMLElement, MutationObserver>();
	private _structuralObserver: MutationObserver;
	private _observerIsConnected: boolean = false;
	private _shadowRootHostCollection: HTMLCollectionOf<Element>;
	private _shadowRootObservers = new WeakMap<ShadowRoot, MutationObserver>();
	private _shadowRootOverlayCache = new WeakMap<ShadowRoot, Array<{ element: HTMLElement; type: BrowserOverlayType }>>();

	constructor(
		private readonly targetWindow: CodeWindow
	) {
		super();

		// Initialize live collections for each overlay selector in main document
		for (const overlayDefinition of OVERLAY_DEFINITIONS) {
			this._overlayCollections.set(overlayDefinition.className, {
				type: overlayDefinition.type,
				// We need dynamic collections for overlay detection, using getElementsByClassName is intentional here
				// eslint-disable-next-line no-restricted-syntax
				collection: this.targetWindow.document.getElementsByClassName(overlayDefinition.className)
			});
		}

		// Initialize live collection for shadow root hosts
		// We need dynamic collections for overlay detection, using getElementsByClassName is intentional here
		// eslint-disable-next-line no-restricted-syntax
		this._shadowRootHostCollection = this.targetWindow.document.getElementsByClassName('shadow-root-host');

		// Setup structural observer to watch for element additions/removals
		this._structuralObserver = new targetWindow.MutationObserver((mutations) => {
			let didRemove = false;
			for (const mutation of mutations) {
				for (const node of mutation.removedNodes) {
					// Clean up element observers
					if (this._elementObservers.has(node as HTMLElement)) {
						const observer = this._elementObservers.get(node as HTMLElement);
						observer?.disconnect();
						this._elementObservers.delete(node as HTMLElement);
						didRemove = true;
					}

					if (this._overlayRectangles.delete(node as HTMLElement)) {
						didRemove = true;
					}

					// Clean up shadow root observers when shadow-root-host elements are removed
					const hostElement = node as HTMLElement;
					if (hostElement.shadowRoot) {
						const shadowRoot = hostElement.shadowRoot;
						const observer = this._shadowRootObservers.get(shadowRoot);
						if (observer) {
							observer.disconnect();
							this._shadowRootObservers.delete(shadowRoot);
							this._shadowRootOverlayCache.delete(shadowRoot);
							didRemove = true;
						}
					}
				}
			}
			this.updateTrackedElements(didRemove);
		});
	}

	private *overlays(): Iterable<{ element: HTMLElement; type: BrowserOverlayType }> {
		// Yield overlays from main document live collections
		for (const entry of this._overlayCollections.values()) {
			for (const element of entry.collection) {
				yield { element: element as HTMLElement, type: entry.type };
			}
		}

		// Yield overlays from shadow roots
		for (const hostElement of this._shadowRootHostCollection) {
			const shadowRoot = hostElement.shadowRoot;
			if (shadowRoot) {
				let cache = this._shadowRootOverlayCache.get(shadowRoot);
				if (!cache) {
					// Rebuild cache
					cache = [];
					for (const overlayDefinition of OVERLAY_DEFINITIONS) {
						// We need to query shadow roots for overlay detection, using querySelectorAll is intentional here
						// eslint-disable-next-line no-restricted-syntax
						const elements = shadowRoot.querySelectorAll(`.${overlayDefinition.className}`);
						for (const element of elements) {
							cache.push({ element: element as HTMLElement, type: overlayDefinition.type });
						}
					}
					this._shadowRootOverlayCache.set(shadowRoot, cache);
				}

				yield* cache;
			}
		}
	}

	private updateTrackedElements(shouldEmit = false): void {
		// Track shadow roots using live collection
		for (const host of this._shadowRootHostCollection) {
			const hostElement = host as HTMLElement;
			const shadowRoot = hostElement.shadowRoot;
			if (shadowRoot && !this._shadowRootObservers.has(shadowRoot)) {
				// Create observer for this shadow root
				const observer = new this.targetWindow.MutationObserver(() => {
					// Clear element cache when shadow root structure changes
					this._shadowRootOverlayCache.delete(shadowRoot);
					this._onDidChangeOverlayState.fire();
				});

				observer.observe(shadowRoot, {
					childList: true,
					subtree: true
				});

				this._shadowRootObservers.set(shadowRoot, observer);
				shouldEmit = true;
			}
		}

		// Scan all overlay collections for elements and ensure they have observers
		for (const overlay of this.overlays()) {
			// Create a new observer for this specific element if we don't already have one
			if (!this._elementObservers.has(overlay.element)) {
				const observer = new this.targetWindow.MutationObserver((records) => {
					// If all changes are within a browser container within the overlay, ignore.
					if (records.every(record => record.target.parentElement?.closest('.browser-container'))) {
						return;
					}

					this._overlayRectangles.delete(overlay.element);
					this._onDidChangeOverlayState.fire();
				});

				// Store the observer in the WeakMap
				this._elementObservers.set(overlay.element, observer);

				// Start observing this element
				observer.observe(overlay.element, {
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

	getOverlappingOverlays(element: HTMLElement): IBrowserOverlayInfo[] {
		const elementRect = getDomNodePagePosition(element);
		const overlappingOverlays: IBrowserOverlayInfo[] = [];

		const overlays = Array.from(this.overlays());

		// Check against all precomputed overlay rectangles
		for (const overlay of overlays) {
			// Skip overlays that are ancestors of the target element,
			// e.g., the modal editor backdrop when the browser is inside the modal
			if (overlay.element.contains(element)) {
				continue;
			}
			const overlayRect = this.getRect(overlay.element);
			const overlapCenter = getOverlappingRectangleCenterPoint(elementRect, overlayRect);
			if (overlapCenter) {
				const clientX = overlapCenter.x - this.targetWindow.scrollX;
				const clientY = overlapCenter.y - this.targetWindow.scrollY;
				// Only report this overlay if it's the one actually painted at
				// the sample point (a z-index check via hit-testing).
				const elementAtPoint = this.getTopmostElementAt(clientX, clientY);
				if (elementAtPoint && overlay.element.contains(elementAtPoint)) {
					overlappingOverlays.push({
						type: overlay.type,
						rect: overlayRect
					});
				}
			}
		}

		return overlappingOverlays;
	}

	private getTopmostElementAt(clientX: number, clientY: number): Element | null {
		const topmostAt = (root: DocumentOrShadowRoot): Element | null => {
			// Fast path: `elementFromPoint` returns only the single topmost hit and
			// avoids the array allocation of `elementsFromPoint`. This runs on every
			// overlay state change, which can fire frequently, so favor it whenever the
			// topmost hit is a real element we care about.
			const elementAtPoint = root.elementFromPoint(clientX, clientY);
			if (elementAtPoint && !isContextViewBlocker(elementAtPoint)) {
				return elementAtPoint;
			}
			// Slow path: the topmost hit is a transparent context-view blocker (or there
			// was no hit). Walk the full front-to-back hit list and return the first
			// element that is not a blocker, i.e. the overlay actually painted beneath it.
			return root.elementsFromPoint(clientX, clientY)
				.find(el => !isContextViewBlocker(el)) ?? null;
		};

		const elementAtPoint = topmostAt(this.targetWindow.document);
		// Neither `elementFromPoint` nor `elementsFromPoint` pierces shadow DOM, so when
		// the topmost element hosts a shadow root, re-run the hit-test inside it to find
		// the overlay rendered within (e.g. context views that use shadow DOM).
		if (elementAtPoint?.shadowRoot) {
			return topmostAt(elementAtPoint.shadowRoot);
		}
		return elementAtPoint;
	}

	private stopTrackingElements(): void {
		// Disconnect all element observers
		for (const overlay of this.overlays()) {
			const observer = this._elementObservers.get(overlay.element);
			observer?.disconnect();
		}

		// Disconnect all shadow root observers
		for (const hostElement of this._shadowRootHostCollection) {
			const shadowRoot = (hostElement as HTMLElement).shadowRoot;
			const shadowObserver = this._shadowRootObservers.get(shadowRoot!);
			shadowObserver?.disconnect();
		}

		this._shadowRootObservers = new WeakMap();
		this._shadowRootOverlayCache = new WeakMap();
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

function getOverlappingRectangleCenterPoint(rect1: IDomNodePagePosition, rect2: IDomNodePagePosition): { x: number; y: number } | null {
	const overlapLeft = Math.max(rect1.left, rect2.left);
	const overlapRight = Math.min(rect1.left + rect1.width, rect2.left + rect2.width);
	const overlapTop = Math.max(rect1.top, rect2.top);
	const overlapBottom = Math.min(rect1.top + rect1.height, rect2.top + rect2.height);

	if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
		return {
			x: (overlapLeft + overlapRight) / 2,
			y: (overlapTop + overlapBottom) / 2
		};
	}

	return null;
}
