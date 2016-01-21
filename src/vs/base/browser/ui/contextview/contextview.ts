/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import 'vs/css!./contextview';
import {Builder, $} from 'vs/base/browser/builder';
import DOM = require('vs/base/browser/dom');
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {EventEmitter} from 'vs/base/common/eventEmitter';

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

export function layout(view: ISize, around: IView, inside: IView, anchorPosition: AnchorPosition, anchorAlignment: AnchorAlignment): IPosition {
	let top: number, left: number;

	if (anchorPosition === AnchorPosition.BELOW) {
		top = around.top + around.height - inside.top;
		if (inside.top + top + view.height > inside.height && around.top - inside.top > view.height) {
			top = around.top - view.height - inside.top;
		}
	} else {
		top = around.top - view.height - inside.top;
		if (top + inside.top < 0 && around.top + around.height + view.height - inside.top < inside.height) {
			top = around.top + around.height - inside.top;
		}
	}

	if (anchorAlignment === AnchorAlignment.LEFT) {
		left = around.left - inside.left;
		if (inside.left + left + view.width > inside.width) {
			left -= view.width - around.width;
		}
	} else {
		left = around.left + around.width - view.width - inside.left;
		if (left + inside.left < 0 && around.left + view.width < inside.width) {
			left = around.left - inside.left;
		}
	}

	return { top: top, left: left };
}

export class ContextView extends EventEmitter {

	private static BUBBLE_UP_EVENTS = ['click', 'keydown', 'focus', 'blur'];
	private static BUBBLE_DOWN_EVENTS = ['click'];

	private $container: Builder;
	private $view: Builder;
	private delegate: IDelegate;
	private toDispose: IDisposable[];
	private toDisposeOnClean: IDisposable;

	constructor(container: HTMLElement) {
		super();
		this.$view = $('.context-view').hide();
		this.setContainer(container);

		this.toDispose = [{
			dispose: () => {
				this.setContainer(null);
			}
		}];

		this.toDisposeOnClean = null;
	}

	public setContainer(container: HTMLElement): void {
		if (this.$container) {
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
		// Get anchor
		let anchor = this.delegate.getAnchor();

		// Compute around
		let around: IView;

		// Get the element's position and size (to anchor the view)
		if (DOM.isHTMLElement(anchor)) {
			let $anchor = $(<HTMLElement>anchor);
			let elementPosition = $anchor.getPosition();
			let elementSize = $anchor.getTotalSize();

			around = {
				top: elementPosition.top,
				left: elementPosition.left,
				width: elementSize.width,
				height: elementSize.height
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

		// Get the container's position
		let insidePosition = this.$container.getPosition();
		let inside = {
			top: insidePosition.top,
			left: insidePosition.left,
			height: window.innerHeight,
			width: window.innerWidth
		};

		// Get the view's size
		let viewSize = this.$view.getTotalSize();
		let view = { width: viewSize.width, height: viewSize.height };

		let anchorPosition = this.delegate.anchorPosition || AnchorPosition.BELOW;
		let anchorAlignment = this.delegate.anchorAlignment || AnchorAlignment.LEFT;

		let result = layout(view, around, inside, anchorPosition, anchorAlignment);

		this.$view.removeClass('top', 'bottom', 'left', 'right');
		this.$view.addClass(anchorPosition === AnchorPosition.BELOW ? 'bottom' : 'top');
		this.$view.addClass(anchorAlignment === AnchorAlignment.LEFT ? 'left' : 'right');
		this.$view.style({ top: result.top + 'px', left: result.left + 'px', width: 'initial' });
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
		super.dispose();
		this.hide();

		this.toDispose = disposeAll(this.toDispose);
	}
}