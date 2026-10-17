/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari, isWebkitWebView } from './browser.js';
import { getComputedStyle, getWindow, scheduleAtNextAnimationFrame, setParentFlowTo, sharedMutationObserver } from './dom.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../common/lifecycle.js';
import { generateUuid } from '../common/uuid.js';

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
 * Safari 26 does not always apply `anchor()` / `anchor-size()` to the overlay: it can collapse to the
 * intrinsic size of its content or stay at its static position (https://github.com/microsoft/vscode/issues/332765).
 * Devices that stay on iOS/iPadOS 26 keep this bug, so on WebKit the overlay is also kept in sync manually.
 */
const needsManualAnchorSync = isSafari || isWebkitWebView;

/**
 * Move and resize `element` so that its border box matches the border box of `anchor`.
 *
 * Works for any containing block: the current offset is measured and only the difference is applied.
 * Nothing is written when the element already matches the anchor.
 */
export function syncToAnchor(element: HTMLElement, anchor: HTMLElement): void {
	if (!element.isConnected || !anchor.isConnected || anchor.getClientRects().length === 0) {
		return;
	}

	const style = element.style;
	let computed = getComputedStyle(element);
	if (isNaN(parseFloat(computed.top)) || isNaN(parseFloat(computed.left))) {
		style.top = '0px';
		style.left = '0px';
		computed = getComputedStyle(element);
	}
	if (isNaN(parseFloat(computed.width)) || isNaN(parseFloat(computed.height))) {
		style.width = '0px';
		style.height = '0px';
		computed = getComputedStyle(element);
	}

	const anchorRect = anchor.getBoundingClientRect();
	const elementRect = element.getBoundingClientRect();
	const dLeft = anchorRect.left - elementRect.left;
	const dTop = anchorRect.top - elementRect.top;
	const dWidth = anchorRect.width - elementRect.width;
	const dHeight = anchorRect.height - elementRect.height;
	if (Math.abs(dLeft) < 0.5 && Math.abs(dTop) < 0.5 && Math.abs(dWidth) < 0.5 && Math.abs(dHeight) < 0.5) {
		return;
	}

	style.left = `${parseFloat(computed.left) + dLeft}px`;
	style.top = `${parseFloat(computed.top) + dTop}px`;
	style.width = `${parseFloat(computed.width) + dWidth}px`;
	style.height = `${parseFloat(computed.height) + dHeight}px`;
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

	private _currentAnchor?: { readonly element: HTMLElement; readonly name: string };
	private _clippingAnchor?: { readonly element: HTMLElement; readonly name: string };

	/**
	 * The root element that contains the overlay element.
	 *
	 * This also provides clipping support for the overlay element. Clipping is needed when the anchor is
	 * scrollable and may scroll and be hidden by overflow from its parent container.
	 */
	private readonly _root: HTMLElement;

	private readonly _manualSyncListeners = new DisposableStore();
	private readonly _manualSyncFrame = new MutableDisposable<IDisposable>();
	private _manualSyncWindow?: Window;

	/**
	 * @param _manualAnchorSync Keep the overlay in sync with its anchor from script as well (see {@link needsManualAnchorSync}).
	 * @param _scheduleFrame Schedules the next sync. Only meant to be replaced in tests.
	 */
	constructor(
		private readonly _manualAnchorSync: boolean = needsManualAnchorSync,
		private readonly _scheduleFrame: (targetWindow: Window, runner: () => void) => IDisposable = scheduleAtNextAnimationFrame,
	) {
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
		this._manualSyncFrame.dispose();
		this._manualSyncListeners.dispose();
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
			this._currentAnchor = { element: anchorElement, name };
		}

		this._updateClipping(options?.clippingContainer);
		this._updateZIndex(anchorElement);

		if (this._manualAnchorSync) {
			this._startManualSync(getWindow(anchorElement));
		}
	}

	/**
	 * Re-check the overlay against its anchors on every animation frame while the overlay is visible.
	 *
	 * Owners show and hide the overlay through `content.style.visibility` without disposing it,
	 * so the frame loop pauses while the content is hidden and resumes when it is shown again.
	 */
	private _startManualSync(targetWindow: Window): void {
		if (this._manualSyncWindow !== targetWindow) {
			this._manualSyncWindow = targetWindow;
			this._manualSyncFrame.clear();
			this._manualSyncListeners.clear();
			sharedMutationObserver.observe(this.content, this._manualSyncListeners, { attributes: true, attributeFilter: ['style'] })(() => this._updateManualSync(), undefined, this._manualSyncListeners);
		}
		this._updateManualSync();
	}

	private _updateManualSync(): void {
		const targetWindow = this._manualSyncWindow;
		if (!targetWindow || this.content.style.visibility === 'hidden') {
			this._manualSyncFrame.clear();
			return;
		}
		if (!this._manualSyncFrame.value) {
			this._manualSyncFrame.value = this._scheduleFrame(targetWindow, () => {
				this._manualSyncFrame.clear();
				this._syncWithAnchors();
				this._updateManualSync();
			});
		}
	}

	private _syncWithAnchors(): void {
		if (this.content.style.visibility === 'hidden') {
			return;
		}
		if (this._clippingAnchor) {
			syncToAnchor(this._root, this._clippingAnchor.element);
		}
		if (this._currentAnchor) {
			syncToAnchor(this.content, this._currentAnchor.element);
		}
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
