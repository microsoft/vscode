/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { ViewsRegistry, IViewDescriptor, ViewLocation } from 'vs/workbench/common/views';
import { IContextKeyService, IContextKeyChangeEvent, IReadableSet } from 'vs/platform/contextkey/common/contextkey';
import { Event, chain, filterEvent, Emitter } from 'vs/base/common/event';
import { sortedDiff, firstIndex, move } from 'vs/base/common/arrays';

function filterViewEvent(location: ViewLocation, event: Event<IViewDescriptor[]>): Event<IViewDescriptor[]> {
	return chain(event)
		.map(views => views.filter(view => view.location === location))
		.filter(views => views.length > 0)
		.event;
}

class CounterSet<T> implements IReadableSet<T> {

	private map = new Map<T, number>();

	add(value: T): CounterSet<T> {
		this.map.set(value, (this.map.get(value) || 0) + 1);
		return this;
	}

	delete(value: T): boolean {
		let counter = this.map.get(value) || 0;

		if (counter === 0) {
			return false;
		}

		counter--;

		if (counter === 0) {
			this.map.delete(value);
		} else {
			this.map.set(value, counter);
		}

		return true;
	}

	has(value: T): boolean {
		return this.map.has(value);
	}
}

export interface IViewItem {
	viewDescriptor: IViewDescriptor;
	active: boolean;
}

class ViewDescriptorCollection {

	private contextKeys = new CounterSet<string>();
	private items: IViewItem[] = [];
	private disposables: IDisposable[] = [];

	private _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	get viewDescriptors(): IViewDescriptor[] {
		return this.items
			.filter(i => i.active)
			.map(i => i.viewDescriptor);
	}

	constructor(
		location: ViewLocation,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		const onRelevantViewsRegistered = filterViewEvent(location, ViewsRegistry.onViewsRegistered);
		onRelevantViewsRegistered(this.onViewsRegistered, this, this.disposables);

		const onRelevantViewsDeregistered = filterViewEvent(location, ViewsRegistry.onViewsDeregistered);
		onRelevantViewsDeregistered(this.onViewsDeregistered, this, this.disposables);

		const onRelevantContextChange = filterEvent(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys));
		onRelevantContextChange(this.onContextChanged, this);

		this.onViewsRegistered(ViewsRegistry.getViews(location));
	}

	private onViewsRegistered(viewDescriptors: IViewDescriptor[]): any {
		let fireChangeEvent = false;

		for (const viewDescriptor of viewDescriptors) {
			const item = {
				viewDescriptor,
				active: this.isViewDescriptorActive(viewDescriptor) // TODO: should read from some state?
			};

			this.items.push(item);

			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.add(key);
				}
			}

			if (item.active) {
				fireChangeEvent = true;
			}
		}

		if (fireChangeEvent) {
			this._onDidChange.fire();
		}
	}

	private onViewsDeregistered(viewDescriptors: IViewDescriptor[]): any {
		let fireChangeEvent = false;

		for (const viewDescriptor of viewDescriptors) {
			const index = firstIndex(this.items, i => i.viewDescriptor.id === viewDescriptor.id);

			if (index === -1) {
				continue;
			}

			const item = this.items[index];
			this.items.splice(index, 1);

			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.delete(key);
				}
			}

			if (item.active) {
				fireChangeEvent = true;
			}
		}

		if (fireChangeEvent) {
			this._onDidChange.fire();
		}
	}

	private onContextChanged(event: IContextKeyChangeEvent): any {
		let fireChangeEvent = false;

		for (const item of this.items) {
			const active = this.isViewDescriptorActive(item.viewDescriptor);

			if (item.active !== active) {
				fireChangeEvent = true;
			}

			item.active = active;
		}

		if (fireChangeEvent) {
			this._onDidChange.fire();
		}
	}

	private isViewDescriptorActive(viewDescriptor: IViewDescriptor): boolean {
		return !viewDescriptor.when || this.contextKeyService.contextMatchesRules(viewDescriptor.when);
	}
}

export interface IView {
	viewDescriptor: IViewDescriptor;
	visible: boolean;
}

interface IViewState {
	visible: boolean;
	order?: number;
}

export interface IViewDescriptorRef {
	viewDescriptor: IViewDescriptor;
	index: number;
}

export class ContributableViewsModel {

	private viewStates = new Map<string, IViewState>();

	readonly viewDescriptors: IViewDescriptor[] = [];
	get visibleViewDescriptors(): IViewDescriptor[] {
		return this.viewDescriptors.filter(v => this.viewStates.get(v.id).visible);
	}

	private _onDidAdd = new Emitter<IViewDescriptorRef>();
	readonly onDidAdd: Event<IViewDescriptorRef> = this._onDidAdd.event;

	private _onDidRemove = new Emitter<IViewDescriptorRef>();
	readonly onDidRemove: Event<IViewDescriptorRef> = this._onDidRemove.event;

	private _onDidMove = new Emitter<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }>();
	readonly onDidMove: Event<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }> = this._onDidMove.event;

	private disposables: IDisposable[] = [];

	constructor(
		location: ViewLocation,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		const viewDescriptorCollection = new ViewDescriptorCollection(location, contextKeyService);

		viewDescriptorCollection.onDidChange(() => this.onDidChangeViewDescriptors(viewDescriptorCollection.viewDescriptors), this, this.disposables);
		this.onDidChangeViewDescriptors(viewDescriptorCollection.viewDescriptors);
	}

	setVisible(id: string, visible: boolean): void {
		const { visibleIndex, viewDescriptor, state } = this.find(id);

		if (!viewDescriptor.canToggleVisibility) {
			throw new Error('Can\'t toggle this view\'s visibility');
		}

		if (state.visible === visible) {
			return;
		}

		state.visible = visible;

		if (visible) {
			this._onDidAdd.fire({ index: visibleIndex, viewDescriptor });
		} else {
			this._onDidRemove.fire({ index: visibleIndex, viewDescriptor });
		}
	}

	move(from: string, to: string): void {
		const fromIndex = firstIndex(this.viewDescriptors, v => v.id === from);
		const toIndex = firstIndex(this.viewDescriptors, v => v.id === to);

		const fromViewDescriptor = this.viewDescriptors[fromIndex];
		const toViewDescriptor = this.viewDescriptors[toIndex];

		move(this.viewDescriptors, fromIndex, toIndex);

		for (let index = 0; index < this.viewDescriptors.length; index++) {
			const state = this.viewStates.get(this.viewDescriptors[index].id);
			state.order = index;
		}

		this._onDidMove.fire({
			from: { index: fromIndex, viewDescriptor: fromViewDescriptor },
			to: { index: toIndex, viewDescriptor: toViewDescriptor }
		});
	}

	private find(id: string): { index: number, visibleIndex: number, viewDescriptor: IViewDescriptor, state: IViewState } {
		for (let i = 0, visibleIndex = 0; i < this.viewDescriptors.length; i++) {
			const viewDescriptor = this.viewDescriptors[i];
			const state = this.viewStates.get(viewDescriptor.id);

			if (viewDescriptor.id === id) {
				return { index: i, visibleIndex, viewDescriptor, state };
			}

			if (state.visible) {
				visibleIndex++;
			}
		}

		throw new Error(`view descriptor ${id} not found`);
	}

	private compareViewDescriptors(a: IViewDescriptor, b: IViewDescriptor): number {
		const viewStateA = this.viewStates.get(a.id);
		const viewStateB = this.viewStates.get(b.id);

		let orderA = viewStateA && viewStateA.order;
		orderA = typeof orderA === 'number' ? orderA : a.order;
		orderA = typeof orderA === 'number' ? orderA : Number.POSITIVE_INFINITY;

		let orderB = viewStateB && viewStateB.order;
		orderB = typeof orderB === 'number' ? orderB : b.order;
		orderB = typeof orderB === 'number' ? orderB : Number.POSITIVE_INFINITY;

		if (orderA !== orderB) {
			return orderA - orderB;
		}

		if (a.id === b.id) {
			return 0;
		}

		return a.id < b.id ? -1 : 1;
	}

	private onDidChangeViewDescriptors(viewDescriptors: IViewDescriptor[]): void {
		const ids = new Set<string>();

		for (const viewDescriptor of this.viewDescriptors) {
			ids.add(viewDescriptor.id);
		}

		viewDescriptors = viewDescriptors.sort(this.compareViewDescriptors.bind(this));

		for (const viewDescriptor of viewDescriptors) {
			if (!this.viewStates.has(viewDescriptor.id)) {
				this.viewStates.set(viewDescriptor.id, {
					visible: true // viewDescriptor.canToggleVisibility
				});
			}
		}

		const splices = sortedDiff<IViewDescriptor>(
			this.viewDescriptors,
			viewDescriptors,
			this.compareViewDescriptors.bind(this)
		).reverse();

		for (const splice of splices) {
			const startViewDescriptor = this.viewDescriptors[splice.start];
			let startIndex = startViewDescriptor ? this.find(startViewDescriptor.id).visibleIndex : 0;

			for (let i = 0; i < splice.deleteCount; i++) {
				const viewDescriptor = this.viewDescriptors[splice.start + i];
				const { state } = this.find(viewDescriptor.id);

				if (state.visible) {
					this._onDidRemove.fire({ index: startIndex, viewDescriptor: viewDescriptor });
				}
			}

			for (let i = 0; i < splice.toInsert.length; i++) {
				const viewDescriptor = splice.toInsert[i];
				const state = this.viewStates.get(viewDescriptor.id);

				if (state.visible) {
					this._onDidAdd.fire({ index: startIndex++, viewDescriptor: viewDescriptor });
				}
			}
		}

		this.viewDescriptors.splice(0, this.viewDescriptors.length, ...viewDescriptors);
	}
}