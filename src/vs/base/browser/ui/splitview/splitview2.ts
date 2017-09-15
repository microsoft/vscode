/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview';
import { IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { fromEventEmitter, mapEvent } from 'vs/base/common/event';
import types = require('vs/base/common/types');
import dom = require('vs/base/browser/dom');
import { clamp } from 'vs/base/common/numbers';
import { range, firstIndex } from 'vs/base/common/arrays';
import { Sash, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider, Orientation, ISashEvent as IBaseSashEvent } from 'vs/base/browser/ui/sash/sash';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

export interface IOptions {
	orientation?: Orientation; // default Orientation.VERTICAL
}

export interface IView {
	readonly minimumSize: number;
	readonly maximumSize: number;
	readonly onDidChange: Event<void>;
	render(container: HTMLElement, orientation: Orientation): void;
	layout(size: number, orientation: Orientation): void;
	focus(): void;
}

interface ISashEvent {
	sash: Sash;
	start: number;
	current: number;
}

interface IViewItem {
	view: IView;
	size: number;
	explicitSize: number;
	container: HTMLElement;
	disposable: IDisposable;
}

interface ISashItem {
	sash: Sash;
	disposable: IDisposable;
}

interface ISashDragState {
	start: number;
	up: number[];
	down: number[];
	maxUp: number;
	maxDown: number;
	collapses: number[];
	expands: number[];
}

const sum = (a: number[]) => a.reduce((a, b) => a + b, 0);

function layoutViewItem(item: IViewItem, orientation: Orientation): void {
	if (orientation === Orientation.VERTICAL) {
		item.container.style.height = `${item.size}px`;
	} else {
		item.container.style.width = `${item.size}px`;
	}

	item.view.layout(item.size, orientation);
}

export class SplitView implements IDisposable, IHorizontalSashLayoutProvider, IVerticalSashLayoutProvider {

	private orientation: Orientation;
	private el: HTMLElement;
	private size = 0;
	private viewItems: IViewItem[] = [];
	private sashItems: ISashItem[] = [];
	private sashDragState: ISashDragState;

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
	}

	addView(view: IView, size: number, index = this.viewItems.length): void {
		// Add view
		const container = dom.$('.split-view-view');

		if (this.viewItems.length === 1) {
			this.el.appendChild(container);
		} else {
			this.el.insertBefore(container, this.el.children.item(index));
		}

		const onChangeDisposable = mapEvent(view.onDidChange, () => item)(this.onViewChange, this);
		const containerDisposable = toDisposable(() => this.el.removeChild(container));
		const disposable = combinedDisposable([onChangeDisposable, containerDisposable]);

		const explicitSize = size;
		const item: IViewItem = { view, container, explicitSize, size, disposable };
		this.viewItems.splice(index, 0, item);

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

		view.render(container, this.orientation);
		this.relayout();
	}

	removeView(index: number): void {
		if (index < 0 || index >= this.viewItems.length) {
			return;
		}

		// Remove view
		const viewItem = this.viewItems.splice(index, 1)[0];
		viewItem.disposable.dispose();

		// Remove sash
		if (this.viewItems.length >= 1) {
			const sashIndex = Math.max(index - 1, 0);
			const sashItem = this.sashItems.splice(sashIndex, 1)[0];
			sashItem.disposable.dispose();
		}

		this.relayout();
	}

	private relayout(): void {
		this.viewItems.forEach(i => i.size = clamp(i.explicitSize, i.view.minimumSize, i.view.maximumSize));

		const previousSize = this.size;
		this.size = this.viewItems.reduce((r, i) => r + i.size, 0);
		this.layout(previousSize);
	}

	layout(size: number): void {
		if (this.size === size) {
			return;
		}

		const indexes = range(this.viewItems.length - 1, -1);
		const collapses = this.viewItems.map(i => Math.max(i.size - i.view.minimumSize, 0));
		const expands = this.viewItems.map(i => Math.max(i.view.maximumSize - i.size, 0));
		const totalViewsSize = this.viewItems.reduce((r, i) => r + i.size, 0);
		const diff = Math.abs(totalViewsSize - size);

		if (size < totalViewsSize) {
			this.expandCollapse(Math.min(diff, sum(collapses)), collapses, expands, indexes, []);
		} else if (size > totalViewsSize) {
			this.expandCollapse(Math.min(diff, sum(expands)), collapses, expands, [], indexes);
		}

		this.size = size;
	}

	private onSashStart({ sash, start }: ISashEvent): void {
		const index = firstIndex(this.sashItems, item => item.sash === sash);
		const collapses = this.viewItems.map(i => Math.max(i.size - i.view.minimumSize, 0));
		const expands = this.viewItems.map(i => Math.max(i.view.maximumSize - i.size, 0));

		const up = range(index, -1);
		const down = range(index + 1, this.viewItems.length);

		const collapsesUp = up.map(i => collapses[i]);
		const collapsesDown = down.map(i => collapses[i]);
		const expandsUp = up.map(i => expands[i]);
		const expandsDown = down.map(i => expands[i]);

		const maxUp = Math.min(sum(collapsesUp), sum(expandsDown));
		const maxDown = Math.min(sum(expandsUp), sum(collapsesDown));

		this.sashDragState = { start, up, down, maxUp, maxDown, collapses, expands };
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

	resizeView(index: number, size: number): void {
		if (index < 0 || index >= this.viewItems.length) {
			return;
		}

		const viewItem = this.viewItems[index];
		size = clamp(size, viewItem.view.minimumSize, viewItem.view.maximumSize);

		const collapses = this.viewItems.map(i => Math.max(i.size - i.view.minimumSize, 0));
		const expands = this.viewItems.map(i => Math.max(i.view.maximumSize - i.size, 0));
		const up = range(index, -1);
		const down = range(index + 1, this.viewItems.length);
		const collapsesUp = up.map(i => collapses[i]);
		const collapsesDown = down.map(i => collapses[i]);
		const expandsUp = up.map(i => expands[i]);
		const expandsDown = down.map(i => expands[i]);
		const maxUp = Math.min(sum(collapsesUp), sum(expandsDown));
		const maxDown = Math.min(sum(expandsUp), sum(collapsesDown));
		const diff = size - viewItem.size;

		if (diff < 0) {
			this.expandCollapse(Math.min(-diff, maxUp), collapses, expands, up, down);
		} else {
			this.expandCollapse(Math.min(diff, maxDown), collapses, expands, down, up);
		}
	}

	private onViewChange(item: IViewItem): void {
		const size = clamp(item.size, item.view.minimumSize, item.view.maximumSize);

		if (size === item.size) {
			return;
		}

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
		let previous = false;
		const collapsesDown = this.viewItems.map(i => previous = (i.size - i.view.minimumSize > 0) || previous);

		previous = false;
		const expandsDown = this.viewItems.map(i => previous = (i.view.maximumSize - i.size > 0) || previous);

		const reverseViews = [...this.viewItems].reverse();
		previous = false;
		const collapsesUp = reverseViews.map(i => previous = (i.size - i.view.minimumSize > 0) || previous).reverse();

		previous = false;
		const expandsUp = reverseViews.map(i => previous = (i.view.maximumSize - i.size > 0) || previous).reverse();

		this.sashItems.forEach((s, i) => {
			if ((collapsesDown[i] && expandsUp[i + 1]) || (expandsDown[i] && collapsesUp[i + 1])) {
				s.sash.enable();
			} else {
				s.sash.disable();
			}
		});
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
		this.viewItems.forEach(i => i.disposable.dispose());
		this.viewItems = [];

		this.sashItems.forEach(i => i.disposable.dispose());
		this.sashItems = [];
	}
}
