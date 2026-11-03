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
}

const overlayAnchors = new Map<HTMLElement, Map<IOverlayAnchorHost, number>>();

/**
 * Registers an element that something draws over, such as an overlay or a
 * native view, so that what moves the element by transforms can find it and
 * hide what draws over it meanwhile (see {@link hideOverlaysIn}).
 */
export function registerOverlayAnchor(anchor: HTMLElement, host: IOverlayAnchorHost): IDisposable {
	let hosts = overlayAnchors.get(anchor);
	if (!hosts) {
		hosts = new Map();
		overlayAnchors.set(anchor, hosts);
	}
	hosts.set(host, 0);

	return toDisposable(() => {
		const current = overlayAnchors.get(anchor);
		if (current?.get(host)) {
			host.setHidden(false);
		}
		current?.delete(host);
		if (current?.size === 0) {
			overlayAnchors.delete(anchor);
		}
	});
}

/**
 * The elements inside `container` that something draws over and that show.
 */
export function findOverlayAnchors(container: HTMLElement): HTMLElement[] {
	return Array.from(overlayAnchors.keys()).filter(anchor => anchor.isConnected && container.contains(anchor) && anchor.getClientRects().length > 0);
}

/**
 * Hides what draws over the elements inside `container`, until disposed.
 */
export function hideOverlaysIn(container: HTMLElement): IDisposable {
	const hidden: [Map<IOverlayAnchorHost, number>, IOverlayAnchorHost][] = [];
	for (const anchor of findOverlayAnchors(container)) {
		const hosts = overlayAnchors.get(anchor)!;
		for (const [host, count] of hosts) {
			hosts.set(host, count + 1);
			if (count === 0) {
				host.setHidden(true);
			}
			hidden.push([hosts, host]);
		}
	}

	return toDisposable(() => {
		for (const [hosts, host] of hidden) {
			const count = hosts.get(host);
			if (count === undefined) {
				continue; // no longer registered
			}
			hosts.set(host, count - 1);
			if (count === 1) {
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
			this._currentAnchor?.registration.dispose();
			const name = getOrCreateAnchorName(anchorElement);
			this.content.style.setProperty('position-anchor', name);
			setParentFlowTo(this.content, anchorElement);
			this._currentAnchor = { element: anchorElement, name, registration: registerOverlayAnchor(anchorElement, { setHidden: hidden => this.setHidden(hidden) }) };
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
