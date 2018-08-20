/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./contextview';
import { Builder, $ } from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';

export interface IAnchor {
	x: number;
	y: number;
	width?: number;
	height?: number;
}

export enum AnchorAlignment {
	LEFT, RIGHT
}

export enum AnchorPosition {
	BELOW, ABOVE
}

export interface IDelegate {
	getAnchor(): HTMLElement | IAnchor;
	render(container: HTMLElement): IDisposable;
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

export enum LayoutAnchorPosition {
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

export class ContextView {

	private static readonly BUBBLE_UP_EVENTS = ['click', 'keydown', 'focus', 'blur'];
	private static readonly BUBBLE_DOWN_EVENTS = ['click'];

	private $container: Builder;
	private $view: Builder;
	private delegate: IDelegate;
	private toDispose: IDisposable[];
	private toDisposeOnClean: IDisposable;

	constructor(container: HTMLElement) {
		this.$view = $('.context-view').hide();
		this.setContainer(container);

		this.toDispose = [toDisposable(() => {
			this.setContainer(null);
		})];

		this.toDisposeOnClean = null;
	}

	public setContainer(container: HTMLElement): void {
		if (this.$container) {
			this.$container.getHTMLElement().removeChild(this.$view.getHTMLElement());
			this.$container.off(ContextView.BUBBLE_UP_EVENTS);
			this.$container.off(ContextView.BUBBLE_DOWN_EVENTS, true);
			this.$container = null;
		}
		if (container) {
			this.$container = $(container);
			this.$view.appendTo(this.$container);
			this.$container.on(ContextView.BUBBLE_UP_EVENTS, (e: Event) => {
				this.onDOMEvent(e, <HTMLElement>document.activeElement, false);
			});
			this.$container.on(ContextView.BUBBLE_DOWN_EVENTS, (e: Event) => {
				this.onDOMEvent(e, <HTMLElement>document.activeElement, true);
			}, null, true);
		}
	}

	public show(delegate: IDelegate): void {
		if (this.isVisible()) {
			this.hide();
		}

		// Show static box
		this.$view.setClass('context-view').empty().style({ top: '0px', left: '0px' }).show();

		// Render content
		this.toDisposeOnClean = delegate.render(this.$view.getHTMLElement());

		// Set active delegate
		this.delegate = delegate;

		// Layout
		this.doLayout();
	}

	public layout(): void {
		if (!this.isVisible()) {
			return;
		}

		if (this.delegate.canRelayout === false) {
			this.hide();
			return;
		}

		if (this.delegate.layout) {
			this.delegate.layout();
		}

		this.doLayout();
	}

	private doLayout(): void {
		// Check that we still have a delegate - this.delegate.layout may have hidden
		if (!this.isVisible()) {
			return;
		}

		// Get anchor
		let anchor = this.delegate.getAnchor();

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
				width: realAnchor.width || 0,
				height: realAnchor.height || 0
			};
		}

		const viewSize = this.$view.getTotalSize();
		const anchorPosition = this.delegate.anchorPosition || AnchorPosition.BELOW;
		const anchorAlignment = this.delegate.anchorAlignment || AnchorAlignment.LEFT;

		const verticalAnchor: ILayoutAnchor = { offset: around.top, size: around.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After };

		let horizontalAnchor: ILayoutAnchor;

		if (anchorAlignment === AnchorAlignment.LEFT) {
			horizontalAnchor = { offset: around.left, size: 0, position: LayoutAnchorPosition.Before };
		} else {
			horizontalAnchor = { offset: around.left + around.width, size: 0, position: LayoutAnchorPosition.After };
		}

		const containerPosition = DOM.getDomNodePagePosition(this.$container.getHTMLElement());
		const top = layout(window.innerHeight, viewSize.height, verticalAnchor) - containerPosition.top;
		const left = layout(window.innerWidth, viewSize.width, horizontalAnchor) - containerPosition.left;

		this.$view.removeClass('top', 'bottom', 'left', 'right');
		this.$view.addClass(anchorPosition === AnchorPosition.BELOW ? 'bottom' : 'top');
		this.$view.addClass(anchorAlignment === AnchorAlignment.LEFT ? 'left' : 'right');
		this.$view.style({ top: `${top}px`, left: `${left}px`, width: 'initial' });
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

		this.$view.hide();
	}

	private isVisible(): boolean {
		return !!this.delegate;
	}

	private onDOMEvent(e: Event, element: HTMLElement, onCapture: boolean): void {
		if (this.delegate) {
			if (this.delegate.onDOMEvent) {
				this.delegate.onDOMEvent(e, <HTMLElement>document.activeElement);
			} else if (onCapture && !DOM.isAncestor(<HTMLElement>e.target, this.$container.getHTMLElement())) {
				this.hide();
			}
		}
	}

	public dispose(): void {
		this.hide();

		this.toDispose = dispose(this.toDispose);
	}
}