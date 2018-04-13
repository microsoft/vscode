/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { ViewsRegistry, IViewDescriptor, ViewLocation } from 'vs/workbench/common/views';
import { IContextKeyService, IContextKeyChangeEvent, IReadableSet } from 'vs/platform/contextkey/common/contextkey';
import { Event, chain, filterEvent, Emitter } from 'vs/base/common/event';
import { binarySearch, findFirst } from 'vs/base/common/arrays';
import { ISplice } from 'vs/base/common/sequence';

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

export interface IView {
	collapsed: boolean;
}

export interface IViewItem {
	viewDescriptor: IViewDescriptor;
	visible: boolean;
}

function compareViewDescriptors(a: IViewDescriptor, b: IViewDescriptor): number {
	if (typeof a.order !== 'number') {
		return 1;
	} else if (typeof b.order !== 'number') {
		return -1;
	}

	return a.order - b.order;
}

function compareViewItems(a: IViewItem, b: IViewItem): number {
	return compareViewDescriptors(a.viewDescriptor, b.viewDescriptor);
}

export class ContributableViews {

	private contextKeys = new CounterSet<string>();
	private items: IViewItem[] = [];
	private disposables: IDisposable[] = [];

	private _onDidSplice = new Emitter<ISplice<IViewDescriptor>>();
	readonly onDidSplice: Event<ISplice<IViewDescriptor>> = this._onDidSplice.event;

	get viewDescriptors(): IViewDescriptor[] {
		return this.items
			.filter(i => i.visible)
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
		for (const viewDescriptor of viewDescriptors) {
			const item = {
				viewDescriptor,
				visible: this.canViewDescriptorBeVisible(viewDescriptor) // TODO: should read from some state?
			};

			let index = binarySearch(this.items, item, compareViewItems);

			// insert this new view descriptor at the end of same order view descriptors
			if (index < 0) {
				index = ~index;

				while (index < this.items.length && compareViewItems(this.items[index], item) === 0) {
					index++;
				}
			}

			this.items.splice(index, 0, item);

			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.add(key);
				}
			}

			if (item.visible) {
				this._onDidSplice.fire({ start: index, deleteCount: 0, toInsert: [viewDescriptor] });
			}
		}
	}

	private onViewsDeregistered(viewDescriptors: IViewDescriptor[]): any {
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

			if (item.visible) {
				this._onDidSplice.fire({ start: index, deleteCount: 1, toInsert: [] });
			}
		}
	}

	private onContextChanged(event: IContextKeyChangeEvent): any {
		let index = 0;

		for (const item of this.items) {
			const visible = this.canViewDescriptorBeVisible(item.viewDescriptor);

			if (item.visible === visible) {
				if (visible) {
					index++;
				}

				continue;
			}

			if (visible) { // show
				this._onDidSplice.fire({ start: index, deleteCount: 0, toInsert: [item.viewDescriptor] });
				index++;
			} else { // hide
				this._onDidSplice.fire({ start: index, deleteCount: 1, toInsert: [] });
			}

			item.visible = visible;
		}
	}

	private canViewDescriptorBeVisible(viewDescriptor: IViewDescriptor): boolean {
		return this.contextKeyService.contextMatchesRules(viewDescriptor.when);
	}
}