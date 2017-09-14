/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview';
import { IDisposable, combinedDisposable, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { fromEventEmitter, mapEvent } from 'vs/base/common/event';
import types = require('vs/base/common/types');
import dom = require('vs/base/browser/dom');
import { clamp } from 'vs/base/common/numbers';
import { range, firstIndex, weave } from 'vs/base/common/arrays';
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

interface IViewItem {
	view: IView;
	size: number;
	explicitSize: number;
	container: HTMLElement;
	disposable: IDisposable;
}

function layoutViewItem(item: IViewItem, orientation: Orientation): void {
	if (orientation === Orientation.VERTICAL) {
		item.container.style.height = `${item.size}px`;
	} else {
		item.container.style.width = `${item.size}px`;
	}

	item.view.layout(item.size, orientation);
}

interface ISashItem {
	sash: Sash;
	disposable: IDisposable;
}

interface ISashDragState {
	start: number;
	sizes: number[];
	up: number[];
	down: number[];
	maxUp: number;
	maxDown: number;
	collapses: number[];
	expands: number[];
}

const sum = (a: number[]) => a.reduce((a, b) => a + b, 0);

export class SplitView implements IDisposable, IHorizontalSashLayoutProvider, IVerticalSashLayoutProvider {

	private orientation: Orientation;

	private el: HTMLElement;
	private size = 0;
	// private viewElements: HTMLElement[];
	private viewItems: IViewItem[] = [];
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
	private sashDragState: ISashDragState;

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

	// private getContainerSize(): number {
	// 	return this.orientation === Orientation.VERTICAL
	// 		? dom.getContentHeight(this.container)
	// 		: dom.getContentWidth(this.container);
	// }

	addView(view: IView, size: number, index = this.viewItems.length): void {
		// Create view container
		const container = document.createElement('div');
		dom.addClass(container, 'split-view-view');
		const containerDisposable = toDisposable(() => this.el.removeChild(container));

		// Create item
		const item: IViewItem = { view, container, explicitSize: size, size, disposable: EmptyDisposable };
		this.viewItems.splice(index, 0, item);

		const onChangeDisposable = mapEvent(view.onDidChange, () => item)(this.onViewChange, this);

		// Disposable
		item.disposable = combinedDisposable([onChangeDisposable, containerDisposable]);

		// Render view
		view.render(container, this.orientation);

		// Attach view
		if (this.viewItems.length === 1) {
			this.el.appendChild(container);
		} else {
			this.el.insertBefore(container, this.el.children.item(index));
		}

		// Add sash
		if (this.viewItems.length > 1) {
			const orientation = this.orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
			const sash = new Sash(this.el, this, { orientation });
			const sashEventMapper = this.orientation === Orientation.VERTICAL
				? (e: IBaseSashEvent) => ({ sash, start: e.startY, current: e.currentY })
				: (e: IBaseSashEvent) => ({ sash, start: e.startX, current: e.currentX });

			const onStart = mapEvent(fromEventEmitter<IBaseSashEvent>(sash, 'start'), sashEventMapper);
			const onStartDisposable = onStart(this.onSashStart, this);
			const onChange = mapEvent(fromEventEmitter<IBaseSashEvent>(sash, 'change'), sashEventMapper);
			const onSashChangeDisposable = onChange(this.onSashChange, this);
			const disposable = combinedDisposable([onStartDisposable, onSashChangeDisposable, sash]);
			const sashItem: ISashItem = { sash, disposable };

			this.sashItems.splice(index - 1, 0, sashItem);
		}

		// TODO: layout
		// go through all viewitems, set their size to preferred size
		// sum all sizes up
		// run expandcollapse

		this.viewItems.forEach(i => i.size = clamp(i.explicitSize, i.view.minimumSize, i.view.maximumSize));

		const previousSize = this.size;
		this.size = this.viewItems.reduce((r, i) => r + i.size, 0);
		this.layout(previousSize);
	}

	removeView(index: number): void {
		if (index < 0 || index >= this.viewItems.length) {
			return;
		}

		// Remove view
		const viewItem = this.viewItems.splice(index, 1)[0];
		const collapse = viewItem.size;
		viewItem.disposable.dispose();

		// Remove sash
		if (this.viewItems.length >= 1) {
			const sashIndex = Math.max(index - 1, 0);
			const sashItem = this.sashItems.splice(sashIndex, 1)[0];
			sashItem.disposable.dispose();
		}

		// Layout views
		const up = range(index - 1, -1);
		const down = range(index, this.viewItems.length);
		const indexes = weave(up, down);
		const collapses = this.viewItems.map(i => Math.max(i.size - i.view.minimumSize, 0));

		this.expandCollapse(collapse, collapses, [], indexes, []);
	}

	layout(size: number): void {
		// size = size || this.getContainerSize();

		// size = Math.max(size, this.viewItems.reduce((t, i) => t + i.view.minimumSize, 0));


		if (this.size === size) {
			return;
		}

		const indexes = range(this.viewItems.length - 1, -1);
		const collapses = this.viewItems.map(i => Math.max(i.size - i.view.minimumSize, 0));
		const expands = this.viewItems.map(i => Math.max(i.view.maximumSize - i.size, 0));
		const diff = Math.abs(this.size - size);

		if (size < this.size) {
			this.expandCollapse(Math.min(diff, sum(collapses)), collapses, expands, indexes, []);
		} else if (size > this.size) {
			this.expandCollapse(Math.min(diff, sum(expands)), collapses, expands, [], indexes);
		}

		this.size = size;
	}

	private onSashStart({ sash, start }: ISashEvent): void {
		const i = firstIndex(this.sashItems, item => item.sash === sash);
		const sizes = this.viewItems.map(i => i.size);
		const collapses = this.viewItems.map(i => Math.max(i.size - i.view.minimumSize, 0));
		const expands = this.viewItems.map(i => Math.max(i.view.maximumSize - i.size, 0));


		const up = range(i, -1);
		const down = range(i + 1, this.viewItems.length);

		const collapsesUp = up.map(i => collapses[i]);
		const collapsesDown = down.map(i => collapses[i]);
		const expandsUp = up.map(i => expands[i]);
		const expandsDown = down.map(i => expands[i]);

		const maxUp = Math.min(sum(collapsesUp), sum(expandsDown));
		const maxDown = Math.min(sum(expandsUp), sum(collapsesDown));

		this.sashDragState = { start, sizes, up, down, maxUp, maxDown, collapses, expands };
	}

	private onSashChange({ sash, start, current }: ISashEvent): void {
		const diff = current - this.sashDragState.start;

		if (diff < 0) {
			this.expandCollapse(Math.min(-diff, this.sashDragState.maxUp), this.sashDragState.collapses, this.sashDragState.expands, this.sashDragState.up, this.sashDragState.down);
		} else {
			this.expandCollapse(Math.min(diff, this.sashDragState.maxDown), this.sashDragState.collapses, this.sashDragState.expands, this.sashDragState.down, this.sashDragState.up);
		}

		this.viewItems.forEach(viewItem => viewItem.explicitSize = viewItem.size);
	}

	private onViewChange(item: IViewItem): void {
		const size = clamp(item.size, item.view.minimumSize, item.view.maximumSize);

		if (size === item.size) {
			return;
		}

		// this could maybe use the same code than the addView() does

		// this.setupAnimation();

		const index = this.viewItems.indexOf(item);
		const diff = Math.abs(size - item.size);

		const up = range(index - 1, -1);
		const down = range(index + 1, this.viewItems.length);
		const downUp = down.concat(up);

		const collapses = this.viewItems.map(i => Math.max(i.size - i.view.minimumSize, 0));
		const expands = this.viewItems.map(i => Math.max(i.view.maximumSize - i.size, 0));


		let collapse: number, collapseIndexes: number[], expandIndexes: number[];

		if (size < item.size) {
			collapse = Math.min(downUp.reduce((t, i) => t + expands[i], 0), diff);
			collapseIndexes = [index];
			expandIndexes = downUp;

		} else {
			collapse = Math.min(downUp.reduce((t, i) => t + collapses[i], 0), diff);
			collapseIndexes = downUp;
			expandIndexes = [index];
		}

		this.expandCollapse(collapse, collapses, expands, collapseIndexes, expandIndexes);
		// this.layoutViews();
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

	// Main algorithm
	private expandCollapse(collapse: number, collapses: number[], expands: number[], collapseIndexes: number[], expandIndexes: number[]): void {
		let totalCollapse = collapse;
		let totalExpand = totalCollapse;

		collapseIndexes.forEach(i => {
			let collapse = Math.min(collapses[i], totalCollapse);
			totalCollapse -= collapse;
			this.viewItems[i].size -= collapse;
		});

		expandIndexes.forEach(i => {
			let expand = Math.min(expands[i], totalExpand);
			totalExpand -= expand;
			this.viewItems[i].size += expand;
		});

		this.viewItems.forEach(item => layoutViewItem(item, this.orientation));
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
