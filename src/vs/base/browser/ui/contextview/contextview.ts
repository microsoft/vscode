/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserFeatures } from '../../canIUse.js';
import * as DOM from '../../dom.js';
import { StandardMouseEvent } from '../../mouseEvent.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import * as platform from '../../../common/platform.js';
import { Range } from '../../../common/range.js';
import { OmitOptional } from '../../../common/types.js';
import './contextview.css';

export const enum ContextViewDOMPosition {
	ABSOLUTE = 1,
	FIXED,
	FIXED_SHADOW
}

export interface IAnchor {
	x: number;
	y: number;
	width?: number;
	height?: number;
}

export function isAnchor(obj: unknown): obj is IAnchor | OmitOptional<IAnchor> {
	const anchor = obj as IAnchor | OmitOptional<IAnchor> | undefined;

	return !!anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number';
}

export const enum AnchorAlignment {
	LEFT, RIGHT
}

export const enum AnchorPosition {
	BELOW, ABOVE
}

export const enum AnchorAxisAlignment {
	VERTICAL, HORIZONTAL
}

export interface IDelegate {
	/**
	 * The anchor where to position the context view.
	 * Use a `HTMLElement` to position the view at the element,
	 * a `StandardMouseEvent` to position it at the mouse position
	 * or an `IAnchor` to position it at a specific location.
	 */
	getAnchor(): HTMLElement | StandardMouseEvent | IAnchor;
	render(container: HTMLElement): IDisposable | null;
	focus?(): void;
	layout?(): void;
	anchorAlignment?: AnchorAlignment; // default: left
	anchorPosition?: AnchorPosition; // default: below
	anchorAxisAlignment?: AnchorAxisAlignment; // default: vertical
	canRelayout?: boolean; // default: true
	onDOMEvent?(e: Event, activeElement: HTMLElement): void;
	onHide?(data?: unknown): void;

	/**
	 * context views with higher layers are rendered higher in z-index order
	 */
	layer?: number; // Default: 0
}

export interface IContextViewProvider {
	showContextView(delegate: IDelegate, container?: HTMLElement): void;
	hideContextView(): void;
	layout(): void;
}

export interface IPosition {
	top: number;
	left: number;
}

export interface ISize {
	width: number;
	height: number;
}

export interface IView extends IPosition, ISize { }

export const enum LayoutAnchorPosition {
	Before,
	After
}

export enum LayoutAnchorMode {
	AVOID,
	ALIGN
}

export interface ILayoutAnchor {
	offset: number;
	size: number;
	mode?: LayoutAnchorMode; // default: AVOID
	position: LayoutAnchorPosition;
}

/**
 * Lays out a one dimensional view next to an anchor in a viewport.
 *
 * @returns The view offset within the viewport.
 */
export function layout(viewportSize: number, viewSize: number, anchor: ILayoutAnchor): number {
	const layoutAfterAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset : anchor.offset + anchor.size;
	const layoutBeforeAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset + anchor.size : anchor.offset;

	if (anchor.position === LayoutAnchorPosition.Before) {
		if (viewSize <= viewportSize - layoutAfterAnchorBoundary) {
			return layoutAfterAnchorBoundary; // happy case, lay it out after the anchor
		}

		if (viewSize <= layoutBeforeAnchorBoundary) {
			return layoutBeforeAnchorBoundary - viewSize; // ok case, lay it out before the anchor
		}

		return Math.max(viewportSize - viewSize, 0); // sad case, lay it over the anchor
	} else {
		if (viewSize <= layoutBeforeAnchorBoundary) {
			return layoutBeforeAnchorBoundary - viewSize; // happy case, lay it out before the anchor
		}

		if (viewSize <= viewportSize - layoutAfterAnchorBoundary) {
			return layoutAfterAnchorBoundary; // ok case, lay it out after the anchor
		}

		return 0; // sad case, lay it over the anchor
	}
}

export class ContextView extends Disposable {

	private static readonly BUBBLE_UP_EVENTS = ['click', 'keydown', 'focus', 'blur'];
	private static readonly BUBBLE_DOWN_EVENTS = ['click'];

	private container: HTMLElement | null = null;
	private view: HTMLElement;
	private useFixedPosition = false;
	private useShadowDOM = false;
	private delegate: IDelegate | null = null;
	private toDisposeOnClean: IDisposable = Disposable.None;
	private toDisposeOnSetContainer: IDisposable = Disposable.None;
	private shadowRoot: ShadowRoot | null = null;
	private shadowRootHostElement: HTMLElement | null = null;

	constructor(container: HTMLElement, domPosition: ContextViewDOMPosition) {
		super();

		this.view = DOM.$('.context-view');
		DOM.hide(this.view);

		this.setContainer(container, domPosition);
		this._register(toDisposable(() => this.setContainer(null, ContextViewDOMPosition.ABSOLUTE)));
	}

	setContainer(container: HTMLElement | null, domPosition: ContextViewDOMPosition): void {
		this.useFixedPosition = domPosition !== ContextViewDOMPosition.ABSOLUTE;
		const usedShadowDOM = this.useShadowDOM;
		this.useShadowDOM = domPosition === ContextViewDOMPosition.FIXED_SHADOW;

		if (container === this.container && usedShadowDOM === this.useShadowDOM) {
			return; // container is the same and no shadow DOM usage has changed
		}

		if (this.container) {
			this.toDisposeOnSetContainer.dispose();

			this.view.remove();
			if (this.shadowRoot) {
				this.shadowRoot = null;
				this.shadowRootHostElement?.remove();
				this.shadowRootHostElement = null;
			}

			this.container = null;
		}

		if (container) {
			this.container = container;

			if (this.useShadowDOM) {
				this.shadowRootHostElement = DOM.$('.shadow-root-host');
				this.container.appendChild(this.shadowRootHostElement);
				this.shadowRoot = this.shadowRootHostElement.attachShadow({ mode: 'open' });
				const style = document.createElement('style');
				style.textContent = SHADOW_ROOT_CSS;
				this.shadowRoot.appendChild(style);
				this.shadowRoot.appendChild(this.view);
				this.shadowRoot.appendChild(DOM.$('slot'));
			} else {
				this.container.appendChild(this.view);
			}

			const toDisposeOnSetContainer = new DisposableStore();

			ContextView.BUBBLE_UP_EVENTS.forEach(event => {
				toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container!, event, e => {
					this.onDOMEvent(e, false);
				}));
			});

			ContextView.BUBBLE_DOWN_EVENTS.forEach(event => {
				toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container!, event, e => {
					this.onDOMEvent(e, true);
				}, true));
			});

			this.toDisposeOnSetContainer = toDisposeOnSetContainer;
		}
	}

	show(delegate: IDelegate): void {
		if (this.isVisible()) {
			this.hide();
		}

		// Show static box
		DOM.clearNode(this.view);
		this.view.className = 'context-view monaco-component';
		this.view.style.top = '0px';
		this.view.style.left = '0px';
		this.view.style.zIndex = `${2575 + (delegate.layer ?? 0)}`;
		this.view.style.position = this.useFixedPosition ? 'fixed' : 'absolute';
		DOM.show(this.view);

		// Render content
		this.toDisposeOnClean = delegate.render(this.view) || Disposable.None;

		// Set active delegate
		this.delegate = delegate;

		// Layout
		this.doLayout();

		// Focus
		this.delegate.focus?.();
	}

	getViewElement(): HTMLElement {
		return this.view;
	}

	layout(): void {
		if (!this.isVisible()) {
			return;
		}

		if (this.delegate!.canRelayout === false && !(platform.isIOS && BrowserFeatures.pointerEvents)) {
			this.hide();
			return;
		}

		this.delegate?.layout?.();

		this.doLayout();
	}

	private doLayout(): void {
		// Check that we still have a delegate - this.delegate.layout may have hidden
		if (!this.isVisible()) {
			return;
		}

		// Get anchor
		const anchor = this.delegate!.getAnchor();

		// Compute around
		let around: IView;

		// Get the element's position and size (to anchor the view)
		if (DOM.isHTMLElement(anchor)) {
			const elementPosition = DOM.getDomNodePagePosition(anchor);

			// In areas where zoom is applied to the element or its ancestors, we need to adjust the size of the element
			// e.g. The title bar has counter zoom behavior meaning it applies the inverse of zoom level.
			// Window Zoom Level: 1.5, Title Bar Zoom: 1/1.5, Size Multiplier: 1.5
			const zoom = DOM.getDomNodeZoomLevel(anchor);

			around = {
				top: elementPosition.top * zoom,
				left: elementPosition.left * zoom,
				width: elementPosition.width * zoom,
				height: elementPosition.height * zoom
			};
		} else if (isAnchor(anchor)) {
			around = {
				top: anchor.y,
				left: anchor.x,
				width: anchor.width || 1,
				height: anchor.height || 2
			};
		} else {
			around = {
				top: anchor.posy,
				left: anchor.posx,
				// We are about to position the context view where the mouse
				// cursor is. To prevent the view being exactly under the mouse
				// when showing and thus potentially triggering an action within,
				// we treat the mouse location like a small sized block element.
				width: 2,
				height: 2
			};
		}

		const viewSizeWidth = DOM.getTotalWidth(this.view);
		const viewSizeHeight = DOM.getTotalHeight(this.view);

		const anchorPosition = this.delegate!.anchorPosition ?? AnchorPosition.BELOW;
		const anchorAlignment = this.delegate!.anchorAlignment ?? AnchorAlignment.LEFT;
		const anchorAxisAlignment = this.delegate!.anchorAxisAlignment ?? AnchorAxisAlignment.VERTICAL;

		let top: number;
		let left: number;

		const activeWindow = DOM.getActiveWindow();
		if (anchorAxisAlignment === AnchorAxisAlignment.VERTICAL) {
			const verticalAnchor: ILayoutAnchor = { offset: around.top - activeWindow.pageYOffset, size: around.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After };
			const horizontalAnchor: ILayoutAnchor = { offset: around.left, size: around.width, position: anchorAlignment === AnchorAlignment.LEFT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After, mode: LayoutAnchorMode.ALIGN };

			top = layout(activeWindow.innerHeight, viewSizeHeight, verticalAnchor) + activeWindow.pageYOffset;

			// if view intersects vertically with anchor,  we must avoid the anchor
			if (Range.intersects({ start: top, end: top + viewSizeHeight }, { start: verticalAnchor.offset, end: verticalAnchor.offset + verticalAnchor.size })) {
				horizontalAnchor.mode = LayoutAnchorMode.AVOID;
			}

			left = layout(activeWindow.innerWidth, viewSizeWidth, horizontalAnchor);
		} else {
			const horizontalAnchor: ILayoutAnchor = { offset: around.left, size: around.width, position: anchorAlignment === AnchorAlignment.LEFT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After };
			const verticalAnchor: ILayoutAnchor = { offset: around.top, size: around.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After, mode: LayoutAnchorMode.ALIGN };

			left = layout(activeWindow.innerWidth, viewSizeWidth, horizontalAnchor);

			// if view intersects horizontally with anchor, we must avoid the anchor
			if (Range.intersects({ start: left, end: left + viewSizeWidth }, { start: horizontalAnchor.offset, end: horizontalAnchor.offset + horizontalAnchor.size })) {
				verticalAnchor.mode = LayoutAnchorMode.AVOID;
			}

			top = layout(activeWindow.innerHeight, viewSizeHeight, verticalAnchor) + activeWindow.pageYOffset;
		}

		this.view.classList.remove('top', 'bottom', 'left', 'right');
		this.view.classList.add(anchorPosition === AnchorPosition.BELOW ? 'bottom' : 'top');
		this.view.classList.add(anchorAlignment === AnchorAlignment.LEFT ? 'left' : 'right');
		this.view.classList.toggle('fixed', this.useFixedPosition);

		const containerPosition = DOM.getDomNodePagePosition(this.container!);

		// Account for container scroll when positioning the context view
		const containerScrollTop = this.container!.scrollTop || 0;
		const containerScrollLeft = this.container!.scrollLeft || 0;

		this.view.style.top = `${top - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).top : containerPosition.top) + containerScrollTop}px`;
		this.view.style.left = `${left - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).left : containerPosition.left) + containerScrollLeft}px`;
		this.view.style.width = 'initial';
	}

	hide(data?: unknown): void {
		const delegate = this.delegate;
		this.delegate = null;

		if (delegate?.onHide) {
			delegate.onHide(data);
		}

		this.toDisposeOnClean.dispose();

		DOM.hide(this.view);
	}

	private isVisible(): boolean {
		return !!this.delegate;
	}

	private onDOMEvent(e: UIEvent, onCapture: boolean): void {
		if (this.delegate) {
			if (this.delegate.onDOMEvent) {
				this.delegate.onDOMEvent(e, <HTMLElement>DOM.getWindow(e).document.activeElement);
			} else if (onCapture && !DOM.isAncestor(<HTMLElement>e.target, this.container)) {
				this.hide();
			}
		}
	}

	override dispose(): void {
		this.hide();

		super.dispose();
	}
}

const SHADOW_ROOT_CSS = /* css */ `
	:host {
		all: initial; /* 1st rule so subsequent properties are reset. */
	}

	.codicon[class*='codicon-'] {
		font: normal normal normal 16px/1 codicon;
		display: inline-block;
		text-decoration: none;
		text-rendering: auto;
		text-align: center;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
	}

	:host {
		font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif;
	}

	:host-context(.mac) { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
	:host-context(.mac:lang(zh-Hans)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif; }
	:host-context(.mac:lang(zh-Hant)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif; }
	:host-context(.mac:lang(ja)) { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic Pro", sans-serif; }
	:host-context(.mac:lang(ko)) { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Nanum Gothic", "AppleGothic", sans-serif; }

	:host-context(.windows) { font-family: "Segoe WPC", "Segoe UI", sans-serif; }
	:host-context(.windows:lang(zh-Hans)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft YaHei", sans-serif; }
	:host-context(.windows:lang(zh-Hant)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft Jhenghei", sans-serif; }
	:host-context(.windows:lang(ja)) { font-family: "Segoe WPC", "Segoe UI", "Yu Gothic UI", "Meiryo UI", sans-serif; }
	:host-context(.windows:lang(ko)) { font-family: "Segoe WPC", "Segoe UI", "Malgun Gothic", "Dotom", sans-serif; }

	:host-context(.linux) { font-family: system-ui, "Ubuntu", "Droid Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hans)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans SC", "Source Han Sans CN", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hant)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans TC", "Source Han Sans TW", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ja)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans J", "Source Han Sans JP", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ko)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans K", "Source Han Sans JR", "Source Han Sans", "UnDotum", "FBaekmuk Gulim", sans-serif; }
`;
