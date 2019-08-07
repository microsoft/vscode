/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Assert from 'vs/base/common/assert';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { INavigator } from 'vs/base/common/iterator';
import * as _ from './tree';
import { Event, Emitter, EventMultiplexer, Relay } from 'vs/base/common/event';

interface IMap<T> { [id: string]: T; }
interface IItemMap extends IMap<Item> { }
interface ITraitMap extends IMap<IItemMap> { }

export class LockData {

	private _item: Item;
	private _onDispose?= new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose!.event;

	constructor(item: Item) {
		this._item = item;
	}

	get item(): Item {
		return this._item;
	}

	dispose(): void {
		if (this._onDispose) {
			this._onDispose.fire();
			this._onDispose.dispose();
			this._onDispose = undefined;
		}
	}
}

export class Lock {

	/* When refreshing tree items, the tree's structured can be altered, by
		inserting and removing sub-items. This lock helps to manage several
		possibly-structure-changing calls.

		API-wise, there are two possibly-structure-changing: refresh(...),
		expand(...) and collapse(...). All these calls must call Lock#run(...).

		Any call to Lock#run(...) needs to provide the affecting item and a
		callback to execute when unlocked. It must also return a promise
		which fulfills once the operation ends. Once it is called, there
		are three possibilities:

		- Nothing is currently running. The affecting item is remembered, and
		the callback is executed.

		- Or, there are on-going operations. There are two outcomes:

			- The affecting item intersects with any other affecting items
			of on-going run calls. In such a case, the given callback should
			be executed only when the on-going one completes.

			- Or, it doesn't. In such a case, both operations can be run in
			parallel.

		Note: two items A and B intersect if A is a descendant of B, or
		vice-versa.
	*/

	private locks: { [id: string]: LockData; };

	constructor() {
		this.locks = Object.create({});
	}

	public isLocked(item: Item): boolean {
		return !!this.locks[item.id];
	}

	public run(item: Item, fn: () => Promise<any>): Promise<any> {
		const lock = this.getLock(item);

		if (lock) {
			return new Promise((c, e) => {
				Event.once(lock.onDispose)(() => {
					return this.run(item, fn).then(c, e);
				});
			});
		}

		let result: Promise<any>;

		return new Promise((c, e) => {

			if (item.isDisposed()) {
				return e(new Error('Item is disposed.'));
			}

			let lock = this.locks[item.id] = new LockData(item);

			result = fn().then((r) => {
				delete this.locks[item.id];
				lock.dispose();

				return r;
			}).then(c, e);

			return result;
		});
	}

	private getLock(item: Item): LockData | null {
		let key: string;

		for (key in this.locks) {
			let lock = this.locks[key];

			if (item.intersects(lock.item)) {
				return lock;
			}
		}

		return null;
	}
}

export class ItemRegistry {

	private _isDisposed = false;
	private items: IMap<{ item: Item; disposable: IDisposable; }>;

	private _onDidRevealItem = new EventMultiplexer<IItemRevealEvent>();
	readonly onDidRevealItem: Event<IItemRevealEvent> = this._onDidRevealItem.event;
	private _onExpandItem = new EventMultiplexer<IItemExpandEvent>();
	readonly onExpandItem: Event<IItemExpandEvent> = this._onExpandItem.event;
	private _onDidExpandItem = new EventMultiplexer<IItemExpandEvent>();
	readonly onDidExpandItem: Event<IItemExpandEvent> = this._onDidExpandItem.event;
	private _onCollapseItem = new EventMultiplexer<IItemCollapseEvent>();
	readonly onCollapseItem: Event<IItemCollapseEvent> = this._onCollapseItem.event;
	private _onDidCollapseItem = new EventMultiplexer<IItemCollapseEvent>();
	readonly onDidCollapseItem: Event<IItemCollapseEvent> = this._onDidCollapseItem.event;
	private _onDidAddTraitItem = new EventMultiplexer<IItemTraitEvent>();
	readonly onDidAddTraitItem: Event<IItemTraitEvent> = this._onDidAddTraitItem.event;
	private _onDidRemoveTraitItem = new EventMultiplexer<IItemCollapseEvent>();
	readonly onDidRemoveTraitItem: Event<IItemCollapseEvent> = this._onDidRemoveTraitItem.event;
	private _onDidRefreshItem = new EventMultiplexer<Item>();
	readonly onDidRefreshItem: Event<Item> = this._onDidRefreshItem.event;
	private _onRefreshItemChildren = new EventMultiplexer<IItemChildrenRefreshEvent>();
	readonly onRefreshItemChildren: Event<IItemChildrenRefreshEvent> = this._onRefreshItemChildren.event;
	private _onDidRefreshItemChildren = new EventMultiplexer<IItemChildrenRefreshEvent>();
	readonly onDidRefreshItemChildren: Event<IItemChildrenRefreshEvent> = this._onDidRefreshItemChildren.event;
	private _onDidDisposeItem = new EventMultiplexer<Item>();
	readonly onDidDisposeItem: Event<Item> = this._onDidDisposeItem.event;

	constructor() {
		this.items = {};
	}

	public register(item: Item): void {
		Assert.ok(!this.isRegistered(item.id), 'item already registered: ' + item.id);

		const disposable = combinedDisposable(
			this._onDidRevealItem.add(item.onDidReveal),
			this._onExpandItem.add(item.onExpand),
			this._onDidExpandItem.add(item.onDidExpand),
			this._onCollapseItem.add(item.onCollapse),
			this._onDidCollapseItem.add(item.onDidCollapse),
			this._onDidAddTraitItem.add(item.onDidAddTrait),
			this._onDidRemoveTraitItem.add(item.onDidRemoveTrait),
			this._onDidRefreshItem.add(item.onDidRefresh),
			this._onRefreshItemChildren.add(item.onRefreshChildren),
			this._onDidRefreshItemChildren.add(item.onDidRefreshChildren),
			this._onDidDisposeItem.add(item.onDidDispose)
		);

		this.items[item.id] = { item, disposable };
	}

	public deregister(item: Item): void {
		Assert.ok(this.isRegistered(item.id), 'item not registered: ' + item.id);
		this.items[item.id].disposable.dispose();
		delete this.items[item.id];
	}

	public isRegistered(id: string): boolean {
		return this.items.hasOwnProperty(id);
	}

	public getItem(id: string): Item | null {
		const result = this.items[id];
		return result ? result.item : null;
	}

	public dispose(): void {
		this.items = null!; // StrictNullOverride: nulling out ok in dispose

		this._onDidRevealItem.dispose();
		this._onExpandItem.dispose();
		this._onDidExpandItem.dispose();
		this._onCollapseItem.dispose();
		this._onDidCollapseItem.dispose();
		this._onDidAddTraitItem.dispose();
		this._onDidRemoveTraitItem.dispose();
		this._onDidRefreshItem.dispose();
		this._onRefreshItemChildren.dispose();
		this._onDidRefreshItemChildren.dispose();

		this._isDisposed = true;
	}

	public isDisposed(): boolean {
		return this._isDisposed;
	}
}

export interface IBaseItemEvent {
	item: Item;
}

export interface IItemRefreshEvent extends IBaseItemEvent { }
export interface IItemExpandEvent extends IBaseItemEvent { }
export interface IItemCollapseEvent extends IBaseItemEvent { }

export interface IItemTraitEvent extends IBaseItemEvent {
	trait: string;
}

export interface IItemRevealEvent extends IBaseItemEvent {
	relativeTop: number | null;
}

export interface IItemChildrenRefreshEvent extends IBaseItemEvent {
	isNested: boolean;
}

export class Item {

	private registry: ItemRegistry;
	private context: _.ITreeContext;
	private element: any;
	private lock: Lock;

	public id: string;

	private needsChildrenRefresh: boolean;
	private doesHaveChildren: boolean;

	public parent: Item | null;
	public previous: Item | null;
	public next: Item | null;
	public firstChild: Item | null;
	public lastChild: Item | null;

	private height: number;
	private depth: number;

	private visible: boolean;
	private expanded: boolean;

	private traits: { [trait: string]: boolean; };

	private _onDidCreate = new Emitter<Item>();
	readonly onDidCreate: Event<Item> = this._onDidCreate.event;
	private _onDidReveal = new Emitter<IItemRevealEvent>();
	readonly onDidReveal: Event<IItemRevealEvent> = this._onDidReveal.event;
	private _onExpand = new Emitter<IItemExpandEvent>();
	readonly onExpand: Event<IItemExpandEvent> = this._onExpand.event;
	private _onDidExpand = new Emitter<IItemExpandEvent>();
	readonly onDidExpand: Event<IItemExpandEvent> = this._onDidExpand.event;
	private _onCollapse = new Emitter<IItemCollapseEvent>();
	readonly onCollapse: Event<IItemCollapseEvent> = this._onCollapse.event;
	private _onDidCollapse = new Emitter<IItemCollapseEvent>();
	readonly onDidCollapse: Event<IItemCollapseEvent> = this._onDidCollapse.event;
	private _onDidAddTrait = new Emitter<IItemTraitEvent>();
	readonly onDidAddTrait: Event<IItemTraitEvent> = this._onDidAddTrait.event;
	private _onDidRemoveTrait = new Emitter<IItemCollapseEvent>();
	readonly onDidRemoveTrait: Event<IItemCollapseEvent> = this._onDidRemoveTrait.event;
	private _onDidRefresh = new Emitter<Item>();
	readonly onDidRefresh: Event<Item> = this._onDidRefresh.event;
	private _onRefreshChildren = new Emitter<IItemChildrenRefreshEvent>();
	readonly onRefreshChildren: Event<IItemChildrenRefreshEvent> = this._onRefreshChildren.event;
	private _onDidRefreshChildren = new Emitter<IItemChildrenRefreshEvent>();
	readonly onDidRefreshChildren: Event<IItemChildrenRefreshEvent> = this._onDidRefreshChildren.event;
	private _onDidDispose = new Emitter<Item>();
	readonly onDidDispose: Event<Item> = this._onDidDispose.event;

	private _isDisposed: boolean;

	constructor(id: string, registry: ItemRegistry, context: _.ITreeContext, lock: Lock, element: any) {
		this.registry = registry;
		this.context = context;
		this.lock = lock;
		this.element = element;

		this.id = id;
		this.registry.register(this);

		this.doesHaveChildren = this.context.dataSource.hasChildren(this.context.tree, this.element);
		this.needsChildrenRefresh = true;

		this.parent = null;
		this.previous = null;
		this.next = null;
		this.firstChild = null;
		this.lastChild = null;

		this.traits = {};
		this.depth = 0;
		this.expanded = !!(this.context.dataSource.shouldAutoexpand && this.context.dataSource.shouldAutoexpand(this.context.tree, element));

		this._onDidCreate.fire(this);

		this.visible = this._isVisible();
		this.height = this._getHeight();

		this._isDisposed = false;
	}

	public getElement(): any {
		return this.element;
	}

	public hasChildren(): boolean {
		return this.doesHaveChildren;
	}

	public getDepth(): number {
		return this.depth;
	}

	public isVisible(): boolean {
		return this.visible;
	}

	public setVisible(value: boolean): void {
		this.visible = value;
	}

	public isExpanded(): boolean {
		return this.expanded;
	}

	/* protected */ public _setExpanded(value: boolean): void {
		this.expanded = value;
	}

	public reveal(relativeTop: number | null = null): void {
		let eventData: IItemRevealEvent = { item: this, relativeTop: relativeTop };
		this._onDidReveal.fire(eventData);
	}

	public expand(): Promise<any> {
		if (this.isExpanded() || !this.doesHaveChildren || this.lock.isLocked(this)) {
			return Promise.resolve(false);
		}

		let result = this.lock.run(this, () => {
			if (this.isExpanded() || !this.doesHaveChildren) {
				return Promise.resolve(false);
			}

			let eventData: IItemExpandEvent = { item: this };
			let result: Promise<any>;
			this._onExpand.fire(eventData);

			if (this.needsChildrenRefresh) {
				result = this.refreshChildren(false, true, true);
			} else {
				result = Promise.resolve(null);
			}

			return result.then(() => {
				this._setExpanded(true);
				this._onDidExpand.fire(eventData);
				return true;
			});
		});

		return result.then((r) => {
			if (this.isDisposed()) {
				return false;
			}

			// Auto expand single child folders
			if (this.context.options.autoExpandSingleChildren && r && this.firstChild !== null && this.firstChild === this.lastChild && this.firstChild.isVisible()) {
				return this.firstChild.expand().then(() => { return true; });
			}

			return r;
		});
	}

	public collapse(recursive: boolean = false): Promise<any> {
		if (recursive) {
			let collapseChildrenPromise = Promise.resolve(null);
			this.forEachChild((child) => {
				collapseChildrenPromise = collapseChildrenPromise.then(() => child.collapse(true));
			});
			return collapseChildrenPromise.then(() => {
				return this.collapse(false);
			});
		} else {
			if (!this.isExpanded() || this.lock.isLocked(this)) {
				return Promise.resolve(false);
			}

			return this.lock.run(this, () => {
				let eventData: IItemCollapseEvent = { item: this };
				this._onCollapse.fire(eventData);
				this._setExpanded(false);
				this._onDidCollapse.fire(eventData);

				return Promise.resolve(true);
			});
		}
	}

	public addTrait(trait: string): void {
		let eventData: IItemTraitEvent = { item: this, trait: trait };
		this.traits[trait] = true;
		this._onDidAddTrait.fire(eventData);
	}

	public removeTrait(trait: string): void {
		let eventData: IItemTraitEvent = { item: this, trait: trait };
		delete this.traits[trait];
		this._onDidRemoveTrait.fire(eventData);
	}

	public hasTrait(trait: string): boolean {
		return this.traits[trait] || false;
	}

	public getAllTraits(): string[] {
		let result: string[] = [];
		let trait: string;
		for (trait in this.traits) {
			if (this.traits.hasOwnProperty(trait) && this.traits[trait]) {
				result.push(trait);
			}
		}
		return result;
	}

	public getHeight(): number {
		return this.height;
	}

	private refreshChildren(recursive: boolean, safe: boolean = false, force: boolean = false): Promise<any> {
		if (!force && !this.isExpanded()) {
			const setNeedsChildrenRefresh = (item: Item) => {
				item.needsChildrenRefresh = true;
				item.forEachChild(setNeedsChildrenRefresh);
			};

			setNeedsChildrenRefresh(this);

			return Promise.resolve(this);
		}

		this.needsChildrenRefresh = false;

		let doRefresh = () => {
			let eventData: IItemChildrenRefreshEvent = { item: this, isNested: safe };
			this._onRefreshChildren.fire(eventData);

			let childrenPromise: Promise<any>;
			if (this.doesHaveChildren) {
				childrenPromise = this.context.dataSource.getChildren(this.context.tree, this.element);
			} else {
				childrenPromise = Promise.resolve([]);
			}

			const result = childrenPromise.then((elements: any[]) => {
				if (this.isDisposed() || this.registry.isDisposed()) {
					return Promise.resolve(null);
				}

				if (!Array.isArray(elements)) {
					return Promise.reject(new Error('Please return an array of children.'));
				}

				elements = !elements ? [] : elements.slice(0);
				elements = this.sort(elements);

				let staleItems: IItemMap = {};
				while (this.firstChild !== null) {
					staleItems[this.firstChild.id] = this.firstChild;
					this.removeChild(this.firstChild);
				}

				for (let i = 0, len = elements.length; i < len; i++) {
					let element = elements[i];
					let id = this.context.dataSource.getId(this.context.tree, element);
					let item = staleItems[id] || new Item(id, this.registry, this.context, this.lock, element);
					item.element = element;
					if (recursive) {
						item.needsChildrenRefresh = recursive;
					}
					delete staleItems[id];
					this.addChild(item);
				}

				for (let staleItemId in staleItems) {
					if (staleItems.hasOwnProperty(staleItemId)) {
						staleItems[staleItemId].dispose();
					}
				}

				if (recursive) {
					return Promise.all(this.mapEachChild((child) => {
						return child.doRefresh(recursive, true);
					}));
				} else {
					return Promise.all(this.mapEachChild((child) => {
						if (child.isExpanded() && child.needsChildrenRefresh) {
							return child.doRefresh(recursive, true);
						} else {
							child.updateVisibility();
							return Promise.resolve(null);
						}
					}));
				}
			});

			return result
				.then(undefined, onUnexpectedError)
				.then(() => this._onDidRefreshChildren.fire(eventData));
		};

		return safe ? doRefresh() : this.lock.run(this, doRefresh);
	}

	private doRefresh(recursive: boolean, safe: boolean = false): Promise<any> {
		this.doesHaveChildren = this.context.dataSource.hasChildren(this.context.tree, this.element);
		this.height = this._getHeight();
		this.updateVisibility();

		this._onDidRefresh.fire(this);

		return this.refreshChildren(recursive, safe);
	}

	private updateVisibility(): void {
		this.setVisible(this._isVisible());
	}

	public refresh(recursive: boolean): Promise<any> {
		return this.doRefresh(recursive);
	}

	public getNavigator(): INavigator<Item> {
		return new TreeNavigator(this);
	}

	public intersects(other: Item): boolean {
		return this.isAncestorOf(other) || other.isAncestorOf(this);
	}

	private isAncestorOf(startItem: Item): boolean {
		let item: Item | null = startItem;
		while (item) {
			if (item.id === this.id) {
				return true;
			}
			item = item.parent;
		}
		return false;
	}

	private addChild(item: Item, afterItem: Item | null = this.lastChild): void {
		let isEmpty = this.firstChild === null;
		let atHead = afterItem === null;
		let atTail = afterItem === this.lastChild;

		if (isEmpty) {
			this.firstChild = this.lastChild = item;
			item.next = item.previous = null;
		} else if (atHead) {
			if (!this.firstChild) {
				throw new Error('Invalid tree state');
			}
			this.firstChild.previous = item;
			item.next = this.firstChild;
			item.previous = null;
			this.firstChild = item;
		} else if (atTail) {
			if (!this.lastChild) {
				throw new Error('Invalid tree state');
			}
			this.lastChild.next = item;
			item.next = null;
			item.previous = this.lastChild;
			this.lastChild = item;
		} else {
			item.previous = afterItem;
			if (!afterItem) {
				throw new Error('Invalid tree state');
			}
			item.next = afterItem.next;
			if (!afterItem.next) {
				throw new Error('Invalid tree state');
			}
			afterItem.next.previous = item;
			afterItem.next = item;
		}

		item.parent = this;
		item.depth = this.depth + 1;
	}

	private removeChild(item: Item): void {
		let isFirstChild = this.firstChild === item;
		let isLastChild = this.lastChild === item;

		if (isFirstChild && isLastChild) {
			this.firstChild = this.lastChild = null;
		} else if (isFirstChild) {
			if (!item.next) {
				throw new Error('Invalid tree state');
			}
			item.next.previous = null;
			this.firstChild = item.next;
		} else if (isLastChild) {
			if (!item.previous) {
				throw new Error('Invalid tree state');
			}
			item.previous.next = null;
			this.lastChild = item.previous;
		} else {
			if (!item.next) {
				throw new Error('Invalid tree state');
			}
			item.next.previous = item.previous;
			if (!item.previous) {
				throw new Error('Invalid tree state');
			}
			item.previous.next = item.next;
		}

		item.parent = null;
		item.depth = NaN;
	}

	private forEachChild(fn: (child: Item) => void): void {
		let child = this.firstChild;
		let next: Item | null;
		while (child) {
			next = child.next;
			fn(child);
			child = next;
		}
	}

	private mapEachChild<T>(fn: (child: Item) => T): T[] {
		let result: T[] = [];
		this.forEachChild((child) => {
			result.push(fn(child));
		});
		return result;
	}

	private sort(elements: any[]): any[] {
		const sorter = this.context.sorter;
		if (sorter) {
			return elements.sort((element, otherElement) => {
				return sorter.compare(this.context.tree, element, otherElement);
			});
		}

		return elements;
	}

	/* protected */ public _getHeight(): number {
		if (!this.context.renderer) {
			return 0;
		}
		return this.context.renderer.getHeight(this.context.tree, this.element);
	}

	/* protected */ public _isVisible(): boolean {
		if (!this.context.filter) {
			return false;
		}
		return this.context.filter.isVisible(this.context.tree, this.element);
	}

	public isDisposed(): boolean {
		return this._isDisposed;
	}

	public dispose(): void {
		this.forEachChild((child) => child.dispose());

		this.parent = null;
		this.previous = null;
		this.next = null;
		this.firstChild = null;
		this.lastChild = null;

		this._onDidDispose.fire(this);

		this.registry.deregister(this);

		this._onDidCreate.dispose();
		this._onDidReveal.dispose();
		this._onExpand.dispose();
		this._onDidExpand.dispose();
		this._onCollapse.dispose();
		this._onDidCollapse.dispose();
		this._onDidAddTrait.dispose();
		this._onDidRemoveTrait.dispose();
		this._onDidRefresh.dispose();
		this._onRefreshChildren.dispose();
		this._onDidRefreshChildren.dispose();
		this._onDidDispose.dispose();

		this._isDisposed = true;
	}
}

class RootItem extends Item {

	constructor(id: string, registry: ItemRegistry, context: _.ITreeContext, lock: Lock, element: any) {
		super(id, registry, context, lock, element);
	}

	public isVisible(): boolean {
		return false;
	}

	public setVisible(value: boolean): void {
		// no-op
	}

	public isExpanded(): boolean {
		return true;
	}

	/* protected */ public _setExpanded(value: boolean): void {
		// no-op
	}

	public render(): void {
		// no-op
	}

	/* protected */ public _getHeight(): number {
		return 0;
	}

	/* protected */ public _isVisible(): boolean {
		return false;
	}
}

export class TreeNavigator implements INavigator<Item> {

	private start: Item | null;
	private item: Item | null;

	static lastDescendantOf(item: Item | null): Item | null {
		if (!item) {
			return null;
		}

		if (item instanceof RootItem) {
			return TreeNavigator.lastDescendantOf(item.lastChild);
		}

		if (!item.isVisible()) {
			return TreeNavigator.lastDescendantOf(item.previous);
		}

		if (!item.isExpanded() || item.lastChild === null) {
			return item;
		}

		return TreeNavigator.lastDescendantOf(item.lastChild);
	}

	constructor(item: Item | null, subTreeOnly: boolean = true) {
		this.item = item;
		this.start = subTreeOnly ? item : null;
	}

	public current(): Item | null {
		return this.item || null;
	}

	public next(): Item | null {
		if (this.item) {
			do {
				if ((this.item instanceof RootItem || (this.item.isVisible() && this.item.isExpanded())) && this.item.firstChild) {
					this.item = this.item.firstChild;
				} else if (this.item === this.start) {
					this.item = null;
				} else {
					// select next brother, next uncle, next great-uncle, etc...
					while (this.item && this.item !== this.start && !this.item.next) {
						this.item = this.item.parent;
					}
					if (this.item === this.start) {
						this.item = null;
					}
					this.item = !this.item ? null : this.item.next;
				}
			} while (this.item && !this.item.isVisible());
		}
		return this.item || null;
	}

	public previous(): Item | null {
		if (this.item) {
			do {
				let previous = TreeNavigator.lastDescendantOf(this.item.previous);
				if (previous) {
					this.item = previous;
				} else if (this.item.parent && this.item.parent !== this.start && this.item.parent.isVisible()) {
					this.item = this.item.parent;
				} else {
					this.item = null;
				}
			} while (this.item && !this.item.isVisible());
		}
		return this.item || null;
	}

	public parent(): Item | null {
		if (this.item) {
			let parent = this.item.parent;
			if (parent && parent !== this.start && parent.isVisible()) {
				this.item = parent;
			} else {
				this.item = null;
			}
		}
		return this.item || null;
	}

	public first(): Item | null {
		this.item = this.start;
		this.next();
		return this.item || null;
	}

	public last(): Item | null {
		return TreeNavigator.lastDescendantOf(this.start);
	}
}

export interface IBaseEvent {
	item: Item | null;
}

export interface IInputEvent extends IBaseEvent { }

export interface IRefreshEvent extends IBaseEvent {
	recursive: boolean;
}

export class TreeModel {

	private context: _.ITreeContext;
	private lock!: Lock;
	private input: Item | null;
	private registry!: ItemRegistry;
	private registryDisposable!: IDisposable;
	private traitsToItems: ITraitMap;

	private _onSetInput = new Emitter<IInputEvent>();
	readonly onSetInput: Event<IInputEvent> = this._onSetInput.event;
	private _onDidSetInput = new Emitter<IInputEvent>();
	readonly onDidSetInput: Event<IInputEvent> = this._onDidSetInput.event;
	private _onRefresh = new Emitter<IRefreshEvent>();
	readonly onRefresh: Event<IRefreshEvent> = this._onRefresh.event;
	private _onDidRefresh = new Emitter<IRefreshEvent>();
	readonly onDidRefresh: Event<IRefreshEvent> = this._onDidRefresh.event;
	private _onDidHighlight = new Emitter<_.IHighlightEvent>();
	readonly onDidHighlight: Event<_.IHighlightEvent> = this._onDidHighlight.event;
	private _onDidSelect = new Emitter<_.ISelectionEvent>();
	readonly onDidSelect: Event<_.ISelectionEvent> = this._onDidSelect.event;
	private _onDidFocus = new Emitter<_.IFocusEvent>();
	readonly onDidFocus: Event<_.IFocusEvent> = this._onDidFocus.event;

	private _onDidRevealItem = new Relay<IItemRevealEvent>();
	readonly onDidRevealItem: Event<IItemRevealEvent> = this._onDidRevealItem.event;
	private _onExpandItem = new Relay<IItemExpandEvent>();
	readonly onExpandItem: Event<IItemExpandEvent> = this._onExpandItem.event;
	private _onDidExpandItem = new Relay<IItemExpandEvent>();
	readonly onDidExpandItem: Event<IItemExpandEvent> = this._onDidExpandItem.event;
	private _onCollapseItem = new Relay<IItemCollapseEvent>();
	readonly onCollapseItem: Event<IItemCollapseEvent> = this._onCollapseItem.event;
	private _onDidCollapseItem = new Relay<IItemCollapseEvent>();
	readonly onDidCollapseItem: Event<IItemCollapseEvent> = this._onDidCollapseItem.event;
	private _onDidAddTraitItem = new Relay<IItemTraitEvent>();
	readonly onDidAddTraitItem: Event<IItemTraitEvent> = this._onDidAddTraitItem.event;
	private _onDidRemoveTraitItem = new Relay<IItemCollapseEvent>();
	readonly onDidRemoveTraitItem: Event<IItemCollapseEvent> = this._onDidRemoveTraitItem.event;
	private _onDidRefreshItem = new Relay<Item>();
	readonly onDidRefreshItem: Event<Item> = this._onDidRefreshItem.event;
	private _onRefreshItemChildren = new Relay<IItemChildrenRefreshEvent>();
	readonly onRefreshItemChildren: Event<IItemChildrenRefreshEvent> = this._onRefreshItemChildren.event;
	private _onDidRefreshItemChildren = new Relay<IItemChildrenRefreshEvent>();
	readonly onDidRefreshItemChildren: Event<IItemChildrenRefreshEvent> = this._onDidRefreshItemChildren.event;
	private _onDidDisposeItem = new Relay<Item>();
	readonly onDidDisposeItem: Event<Item> = this._onDidDisposeItem.event;

	constructor(context: _.ITreeContext) {
		this.context = context;
		this.input = null;
		this.traitsToItems = {};
	}

	public setInput(element: any): Promise<any> {
		let eventData: IInputEvent = { item: this.input };
		this._onSetInput.fire(eventData);

		this.setSelection([]);
		this.setFocus();
		this.setHighlight();

		this.lock = new Lock();

		if (this.input) {
			this.input.dispose();
		}

		if (this.registry) {
			this.registry.dispose();
			this.registryDisposable.dispose();
		}

		this.registry = new ItemRegistry();

		this._onDidRevealItem.input = this.registry.onDidRevealItem;
		this._onExpandItem.input = this.registry.onExpandItem;
		this._onDidExpandItem.input = this.registry.onDidExpandItem;
		this._onCollapseItem.input = this.registry.onCollapseItem;
		this._onDidCollapseItem.input = this.registry.onDidCollapseItem;
		this._onDidAddTraitItem.input = this.registry.onDidAddTraitItem;
		this._onDidRemoveTraitItem.input = this.registry.onDidRemoveTraitItem;
		this._onDidRefreshItem.input = this.registry.onDidRefreshItem;
		this._onRefreshItemChildren.input = this.registry.onRefreshItemChildren;
		this._onDidRefreshItemChildren.input = this.registry.onDidRefreshItemChildren;
		this._onDidDisposeItem.input = this.registry.onDidDisposeItem;

		this.registryDisposable = this.registry
			.onDidDisposeItem(item => item.getAllTraits().forEach(trait => delete this.traitsToItems[trait][item.id]));

		let id = this.context.dataSource.getId(this.context.tree, element);
		this.input = new RootItem(id, this.registry, this.context, this.lock, element);
		eventData = { item: this.input };
		this._onDidSetInput.fire(eventData);
		return this.refresh(this.input);
	}

	public getInput(): any {
		return this.input ? this.input.getElement() : null;
	}

	public refresh(element: any = null, recursive: boolean = true): Promise<any> {
		let item = this.getItem(element);

		if (!item) {
			return Promise.resolve(null);
		}

		let eventData: IRefreshEvent = { item: item, recursive: recursive };
		this._onRefresh.fire(eventData);
		return item.refresh(recursive).then(() => {
			this._onDidRefresh.fire(eventData);
		});
	}

	public expand(element: any): Promise<any> {
		let item = this.getItem(element);

		if (!item) {
			return Promise.resolve(false);
		}

		return item.expand();
	}

	public expandAll(elements?: any[]): Promise<any> {
		if (!elements) {
			elements = [];

			let item: Item | null;
			let nav = this.getNavigator();

			while (item = nav.next()) {
				elements.push(item);
			}
		}

		return this._expandAll(elements);
	}

	private _expandAll(elements: any[]): Promise<any> {
		if (elements.length === 0) {
			return Promise.resolve(null);
		}

		const elementsToExpand: any[] = [];
		const elementsToDelay: any[] = [];

		for (const element of elements) {
			let item = this.getItem(element);

			if (item) {
				elementsToExpand.push(element);
			} else {
				elementsToDelay.push(element);
			}
		}

		if (elementsToExpand.length === 0) {
			return Promise.resolve(null);
		}

		return this.__expandAll(elementsToExpand)
			.then(() => this._expandAll(elementsToDelay));
	}

	private __expandAll(elements: any[]): Promise<any> {
		const promises: Array<Promise<any>> = [];
		for (let i = 0, len = elements.length; i < len; i++) {
			promises.push(this.expand(elements[i]));
		}
		return Promise.all(promises);
	}

	public collapse(element: any, recursive: boolean = false): Promise<any> {
		const item = this.getItem(element);

		if (!item) {
			return Promise.resolve(false);
		}

		return item.collapse(recursive);
	}

	public collapseAll(elements: any[] | null = null, recursive: boolean = false): Promise<any> {
		if (!elements) {
			elements = [this.input];
			recursive = true;
		}
		let promises: Array<Promise<any>> = [];
		for (let i = 0, len = elements.length; i < len; i++) {
			promises.push(this.collapse(elements[i], recursive));
		}
		return Promise.all(promises);
	}

	public toggleExpansion(element: any, recursive: boolean = false): Promise<any> {
		return this.isExpanded(element) ? this.collapse(element, recursive) : this.expand(element);
	}

	public toggleExpansionAll(elements: any[]): Promise<any> {
		let promises: Array<Promise<any>> = [];
		for (let i = 0, len = elements.length; i < len; i++) {
			promises.push(this.toggleExpansion(elements[i]));
		}
		return Promise.all(promises);
	}

	public isExpanded(element: any): boolean {
		let item = this.getItem(element);

		if (!item) {
			return false;
		}

		return item.isExpanded();
	}

	public getExpandedElements(): any[] {
		let result: any[] = [];
		let item: Item | null;
		let nav = this.getNavigator();

		while (item = nav.next()) {
			if (item.isExpanded()) {
				result.push(item.getElement());
			}
		}

		return result;
	}

	public reveal(element: any, relativeTop: number | null = null): Promise<any> {
		return this.resolveUnknownParentChain(element).then((chain: any[]) => {
			let result = Promise.resolve(null);

			chain.forEach((e) => {
				result = result.then(() => this.expand(e));
			});

			return result;
		}).then(() => {
			let item = this.getItem(element);

			if (item) {
				return item.reveal(relativeTop);
			}
		});
	}

	private resolveUnknownParentChain(element: any): Promise<any> {
		return this.context.dataSource.getParent(this.context.tree, element).then((parent) => {
			if (!parent) {
				return Promise.resolve([]);
			}

			return this.resolveUnknownParentChain(parent).then((result) => {
				result.push(parent);
				return result;
			});
		});
	}

	public setHighlight(element?: any, eventPayload?: any): void {
		this.setTraits('highlighted', element ? [element] : []);
		let eventData: _.IHighlightEvent = { highlight: this.getHighlight(), payload: eventPayload };
		this._onDidHighlight.fire(eventData);
	}

	public getHighlight(includeHidden: boolean = false): any {
		let result = this.getElementsWithTrait('highlighted', includeHidden);
		return result.length === 0 ? null : result[0];
	}

	public isHighlighted(element: any): boolean {
		let item = this.getItem(element);

		if (!item) {
			return false;
		}

		return item.hasTrait('highlighted');
	}

	public select(element: any, eventPayload?: any): void {
		this.selectAll([element], eventPayload);
	}

	public selectAll(elements: any[], eventPayload?: any): void {
		this.addTraits('selected', elements);
		let eventData: _.ISelectionEvent = { selection: this.getSelection(), payload: eventPayload };
		this._onDidSelect.fire(eventData);
	}

	public deselect(element: any, eventPayload?: any): void {
		this.deselectAll([element], eventPayload);
	}

	public deselectAll(elements: any[], eventPayload?: any): void {
		this.removeTraits('selected', elements);
		let eventData: _.ISelectionEvent = { selection: this.getSelection(), payload: eventPayload };
		this._onDidSelect.fire(eventData);
	}

	public setSelection(elements: any[], eventPayload?: any): void {
		this.setTraits('selected', elements);
		let eventData: _.ISelectionEvent = { selection: this.getSelection(), payload: eventPayload };
		this._onDidSelect.fire(eventData);
	}

	public isSelected(element: any): boolean {
		let item = this.getItem(element);

		if (!item) {
			return false;
		}

		return item.hasTrait('selected');
	}

	public getSelection(includeHidden: boolean = false): any[] {
		return this.getElementsWithTrait('selected', includeHidden);
	}

	public selectNext(count: number = 1, clearSelection: boolean = true, eventPayload?: any): void {
		let selection = this.getSelection();
		let item: Item = selection.length > 0 ? selection[0] : this.input;
		let nextItem: Item | null;
		let nav = this.getNavigator(item, false);

		for (let i = 0; i < count; i++) {
			nextItem = nav.next();
			if (!nextItem) {
				break;
			}
			item = nextItem;
		}

		if (clearSelection) {
			this.setSelection([item], eventPayload);
		} else {
			this.select(item, eventPayload);
		}
	}

	public selectPrevious(count: number = 1, clearSelection: boolean = true, eventPayload?: any): void {
		let selection = this.getSelection(),
			item: Item | null = null,
			previousItem: Item | null = null;

		if (selection.length === 0) {
			let nav = this.getNavigator(this.input);

			while (item = nav.next()) {
				previousItem = item;
			}

			item = previousItem;

		} else {
			item = selection[0];
			let nav = this.getNavigator(item, false);

			for (let i = 0; i < count; i++) {
				previousItem = nav.previous();
				if (!previousItem) {
					break;
				}
				item = previousItem;
			}
		}

		if (clearSelection) {
			this.setSelection([item], eventPayload);
		} else {
			this.select(item, eventPayload);
		}
	}

	public setFocus(element?: any, eventPayload?: any): void {
		this.setTraits('focused', element ? [element] : []);
		let eventData: _.IFocusEvent = { focus: this.getFocus(), payload: eventPayload };
		this._onDidFocus.fire(eventData);
	}

	public isFocused(element: any): boolean {
		let item = this.getItem(element);

		if (!item) {
			return false;
		}

		return item.hasTrait('focused');
	}

	public getFocus(includeHidden: boolean = false): any {
		let result = this.getElementsWithTrait('focused', includeHidden);
		return result.length === 0 ? null : result[0];
	}

	public focusNext(count: number = 1, eventPayload?: any): void {
		let item: Item = this.getFocus() || this.input;
		let nextItem: Item | null;
		let nav = this.getNavigator(item, false);

		for (let i = 0; i < count; i++) {
			nextItem = nav.next();
			if (!nextItem) {
				break;
			}
			item = nextItem;
		}

		this.setFocus(item, eventPayload);
	}

	public focusPrevious(count: number = 1, eventPayload?: any): void {
		let item: Item = this.getFocus() || this.input;
		let previousItem: Item | null;
		let nav = this.getNavigator(item, false);

		for (let i = 0; i < count; i++) {
			previousItem = nav.previous();
			if (!previousItem) {
				break;
			}
			item = previousItem;
		}

		this.setFocus(item, eventPayload);
	}

	public focusParent(eventPayload?: any): void {
		let item: Item = this.getFocus() || this.input;
		let nav = this.getNavigator(item, false);
		let parent = nav.parent();

		if (parent) {
			this.setFocus(parent, eventPayload);
		}
	}

	public focusFirstChild(eventPayload?: any): void {
		const item = this.getItem(this.getFocus() || this.input);
		const nav = this.getNavigator(item, false);
		const next = nav.next();
		const parent = nav.parent();

		if (parent === item) {
			this.setFocus(next, eventPayload);
		}
	}

	public focusFirst(eventPayload?: any, from?: any): void {
		this.focusNth(0, eventPayload, from);
	}

	public focusNth(index: number, eventPayload?: any, from?: any): void {
		let navItem = this.getParent(from);
		let nav = this.getNavigator(navItem);
		let item = nav.first();
		for (let i = 0; i < index; i++) {
			item = nav.next();
		}

		if (item) {
			this.setFocus(item, eventPayload);
		}
	}

	public focusLast(eventPayload?: any, from?: any): void {
		const navItem = this.getParent(from);
		let item: Item | null;
		if (from && navItem) {
			item = navItem.lastChild;
		} else {
			const nav = this.getNavigator(navItem);
			item = nav.last();
		}

		if (item) {
			this.setFocus(item, eventPayload);
		}
	}

	private getParent(from?: any): Item | null {
		if (from) {
			const fromItem = this.getItem(from);
			if (fromItem && fromItem.parent) {
				return fromItem.parent;
			}
		}

		return this.getItem(this.input);
	}

	public getNavigator(element: any = null, subTreeOnly: boolean = true): INavigator<Item> {
		return new TreeNavigator(this.getItem(element), subTreeOnly);
	}

	public getItem(element: any = null): Item | null {
		if (element === null) {
			return this.input;
		} else if (element instanceof Item) {
			return element;
		} else if (typeof element === 'string') {
			return this.registry.getItem(element);
		} else {
			return this.registry.getItem(this.context.dataSource.getId(this.context.tree, element));
		}
	}

	public addTraits(trait: string, elements: any[]): void {
		let items: IItemMap = this.traitsToItems[trait] || <IItemMap>{};
		let item: Item | null;
		for (let i = 0, len = elements.length; i < len; i++) {
			item = this.getItem(elements[i]);

			if (item) {
				item.addTrait(trait);
				items[item.id] = item;
			}
		}
		this.traitsToItems[trait] = items;
	}

	public removeTraits(trait: string, elements: any[]): void {
		let items: IItemMap = this.traitsToItems[trait] || <IItemMap>{};
		let item: Item | null;
		let id: string;

		if (elements.length === 0) {
			for (id in items) {
				if (items.hasOwnProperty(id)) {
					item = items[id];
					item.removeTrait(trait);
				}
			}

			delete this.traitsToItems[trait];

		} else {
			for (let i = 0, len = elements.length; i < len; i++) {
				item = this.getItem(elements[i]);

				if (item) {
					item.removeTrait(trait);
					delete items[item.id];
				}
			}
		}
	}

	private setTraits(trait: string, elements: any[]): void {
		if (elements.length === 0) {
			this.removeTraits(trait, elements);
		} else {
			let items: { [id: string]: Item; } = {};
			let item: Item | null;

			for (let i = 0, len = elements.length; i < len; i++) {
				item = this.getItem(elements[i]);

				if (item) {
					items[item.id] = item;
				}
			}

			let traitItems: IItemMap = this.traitsToItems[trait] || <IItemMap>{};
			let itemsToRemoveTrait: Item[] = [];
			let id: string;

			for (id in traitItems) {
				if (traitItems.hasOwnProperty(id)) {
					if (items.hasOwnProperty(id)) {
						delete items[id];
					} else {
						itemsToRemoveTrait.push(traitItems[id]);
					}
				}
			}

			for (let i = 0, len = itemsToRemoveTrait.length; i < len; i++) {
				item = itemsToRemoveTrait[i];
				item.removeTrait(trait);
				delete traitItems[item.id];
			}

			for (id in items) {
				if (items.hasOwnProperty(id)) {
					item = items[id];
					item.addTrait(trait);
					traitItems[id] = item;
				}
			}

			this.traitsToItems[trait] = traitItems;
		}
	}

	private getElementsWithTrait(trait: string, includeHidden: boolean): any[] {
		let elements: any[] = [];
		let items = this.traitsToItems[trait] || {};
		let id: string;
		for (id in items) {
			if (items.hasOwnProperty(id) && (items[id].isVisible() || includeHidden)) {
				elements.push(items[id].getElement());
			}
		}
		return elements;
	}

	public dispose(): void {
		if (this.registry) {
			this.registry.dispose();
			this.registry = null!; // StrictNullOverride: nulling out ok in dispose
		}

		this._onSetInput.dispose();
		this._onDidSetInput.dispose();
		this._onRefresh.dispose();
		this._onDidRefresh.dispose();
		this._onDidHighlight.dispose();
		this._onDidSelect.dispose();
		this._onDidFocus.dispose();
		this._onDidRevealItem.dispose();
		this._onExpandItem.dispose();
		this._onDidExpandItem.dispose();
		this._onCollapseItem.dispose();
		this._onDidCollapseItem.dispose();
		this._onDidAddTraitItem.dispose();
		this._onDidRemoveTraitItem.dispose();
		this._onDidRefreshItem.dispose();
		this._onRefreshItemChildren.dispose();
		this._onDidRefreshItemChildren.dispose();
		this._onDidDisposeItem.dispose();
	}
}
