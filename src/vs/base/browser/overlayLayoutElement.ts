/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getComputedStyle, setParentFlowTo } from './dom.js';
import { IDisposable, toDisposable } from '../common/lifecycle.js';
import { generateUuid } from '../common/uuid.js';

/**
 * What draws over an element rather than in it, such as an overlay positioned
 * over it or a native view, which does not move with the element when it
 * moves by a transform.
 */
export interface IOverlayAnchorHost {
	/**
	 * Hides or shows what draws over the element.
	 */
	setHidden(hidden: boolean): void;

	/**
	 * The element that draws over the anchor, if it is in the DOM, such as
	 * the root of an overlay: what happens over it happens over the anchor.
	 */
	readonly element?: HTMLElement;

	/**
	 * Whether the pointer is over what draws over the anchor: in a frame,
	 * such as a webview's, the window it is in has no event for it.
	 */
	isPointerOver?(): boolean;
}

interface IOverlayAnchorRegistration {
	readonly anchor: HTMLElement;
	/** How many of what hides overlays hide it, such as cards that move. */
	hidden: number;
}

const overlayHosts = new Map<IOverlayAnchorHost, IOverlayAnchorRegistration>();

/**
 * Registers an element that something draws over, such as an overlay or a
 * native view, so that what moves the element by transforms can find it and
 * hide what draws over it meanwhile (see {@link hideOverlaysIn}). A host
 * registered again, such as with another element, moves there and stays
 * hidden as long as what hid it does; the registration it had then does
 * nothing more. Disposed while hidden, the host shows again.
 */
export function registerOverlayAnchor(anchor: HTMLElement, host: IOverlayAnchorHost): IDisposable {
	const registration: IOverlayAnchorRegistration = { anchor, hidden: overlayHosts.get(host)?.hidden ?? 0 };
	overlayHosts.set(host, registration);

	return toDisposable(() => {
		if (overlayHosts.get(host) !== registration) {
			return; // registered again since
		}
		overlayHosts.delete(host);
		if (registration.hidden > 0) {
			host.setHidden(false);
		}
	});
}

/**
 * The elements inside `container` that something draws over and that show.
 */
export function findOverlayAnchors(container: HTMLElement): HTMLElement[] {
	const anchors = new Set(Array.from(overlayHosts.values(), registration => registration.anchor));
	return Array.from(anchors).filter(anchor => anchor.isConnected && container.contains(anchor) && anchor.getClientRects().length > 0);
}

/**
 * The element that `target` draws over, if `target` is in what draws over
 * an element, such as an overlay positioned over it.
 */
export function findOverlayAnchorOf(target: Node): HTMLElement | undefined {
	for (const [host, registration] of overlayHosts) {
		if (host.element?.contains(target)) {
			return registration.anchor;
		}
	}

	return undefined;
}

/**
 * The element of `document` that something draws over from outside it, such
 * as a webview over an editor, at `x`, `y`, or within `tolerance` of it.
 */
export function findOverlayAnchorAt(document: Document, x: number, y: number, tolerance = 0): HTMLElement | undefined {
	for (const [host, registration] of overlayHosts) {
		const anchor = registration.anchor;
		if (!host.element || registration.hidden > 0 || anchor.ownerDocument !== document || !anchor.isConnected) {
			continue;
		}
		const rect = anchor.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0 && x >= rect.left - tolerance && x <= rect.right + tolerance && y >= rect.top - tolerance && y <= rect.bottom + tolerance) {
			return anchor;
		}
	}

	return undefined;
}

/**
 * The element of `document` that something draws over from outside it, such
 * as a webview over an editor, that the pointer is over.
 */
export function findOverlayAnchorUnderPointer(document: Document): HTMLElement | undefined {
	for (const [host, registration] of overlayHosts) {
		if (registration.hidden === 0 && registration.anchor.ownerDocument === document && registration.anchor.isConnected && host.isPointerOver?.()) {
			return registration.anchor;
		}
	}

	return undefined;
}

/**
 * Hides what draws over the elements inside `container`, until disposed.
 */
export function hideOverlaysIn(container: HTMLElement): IDisposable {
	const anchors = new Set(findOverlayAnchors(container));
	const hidden: IOverlayAnchorHost[] = [];
	for (const [host, registration] of overlayHosts) {
		if (anchors.has(registration.anchor)) {
			if (registration.hidden++ === 0) {
				host.setHidden(true);
			}
			hidden.push(host);
		}
	}

	return toDisposable(() => {
		for (const host of hidden) {
			const registration = overlayHosts.get(host);
			if (!registration) {
				continue; // no longer registered
			}
			if (--registration.hidden === 0) {
				host.setHidden(false);
			}
		}
	});
}

/**
 * If the element already has an `anchor-name` style, return it.
 * Otherwise generate a fresh `--overlay-anchor-<uuid>` name, assign it, and return it.
 */
function getOrCreateAnchorName(element: HTMLElement): string {
	const existing = element.style.getPropertyValue('anchor-name');
	if (existing) {
		return existing;
	}
	const name = `--overlay-anchor-${generateUuid()}`;
	element.style.setProperty('anchor-name', name);
	return name;
}

/**
 * Positions an element over another element anywhere in the dom using absolute positioning.
 *
 * This is useful for cases where a dom node cannot be re-parented without losing its state, such as a iframe.
 *
 * Call {@link setAnchorElement} each time the layout is recalculated. When the
 * same anchor element is passed again the call is a no-op (the browser keeps them in sync).
 */
export class OverlayLayoutElement implements IDisposable {

	private _currentAnchor?: { readonly element: HTMLElement; readonly name: string; readonly registration: IDisposable };
	private _clippingAnchor?: { readonly element: HTMLElement; readonly name: string };

	/**
	 * The root element that contains the overlay element.
	 *
	 * This also provides clipping support for the overlay element. Clipping is needed when the anchor is
	 * scrollable and may scroll and be hidden by overflow from its parent container.
	 */
	private readonly _root: HTMLElement;

	constructor() {
		this.content = document.createElement('div');
		this.content.style.position = 'absolute';
		this.content.style.overflow = 'hidden';

		this._root = document.createElement('div');
		this._root.appendChild(this.content);

		this.reapplyLayoutStyles();
	}

	public reapplyLayoutStyles(): void {
		this.content.style.position = 'fixed';
		this.content.style.top = 'anchor(top)';
		this.content.style.left = 'anchor(left)';
		this.content.style.width = 'anchor-size(width)';
		this.content.style.height = 'anchor-size(height)';
		this.content.style.pointerEvents = 'auto';

		this._root.style.position = 'absolute';
		this._root.style.pointerEvents = 'none';
	}

	public dispose(): void {
		this._currentAnchor?.registration.dispose();
		this._currentAnchor = undefined;
		this.root.remove();
	}

	private _hidden = false;
	private readonly _anchorHost: IOverlayAnchorHost = (() => {
		const layout = this;
		return {
			setHidden: (hidden: boolean) => layout.setHidden(hidden),
			get element() { return layout._root; },
			// The pointer in a frame inside the overlay, such as a webview's, hovers the overlay
			isPointerOver: () => layout._root.matches(':hover')
		};
	})();

	/**
	 * Hides or shows the overlay, whatever else its content shows or hides.
	 */
	private setHidden(hidden: boolean): void {
		if (this._hidden !== hidden) {
			this._hidden = hidden;
			this._root.style.display = hidden ? 'none' : '';
		}
	}

	/**
	 * The outermost element. This is what should be appended to the actual dom hierarchy, typically near to
	 * the document root node.
	 */
	public get root(): HTMLElement {
		return this._root;
	}

	/**
	 * The actual element that is positioned over the anchor.
	 */
	public readonly content: HTMLElement;

	/**
	 * Position the content over `anchorElement`.
	 *
	 * This only needs to be called when the anchor element or the clipping container changes.
	 */
	public setAnchorElement(
		anchorElement: HTMLElement,
		options?: {
			readonly clippingContainer?: HTMLElement;
		},
	): void {
		if (this._currentAnchor?.element !== anchorElement) {
			const name = getOrCreateAnchorName(anchorElement);
			this.content.style.setProperty('position-anchor', name);
			setParentFlowTo(this.content, anchorElement);
			// Registered with the new element first, the overlay stays hidden as long as what hid it does
			const registration = registerOverlayAnchor(anchorElement, this._anchorHost);
			this._currentAnchor?.registration.dispose();
			this._currentAnchor = { element: anchorElement, name, registration };
		}

		this._updateClipping(options?.clippingContainer);
		this._updateZIndex(anchorElement);
	}

	/**
	 * Walk up from the anchor element to find the nearest ancestor with an explicit
	 * z-index and place the overlay one level above it. This ensures the overlay sits
	 * above modal layers or other stacking contexts.
	 */
	private _updateZIndex(anchorElement: HTMLElement): void {
		let zIndex = '';
		for (let el: HTMLElement | null = anchorElement; el; el = el.parentElement) {
			const computed = getComputedStyle(el).zIndex;
			if (computed && computed !== 'auto') {
				zIndex = String(Number(computed) + 1);
				break;
			}
		}
		this.content.style.zIndex = zIndex;
	}

	private _updateClipping(clippingContainer: HTMLElement | undefined): void {
		if (this._clippingAnchor?.element === clippingContainer) {
			return;
		}

		this._root.style.removeProperty('position-anchor');

		const ws = this._root.style;
		if (clippingContainer) {
			const name = getOrCreateAnchorName(clippingContainer);
			ws.clipPath = 'content-box';
			ws.setProperty('position-anchor', name);
			ws.setProperty('top', 'anchor(top)');
			ws.setProperty('left', 'anchor(left)');
			ws.setProperty('width', `anchor-size(width)`);
			ws.setProperty('height', `anchor-size(height)`);
			this._clippingAnchor = { element: clippingContainer, name };
		} else {
			ws.clipPath = '';
			ws.setProperty('top', '0');
			ws.setProperty('left', '0');
			ws.setProperty('right', '0');
			ws.setProperty('bottom', '0');
			this._clippingAnchor = undefined;
		}
	}
}
