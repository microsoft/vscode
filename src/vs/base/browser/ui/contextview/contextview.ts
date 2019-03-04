/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./contextview';
import * as DOM from 'vs/base/browser/dom';
import { IDisposable, dispose, toDisposable, combinedDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/base/common/range';

export interface IAnchor {
	x: number;
	y: number;
	width?: number;
	height?: number;
}

export const enum AnchorAlignment {
	LEFT, RIGHT
}

export const enum AnchorPosition {
	BELOW, ABOVE
}

export interface IDelegate {
	getAnchor(): HTMLElement | IAnchor;
	render(container: HTMLElement): IDisposable | null;
	focus?(): void;
	layout?(): void;
	anchorAlignment?: AnchorAlignment; // default: left
	anchorPosition?: AnchorPosition; // default: below
	canRelayout?: boolean; // default: true
	onDOMEvent?(e: Event, activeElement: HTMLElement): void;
	onHide?(data?: any): void;
}

export interface IContextViewProvider {
	showContextView(delegate: IDelegate): void;
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

export interface ILayoutAnchor {
	offset: number;
	size: number;
	position: LayoutAnchorPosition;
}

/**
 * Lays out a one dimensional view next to an anchor in a viewport.
 *
 * @returns The view offset within the viewport.
 */
export function layout(viewportSize: number, viewSize: number, anchor: ILayoutAnchor): number {
	const anchorEnd = anchor.offset + anchor.size;

	if (anchor.position === LayoutAnchorPosition.Before) {
		if (viewSize <= viewportSize - anchorEnd) {
			return anchorEnd; // happy case, lay it out after the anchor
		}

		if (viewSize <= anchor.offset) {
			return anchor.offset - viewSize; // ok case, lay it out before the anchor
		}

		return Math.max(viewportSize - viewSize, 0); // sad case, lay it over the anchor
	} else {
		if (viewSize <= anchor.offset) {
			return anchor.offset - viewSize; // happy case, lay it out before the anchor
		}

		if (viewSize <= viewportSize - anchorEnd) {
			return anchorEnd; // ok case, lay it out after the anchor
		}

		return 0; // sad case, lay it over the anchor
	}
}

export class ContextView extends Disposable {

	private static readonly BUBBLE_UP_EVENTS = ['click', 'keydown', 'focus', 'blur'];
	private static readonly BUBBLE_DOWN_EVENTS = ['click'];

	private container: HTMLElement | null;
	private view: HTMLElement;
	private delegate: IDelegate | null;
	private toDisposeOnClean: IDisposable | null;
	private toDisposeOnSetContainer: IDisposable;

	constructor(container: HTMLElement) {
		super();

		this.view = DOM.$('.context-view');

		DOM.hide(this.view);

		this.setContainer(container);

		this._register(toDisposable(() => this.setContainer(null)));
	}

	public setContainer(container: HTMLElement | null): void {
		if (this.container) {
			this.toDisposeOnSetContainer = dispose(this.toDisposeOnSetContainer);
			this.container.removeChild(this.view);
			this.container = null;
		}
		if (container) {
			this.container = container;
			this.container.appendChild(this.view);

			const toDisposeOnSetContainer: IDisposable[] = [];

			ContextView.BUBBLE_UP_EVENTS.forEach(event => {
				toDisposeOnSetContainer.push(DOM.addStandardDisposableListener(this.container!, event, (e: Event) => {
					this.onDOMEvent(e, <HTMLElement>document.activeElement, false);
				}));
			});

			ContextView.BUBBLE_DOWN_EVENTS.forEach(event => {
				toDisposeOnSetContainer.push(DOM.addStandardDisposableListener(this.container!, event, (e: Event) => {
					this.onDOMEvent(e, <HTMLElement>document.activeElement, true);
				}, true));
			});

			this.toDisposeOnSetContainer = combinedDisposable(toDisposeOnSetContainer);
		}
	}

	public show(delegate: IDelegate): void {
		if (this.isVisible()) {
			this.hide();
		}

		// Show static box
		DOM.clearNode(this.view);
		this.view.className = 'context-view';
		this.view.style.top = '0px';
		this.view.style.left = '0px';
		DOM.show(this.view);

		// Render content
		this.toDisposeOnClean = delegate.render(this.view);

		// Set active delegate
		this.delegate = delegate;

		// Layout
		this.doLayout();

		// Focus
		if (this.delegate.focus) {
			this.delegate.focus();
		}
	}

	public layout(): void {
		if (!this.isVisible()) {
			return;
		}

		if (this.delegate!.canRelayout === false) {
			this.hide();
			return;
		}

		if (this.delegate!.layout) {
			this.delegate!.layout!();
		}

		this.doLayout();
	}

	private doLayout(): void {
		// Check that we still have a delegate - this.delegate.layout may have hidden
		if (!this.isVisible()) {
			return;
		}

		// Get anchor
		let anchor = this.delegate!.getAnchor();

		// Compute around
		let around: IView;

		// Get the element's position and size (to anchor the view)
		if (DOM.isHTMLElement(anchor)) {
			let elementPosition = DOM.getDomNodePagePosition(anchor);

			around = {
				top: elementPosition.top,
				left: elementPosition.left,
				width: elementPosition.width,
				height: elementPosition.height
			};
		} else {
			let realAnchor = <IAnchor>anchor;

			around = {
				top: realAnchor.y,
				left: realAnchor.x,
				width: realAnchor.width || 1,
				height: realAnchor.height || 2
			};
		}

		const viewSizeWidth = DOM.getTotalWidth(this.view);
		const viewSizeHeight = DOM.getTotalHeight(this.view);

		const anchorPosition = this.delegate!.anchorPosition || AnchorPosition.BELOW;
		const anchorAlignment = this.delegate!.anchorAlignment || AnchorAlignment.LEFT;

		const verticalAnchor: ILayoutAnchor = { offset: around.top - window.pageYOffset, size: around.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After };

		let horizontalAnchor: ILayoutAnchor;

		if (anchorAlignment === AnchorAlignment.LEFT) {
			horizontalAnchor = { offset: around.left, size: 0, position: LayoutAnchorPosition.Before };
		} else {
			horizontalAnchor = { offset: around.left + around.width, size: 0, position: LayoutAnchorPosition.After };
		}

		const top = layout(window.innerHeight, viewSizeHeight, verticalAnchor) + window.pageYOffset;

		// if view intersects vertically with anchor, shift it horizontally
		if (Range.intersects({ start: top, end: top + viewSizeHeight }, { start: verticalAnchor.offset, end: verticalAnchor.offset + verticalAnchor.size })) {
			horizontalAnchor.size = around.width;
		}

		const left = layout(window.innerWidth, viewSizeWidth, horizontalAnchor);

		DOM.removeClasses(this.view, 'top', 'bottom', 'left', 'right');
		DOM.addClass(this.view, anchorPosition === AnchorPosition.BELOW ? 'bottom' : 'top');
		DOM.addClass(this.view, anchorAlignment === AnchorAlignment.LEFT ? 'left' : 'right');

		const containerPosition = DOM.getDomNodePagePosition(this.container!);
		this.view.style.top = `${top - containerPosition.top}px`;
		this.view.style.left = `${left - containerPosition.left}px`;
		this.view.style.width = 'initial';
	}

	public hide(data?: any): void {
		if (this.delegate && this.delegate.onHide) {
			this.delegate.onHide(data);
		}

		this.delegate = null;

		if (this.toDisposeOnClean) {
			this.toDisposeOnClean.dispose();
			this.toDisposeOnClean = null;
		}

		DOM.hide(this.view);
	}

	private isVisible(): boolean {
		return !!this.delegate;
	}

	private onDOMEvent(e: Event, element: HTMLElement, onCapture: boolean): void {
		if (this.delegate) {
			if (this.delegate.onDOMEvent) {
				this.delegate.onDOMEvent(e, <HTMLElement>document.activeElement);
			} else if (onCapture && !DOM.isAncestor(<HTMLElement>e.target, this.container)) {
				this.hide();
			}
		}
	}

	public dispose(): void {
		this.hide();

		super.dispose();
	}
}