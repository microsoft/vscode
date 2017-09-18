/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview2';
import { IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { fromEventEmitter, mapEvent } from 'vs/base/common/event';
import types = require('vs/base/common/types');
import dom = require('vs/base/browser/dom');
import { clamp } from 'vs/base/common/numbers';
import { range, firstIndex } from 'vs/base/common/arrays';
import { Sash, Orientation, ISashEvent as IBaseSashEvent } from 'vs/base/browser/ui/sash/sash';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

export interface ISplitViewOptions {
	orientation?: Orientation; // default Orientation.VERTICAL
}

export interface IView {
	readonly minimumSize: number;
	readonly maximumSize: number;
	readonly onDidChange: Event<void>;
	render(container: HTMLElement, orientation: Orientation): void;
	layout(size: number, orientation: Orientation): void;
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
	index: number;
	start: number;
	sizes: number[];
}

function layoutViewItem(item: IViewItem, orientation: Orientation): void {
	if (orientation === Orientation.VERTICAL) {
		item.container.style.height = `${item.size}px`;
	} else {
		item.container.style.width = `${item.size}px`;
	}

	item.view.layout(item.size, orientation);
}

export class SplitView implements IDisposable {

	private orientation: Orientation;
	private el: HTMLElement;
	private size = 0;
	private viewItems: IViewItem[] = [];
	private sashItems: ISashItem[] = [];
	private sashDragState: ISashDragState;

	get length(): number {
		return this.viewItems.length;
	}

	constructor(private container: HTMLElement, options: ISplitViewOptions = {}) {
		this.orientation = types.isUndefined(options.orientation) ? Orientation.VERTICAL : options.orientation;

		this.el = document.createElement('div');
		dom.addClass(this.el, 'monaco-split-view2');
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
			const layoutProvider = this.orientation === Orientation.VERTICAL ? { getHorizontalSashTop: sash => this.getSashPosition(sash) } : { getVerticalSashLeft: sash => this.getSashPosition(sash) };
			const sash = new Sash(this.el, layoutProvider, { orientation });
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
		this.relayoutPreferredSizes();
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

		this.relayoutPreferredSizes();
	}

	moveView(from: number, to: number): void {
		if (from < 0 || from >= this.viewItems.length) {
			return;
		}

		if (to < 0 || to >= this.viewItems.length) {
			return;
		}

		if (from === to) {
			return;
		}

		const viewItem = this.viewItems.splice(from, 1)[0];
		this.viewItems.splice(to, 0, viewItem);
		this.layoutViews();
	}

	private relayoutPreferredSizes(): void {
		this.viewItems.forEach(i => i.size = clamp(i.explicitSize, i.view.minimumSize, i.view.maximumSize));
		this.relayout();
	}

	private relayout(): void {
		const previousSize = this.size;
		this.size = this.viewItems.reduce((r, i) => r + i.size, 0);
		this.layout(previousSize);
	}

	layout(size: number): void {
		this.resize(this.viewItems.length - 1, size - this.size);
		this.size = Math.max(size, this.viewItems.reduce((r, i) => r + i.size, 0));
	}

	private onSashStart({ sash, start }: ISashEvent): void {
		const index = firstIndex(this.sashItems, item => item.sash === sash);
		const sizes = this.viewItems.map(i => i.size);

		this.sashDragState = { start, index, sizes };
	}

	private onSashChange({ sash, current }: ISashEvent): void {
		const { index, start, sizes } = this.sashDragState;

		this.resize(index, current - start, sizes);
		this.viewItems.forEach(viewItem => viewItem.explicitSize = viewItem.size);
	}

	private onViewChange(item: IViewItem): void {
		item.size = clamp(item.size, item.view.minimumSize, item.view.maximumSize);
		this.relayout();
	}

	resizeView(index: number, size: number): void {
		if (index < 0 || index >= this.viewItems.length - 1) {
			throw new Error('Cant resize view');
		}

		this.resize(index, size - this.viewItems[index].size);
	}

	private resize(index: number, delta: number, sizes = this.viewItems.map(i => i.size)): void {
		if (index < 0 || index >= this.viewItems.length) {
			return;
		}

		if (delta !== 0) {
			const upIndexes = range(index, -1);
			const up = upIndexes.map(i => this.viewItems[i]);
			const upSizes = upIndexes.map(i => sizes[i]);

			const downIndexes = range(index + 1, this.viewItems.length);
			const down = downIndexes.map(i => this.viewItems[i]);
			const downSizes = downIndexes.map(i => sizes[i]);

			for (let i = 0, deltaUp = delta; deltaUp !== 0 && i < up.length; i++) {
				const item = up[i];
				const size = clamp(upSizes[i] + deltaUp, item.view.minimumSize, item.view.maximumSize);
				const viewDelta = size - upSizes[i];

				deltaUp -= viewDelta;
				item.size = size;
			}

			for (let i = 0, deltaDown = delta; deltaDown !== 0 && i < down.length; i++) {
				const item = down[i];
				const size = clamp(downSizes[i] - deltaDown, item.view.minimumSize, item.view.maximumSize);
				const viewDelta = size - downSizes[i];

				deltaDown += viewDelta;
				item.size = size;
			}
		}

		this.layoutViews();
	}

	private layoutViews(): void {
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
