/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview';
import { IDisposable, combinedDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import Event, { fromEventEmitter, mapEvent } from 'vs/base/common/event';
import types = require('vs/base/common/types');
import dom = require('vs/base/browser/dom');
import { Sash, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider, Orientation, ISashEvent as IBaseSashEvent } from 'vs/base/browser/ui/sash/sash';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

interface ISashEvent {
	sash: Sash;
	start: number;
	current: number;
}

export interface IOptions {
	orientation?: Orientation; // default Orientation.VERTICAL
	canChangeOrderByDragAndDrop?: boolean;
}

export interface IView {
	readonly minimumSize: number;
	readonly maximumSize: number;
	readonly onDidChange: Event<void>;
	render(container: HTMLElement, orientation: Orientation): void;
	layout(size: number, orientation: Orientation): void;
	focus(): void;
}

class ViewItem {

	public explicitSize: number;

	constructor(
		readonly view: IView,
		readonly container: HTMLElement,
		public size: number,
		private orientation: Orientation,
		private disposables: IDisposable[]
	) {

	}

	layout(): void {
		if (this.orientation === Orientation.VERTICAL) {
			this.container.style.height = `${this.size}px`;
		} else {
			this.container.style.width = `${this.size}px`;
		}

		this.view.layout(this.size, this.orientation);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

interface ISashItem {
	sash: Sash;
	disposable: IDisposable;
}

export class SplitView implements IDisposable, IHorizontalSashLayoutProvider, IVerticalSashLayoutProvider {

	private orientation: Orientation;

	private el: HTMLElement;
	// private size: number;
	// private viewElements: HTMLElement[];
	private viewItems: ViewItem[] = [];
	private sashItems: ISashItem[] = [];
	// private viewChangeListeners: IDisposable[];
	// private viewFocusPreviousListeners: IDisposable[];
	// private viewFocusNextListeners: IDisposable[];
	// private viewFocusListeners: IDisposable[];
	// private viewDnDListeners: IDisposable[][];
	// private sashOrientation: Orientation;
	// private sashes: Sash[];
	// private sashesListeners: IDisposable[];
	// private eventWrapper: (event: ISashEvent) => ISashEvent;
	// private animationTimeout: number;
	// private state: IState;

	// private _onFocus: Emitter<IView> = this._register(new Emitter<IView>());
	// readonly onFocus: Event<IView> = this._onFocus.event;

	// private _onDidOrderChange: Emitter<void> = this._register(new Emitter<void>());
	// readonly onDidOrderChange: Event<void> = this._onDidOrderChange.event;

	get length(): number {
		return this.viewItems.length;
	}

	constructor(private container: HTMLElement, options?: IOptions) {
		options = options || {};
		this.orientation = types.isUndefined(options.orientation) ? Orientation.VERTICAL : options.orientation;

		this.el = document.createElement('div');
		dom.addClass(this.el, 'monaco-split-view');
		dom.addClass(this.el, this.orientation === Orientation.VERTICAL ? 'vertical' : 'horizontal');
		container.appendChild(this.el);

		// this.size = null;
		// this.viewElements = [];
		// this.views = [];
		// this.viewChangeListeners = [];
		// this.viewFocusPreviousListeners = [];
		// this.viewFocusNextListeners = [];
		// this.viewFocusListeners = [];
		// this.viewDnDListeners = [];
		// this.sashes = [];
		// this.sashesListeners = [];
		// this.animationTimeout = null;

		// this.sashOrientation = this.orientation === Orientation.VERTICAL
		// 	? Orientation.HORIZONTAL
		// 	: Orientation.VERTICAL;

		// if (this.orientation === Orientation.VERTICAL) {
		// 	this.eventWrapper = e => { return { start: e.startY, current: e.currentY }; };
		// } else {
		// 	this.eventWrapper = e => { return { start: e.startX, current: e.currentX }; };
		// }

		// The void space exists to handle the case where all other views are fixed size
		// this.addView(new VoidView(), 0);
	}

	private getContainerSize(): number {
		return this.orientation === Orientation.VERTICAL
			? dom.getContentHeight(this.container)
			: dom.getContentWidth(this.container);
	}

	addView(view: IView, size: number, index = this.viewItems.length - 1): void {
		// Create view container
		const container = document.createElement('div');
		dom.addClass(container, 'split-view-view');
		const containerDisposable = toDisposable(() => this.el.removeChild(container));

		// List to change events
		const onChangeDisposable = mapEvent(view.onDidChange, () => item)(this.onViewChange, this);

		// Create item
		const item = new ViewItem(view, container, size, this.orientation, [onChangeDisposable, containerDisposable]);
		this.viewItems.splice(index, 0, item);

		// Render view
		view.render(container, this.orientation);

		// Attach view
		if (this.viewItems.length === 1) {
			this.el.appendChild(container);
		} else {
			this.el.insertBefore(container, this.el.children.item(index));
		}

		// Add sash
		if (this.viewItems.length <= 1) {
			return;
		}

		const orientation = this.orientation === Orientation.VERTICAL
			? Orientation.HORIZONTAL
			: Orientation.VERTICAL;

		const sash = new Sash(this.el, this, { orientation });
		const sashEventMapper = this.orientation === Orientation.VERTICAL
			? (e: IBaseSashEvent) => ({ sash, start: e.startY, current: e.currentY })
			: (e: IBaseSashEvent) => ({ sash, start: e.startX, current: e.currentX });

		const onStart = mapEvent(fromEventEmitter<IBaseSashEvent>(sash, 'start'), sashEventMapper);
		const onStartDisposable = onStart(this.onSashStart, this);

		const onChange = mapEvent(fromEventEmitter<IBaseSashEvent>(sash, 'change'), sashEventMapper);
		const onSashChangeDisposable = onChange(this.onSashChange, this);

		const disposable = combinedDisposable([onStartDisposable, onSashChangeDisposable, sash]);

		const sashItem: ISashItem = {
			sash,
			disposable
		};

		this.sashItems.splice(index - 1, 0, sashItem);
	}

	removeView(index: number): void {
		if (index < 0 || index >= this.viewItems.length) {
			return;
		}

		// Remove view
		const viewItem = this.viewItems.splice(index, 1)[0];
		viewItem.dispose();

		if (this.viewItems.length < 1) {
			return;
		}

		// Remove sash
		const sashIndex = Math.max(index - 1, 0);
		const sashItem = this.sashItems.splice(sashIndex, 1)[0];
		sashItem.disposable.dispose();
	}

	layout(size?: number): void {
		size = size || this.getContainerSize();
	}

	private onSashStart({ sash, start, current }: ISashEvent): void {

	}

	private onSashChange({ sash, start, current }: ISashEvent): void {

	}

	// Main algorithm
	// private expandCollapse(collapse: number, collapses: number[], expands: number[], collapseIndexes: number[], expandIndexes: number[]): void {
	// 	let totalCollapse = collapse;
	// 	let totalExpand = totalCollapse;

	// 	collapseIndexes.forEach(i => {
	// 		let collapse = Math.min(collapses[i], totalCollapse);
	// 		totalCollapse -= collapse;
	// 		this.views[i].size -= collapse;
	// 	});

	// 	expandIndexes.forEach(i => {
	// 		let expand = Math.min(expands[i], totalExpand);
	// 		totalExpand -= expand;
	// 		this.views[i].size += expand;
	// 	});
	// }

	private getLastFlexibleViewIndex(exceptIndex: number = null): number {
		// for (let i = this.views.length - 1; i >= 0; i--) {
		// 	if (exceptIndex === i) {
		// 		continue;
		// 	}
		// 	if (this.views[i].sizing === ViewSizing.Flexible) {
		// 		return i;
		// 	}
		// }

		return -1;
	}

	private layoutViews(): void {
		this.viewItems.forEach(item => item.layout());
		this.sashItems.forEach(item => item.sash.layout());

		// Update sashes enablement
		// let previous = false;
		// let collapsesDown = this.views.map(v => previous = (v.size - v.minimumSize > 0) || previous);

		// previous = false;
		// let expandsDown = this.views.map(v => previous = (v.maximumSize - v.size > 0) || previous);

		// let reverseViews = this.views.slice().reverse();
		// previous = false;
		// let collapsesUp = reverseViews.map(v => previous = (v.size - v.minimumSize > 0) || previous).reverse();

		// previous = false;
		// let expandsUp = reverseViews.map(v => previous = (v.maximumSize - v.size > 0) || previous).reverse();

		// this.sashes.forEach((s, i) => {
		// 	if ((collapsesDown[i] && expandsUp[i + 1]) || (expandsDown[i] && collapsesUp[i + 1])) {
		// 		s.enable();
		// 	} else {
		// 		s.disable();
		// 	}
		// });
	}

	private onViewChange(view: ViewItem): void {
	}

	// private setupAnimation(): void {
	// 	if (types.isNumber(this.animationTimeout)) {
	// 		window.clearTimeout(this.animationTimeout);
	// 	}

	// 	dom.addClass(this.el, 'animated');
	// 	this.animationTimeout = window.setTimeout(() => this.clearAnimation(), 200);
	// }

	// private clearAnimation(): void {
	// 	this.animationTimeout = null;
	// 	dom.removeClass(this.el, 'animated');
	// }

	getVerticalSashLeft(sash: Sash): number {
		return this.getSashPosition(sash);
	}

	getHorizontalSashTop(sash: Sash): number {
		return this.getSashPosition(sash);
	}

	private getSashPosition(sash: Sash): number {
		let position = 0;

		for (let i = 0; i < this.sashItems.length; i++) {
			position += this.viewItems[i].size;

			if (this.sashItems[i].sash === sash) {
				return position;
			}
		}

		throw new Error('Sash not found');
	}

	dispose(): void {
	}
}
