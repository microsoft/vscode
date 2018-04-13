/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { ViewsRegistry, IViewDescriptor, ViewLocation } from 'vs/workbench/common/views';
import { IContextKeyService, IContextKeyChangeEvent, IReadableSet } from 'vs/platform/contextkey/common/contextkey';
import { Event, chain, filterEvent, Emitter } from 'vs/base/common/event';
import { findFirst, sortedDiff } from 'vs/base/common/arrays';
import { ISequence, ISplice } from 'vs/base/common/sequence';

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
			const index = findFirst(this.items, i => i.viewDescriptor.id === viewDescriptor.id);

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
			const visible = this.isViewDescriptorActive(item.viewDescriptor);

			if (item.active !== visible) {
				fireChangeEvent = true;
			}

			item.active = visible;
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

export class ContributableViews implements ISequence<IViewDescriptor>{

	private viewDescriptorCollection: ViewDescriptorCollection;
	private viewsStates = new Map<string, IViewState>();

	// ISequence
	elements: IViewDescriptor[] = [];
	private _onDidSplice = new Emitter<ISplice<IViewDescriptor>>();
	readonly onDidSplice: Event<ISplice<IViewDescriptor>> = this._onDidSplice.event;

	private disposables: IDisposable[] = [];

	constructor(
		location: ViewLocation,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.viewDescriptorCollection = new ViewDescriptorCollection(location, contextKeyService);

		this.viewDescriptorCollection.onDidChange(this.onDidChangeViewDescriptors, this, this.disposables);
		this.onDidChangeViewDescriptors();
	}

	private compareViewDescriptors(a: IViewDescriptor, b: IViewDescriptor): number {
		const viewStateA = this.viewsStates.get(a.id);
		const viewStateB = this.viewsStates.get(b.id);
		const orderA = viewStateA ? viewStateA.order : a.order;
		const orderB = viewStateB ? viewStateB.order : b.order;

		if (orderB === void 0 || orderB === null) {
			return -1;
		}

		if (orderA === void 0 || orderA === null) {
			return 1;
		}

		return orderA - orderB;
	}

	private onDidChangeViewDescriptors(): void {
		const compareFn = (a, b) => this.compareViewDescriptors(a, b);
		const sortedViewDescriptors = this.viewDescriptorCollection.viewDescriptors.sort(compareFn);

		const elements: IViewDescriptor[] = [];

		for (const viewDescriptor of sortedViewDescriptors) {
			const state = this.viewsStates.get(viewDescriptor.id);

			if (!state || state.visible) {
				elements.push(viewDescriptor);
			}
		}

		const splices = sortedDiff<IViewDescriptor>(this.elements, elements, compareFn);

		for (const splice of splices) {
			this._onDidSplice.fire(splice);
		}

		this.elements = elements;
	}

	setVisible(id: string, visible: boolean): void {

	}

	move(from: string, to: string): void {
		// reset ORDERS for all view states
	}
}