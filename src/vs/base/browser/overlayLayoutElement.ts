/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension, IDomPosition, setParentFlowTo } from './dom.js';
import { IDisposable } from '../common/lifecycle.js';
import { Lazy } from '../common/lazy.js';
import { generateUuid } from '../common/uuid.js';

/**
 * Whether CSS anchor positioning is supported
 */
const supportsAnchorPositioning = new Lazy(() => CSS.supports('(top: anchor(top))'));

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
 * Call {@link layoutOverAnchorElement} each time the layout is recalculated. When the
 * same anchor element is passed again the call is a no-op (the browser keeps them in sync).
 */
export class OverlayLayoutElement implements IDisposable {

	private _currentAnchor?: { readonly element: HTMLElement; readonly name: string };
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
		if (supportsAnchorPositioning.value) {
			this.content.style.position = 'fixed';
			this.content.style.top = 'anchor(top)';
			this.content.style.left = 'anchor(left)';
			this.content.style.width = 'anchor-size(width)';
			this.content.style.height = 'anchor-size(height)';
			this.content.style.pointerEvents = 'auto';
		}

		this._root.style.position = 'absolute';
		this._root.style.pointerEvents = 'none';
	}

	public dispose(): void {
		this.root.remove();
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
	 * For legacy browser support this should be called each time the layout is recalculated.
	 */
	public layoutOverAnchorElement(
		anchorElement: HTMLElement,
		options?: {
			readonly clippingContainer?: HTMLElement;
			readonly fallbackDimension?: IDimension;
			readonly fallbackPosition?: IDomPosition;
		},
	): void {
		if (supportsAnchorPositioning.value) {
			if (this._currentAnchor?.element !== anchorElement) {
				const name = getOrCreateAnchorName(anchorElement);
				this.content.style.setProperty('position-anchor', name);
				setParentFlowTo(this.content, anchorElement);
				this._currentAnchor = { element: anchorElement, name };
			}
		} else {
			const cs = this.content.style;

			if (options?.fallbackPosition) {
				cs.top = `${options.fallbackPosition.top}px`;
				cs.left = `${options.fallbackPosition.left}px`;
			} else {
				const anchorRect = anchorElement.getBoundingClientRect();
				const parentRect = this.content.parentElement!.getBoundingClientRect();
				const parentBorderTop = (parentRect.height - this.content.parentElement!.clientHeight) / 2.0;
				const parentBorderLeft = (parentRect.width - this.content.parentElement!.clientWidth) / 2.0;
				cs.top = `${anchorRect.top - parentRect.top - parentBorderTop}px`;
				cs.left = `${anchorRect.left - parentRect.left - parentBorderLeft}px`;
			}

			setParentFlowTo(this.content, anchorElement);

			const anchorRect = anchorElement.getBoundingClientRect();
			cs.width = `${options?.fallbackDimension ? options.fallbackDimension.width : anchorRect.width}px`;
			cs.height = `${options?.fallbackDimension ? options.fallbackDimension.height : anchorRect.height}px`;
		}

		this._updateClipping(anchorElement, options?.clippingContainer);
	}

	private _updateClipping(anchorElement: HTMLElement, clippingContainer: HTMLElement | undefined): void {
		if (supportsAnchorPositioning.value) {
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
		} else {
			if (clippingContainer) {
				const anchorRect = anchorElement.getBoundingClientRect();
				const clipRect = clippingContainer.getBoundingClientRect();
				const top = Math.max(clipRect.top - anchorRect.top, 0);
				const right = Math.max(anchorRect.width - (anchorRect.right - clipRect.right), 0);
				const bottom = Math.max(anchorRect.height - (anchorRect.bottom - clipRect.bottom), 0);
				const left = Math.max(clipRect.left - anchorRect.left, 0);
				this.content.style.clipPath = `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;
				this._clippingAnchor = { element: clippingContainer, name: '' };
			} else {
				this.content.style.clipPath = '';
				this._clippingAnchor = undefined;
			}
		}
	}
}
