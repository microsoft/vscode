/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier, isThenable, RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { assertNever } from '../../../../base/common/assert.js';
import { applyTestItemUpdate, ITestItem, ITestTag, namespaceTestTag, TestDiffOpType, TestItemExpandState, TestsDiff, TestsDiffOp } from './testTypes.js';
import { TestId } from './testId.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * @private
 */
interface CollectionItem<T> {
	readonly fullId: TestId;
	actual: T;
	expand: TestItemExpandState;
	/**
	 * Number of levels of items below this one that are expanded. May be infinite.
	 */
	expandLevels?: number;
	resolveBarrier?: Barrier;
}

export const enum TestItemEventOp {
	Upsert,
	SetTags,
	UpdateCanResolveChildren,
	RemoveChild,
	SetProp,
	Bulk,
	DocumentSynced,
}

export interface ITestItemUpsertChild {
	op: TestItemEventOp.Upsert;
	item: ITestItemLike;
}

export interface ITestItemUpdateCanResolveChildren {
	op: TestItemEventOp.UpdateCanResolveChildren;
	state: boolean;
}

export interface ITestItemSetTags {
	op: TestItemEventOp.SetTags;
	new: ITestTag[];
	old: ITestTag[];
}

export interface ITestItemRemoveChild {
	op: TestItemEventOp.RemoveChild;
	id: string;
}

export interface ITestItemSetProp {
	op: TestItemEventOp.SetProp;
	update: Partial<ITestItem>;
}
export interface ITestItemBulkReplace {
	op: TestItemEventOp.Bulk;
	ops: (ITestItemUpsertChild | ITestItemRemoveChild)[];
}

export interface ITestItemDocumentSynced {
	op: TestItemEventOp.DocumentSynced;
}

export type ExtHostTestItemEvent =
	| ITestItemSetTags
	| ITestItemUpsertChild
	| ITestItemRemoveChild
	| ITestItemUpdateCanResolveChildren
	| ITestItemSetProp
	| ITestItemBulkReplace
	| ITestItemDocumentSynced;

export interface ITestItemApi<T> {
	controllerId: string;
	parent?: T;
	listener?: (evt: ExtHostTestItemEvent) => void;
}

export interface ITestItemCollectionOptions<T> {
	/** Controller ID to use to prefix these test items. */
	controllerId: string;

	/** Gets the document version at the given URI, if it's open */
	getDocumentVersion(uri: URI | undefined): number | undefined;

	/** Gets API for the given test item, used to listen for events and set parents. */
	getApiFor(item: T): ITestItemApi<T>;

	/** Converts the full test item to the common interface. */
	toITestItem(item: T): ITestItem;

	/** Gets children for the item. */
	getChildren(item: T): ITestChildrenLike<T>;

	/** Root to use for the new test collection. */
	root: T;
}

const strictEqualComparator = <T>(a: T, b: T) => a === b;
const diffableProps: { [K in keyof ITestItem]?: (a: ITestItem[K], b: ITestItem[K]) => boolean } = {
	range: (a, b) => {
		if (a === b) { return true; }
		if (!a || !b) { return false; }
		return a.equalsRange(b);
	},
	busy: strictEqualComparator,
	label: strictEqualComparator,
	description: strictEqualComparator,
	error: strictEqualComparator,
	sortText: strictEqualComparator,
	tags: (a, b) => {
		if (a.length !== b.length) {
			return false;
		}

		if (a.some(t1 => !b.includes(t1))) {
			return false;
		}

		return true;
	},
};

const diffableEntries = Object.entries(diffableProps) as readonly [keyof ITestItem, (a: unknown, b: unknown) => boolean][];

const diffTestItems = (a: ITestItem, b: ITestItem) => {
	let output: Record<string, unknown> | undefined;
	for (const [key, cmp] of diffableEntries) {
		if (!cmp(a[key], b[key])) {
			if (output) {
				output[key] = b[key];
			} else {
				output = { [key]: b[key] };
			}
		}
	}

	return output as Partial<ITestItem> | undefined;
};

export interface ITestChildrenLike<T> extends Iterable<[string, T]> {
	get(id: string): T | undefined;
	delete(id: string): void;
}

export interface ITestItemLike {
	id: string;
	tags: readonly ITestTag[];
	uri?: URI;
	canResolveChildren: boolean;
}

/**
 * Maintains a collection of test items for a single controller.
 */
export class TestItemCollection<T extends ITestItemLike> extends Disposable {
	private readonly debounceSendDiff = this._register(new RunOnceScheduler(() => this.flushDiff(), 200));
	private readonly diffOpEmitter = this._register(new Emitter<TestsDiff>());
	private _resolveHandler?: (item: T | undefined) => Promise<void> | void;

	public get root() {
		return this.options.root;
	}

	public readonly tree = new Map</* full test id */string, CollectionItem<T>>();
	private readonly tags = new Map<string, { label?: string; refCount: number }>();

	protected diff: TestsDiff = [];

	constructor(private readonly options: ITestItemCollectionOptions<T>) {
		super();
		this.root.canResolveChildren = true;
		this.upsertItem(this.root, undefined);
	}

	/**
	 * Handler used for expanding test items.
	 */
	public set resolveHandler(handler: undefined | ((item: T | undefined) => void)) {
		this._resolveHandler = handler;
		for (const test of this.tree.values()) {
			this.updateExpandability(test);
		}
	}

	public get resolveHandler() {
		return this._resolveHandler;
	}

	/**
	 * Fires when an operation happens that should result in a diff.
	 */
	public readonly onDidGenerateDiff = this.diffOpEmitter.event;

	/**
	 * Gets a diff of all changes that have been made, and clears the diff queue.
	 */
	public collectDiff() {
		const diff = this.diff;
		this.diff = [];
		return diff;
	}

	/**
	 * Pushes a new diff entry onto the collected diff list.
	 */
	public pushDiff(diff: TestsDiffOp) {
		switch (diff.op) {
			case TestDiffOpType.DocumentSynced: {
				for (const existing of this.diff) {
					if (existing.op === TestDiffOpType.DocumentSynced && existing.uri === diff.uri) {
						existing.docv = diff.docv;
						return;
					}
				}

				break;
			}
			case TestDiffOpType.Update: {
				// Try to merge updates, since they're invoked per-property
				const last = this.diff[this.diff.length - 1];
				if (last) {
					if (last.op === TestDiffOpType.Update && last.item.extId === diff.item.extId) {
						applyTestItemUpdate(last.item, diff.item);
						return;
					}

					if (last.op === TestDiffOpType.Add && last.item.item.extId === diff.item.extId) {
						applyTestItemUpdate(last.item, diff.item);
						return;
					}
				}
				break;
			}
		}

		this.diff.push(diff);

		if (!this.debounceSendDiff.isScheduled()) {
			this.debounceSendDiff.schedule();
		}
	}

	/**
	 * Expands the test and the given number of `levels` of children. If levels
	 * is < 0, then all children will be expanded. If it's 0, then only this
	 * item will be expanded.
	 */
	public expand(testId: string, levels: number): Promise<void> | void {
		const internal = this.tree.get(testId);
		if (!internal) {
			return;
		}

		if (internal.expandLevels === undefined || levels > internal.expandLevels) {
			internal.expandLevels = levels;
		}

		// try to avoid awaiting things if the provider returns synchronously in
		// order to keep everything in a single diff and DOM update.
		if (internal.expand === TestItemExpandState.Expandable) {
			const r = this.resolveChildren(internal);
			return !r.isOpen()
				? r.wait().then(() => this.expandChildren(internal, levels - 1))
				: this.expandChildren(internal, levels - 1);
		} else if (internal.expand === TestItemExpandState.Expanded) {
			return internal.resolveBarrier?.isOpen() === false
				? internal.resolveBarrier.wait().then(() => this.expandChildren(internal, levels - 1))
				: this.expandChildren(internal, levels - 1);
		}
	}

	public override dispose() {
		for (const item of this.tree.values()) {
			this.options.getApiFor(item.actual).listener = undefined;
		}

		this.tree.clear();
		this.diff = [];
		super.dispose();
	}

	private onTestItemEvent(internal: CollectionItem<T>, evt: ExtHostTestItemEvent) {
		switch (evt.op) {
			case TestItemEventOp.RemoveChild:
				this.removeItem(TestId.joinToString(internal.fullId, evt.id));
				break;

			case TestItemEventOp.Upsert:
				this.upsertItem(evt.item as T, internal);
				break;

			case TestItemEventOp.Bulk:
				for (const op of evt.ops) {
					this.onTestItemEvent(internal, op);
				}
				break;

			case TestItemEventOp.SetTags:
				this.diffTagRefs(evt.new, evt.old, internal.fullId.toString());
				break;

			case TestItemEventOp.UpdateCanResolveChildren:
				this.updateExpandability(internal);
				break;

			case TestItemEventOp.SetProp:
				this.pushDiff({
					op: TestDiffOpType.Update,
					item: {
						extId: internal.fullId.toString(),
						item: evt.update,
					}
				});
				break;

			case TestItemEventOp.DocumentSynced:
				this.documentSynced(internal.actual.uri);
				break;

			default:
				assertNever(evt);
		}
	}

	private documentSynced(uri: URI | undefined) {
		if (uri) {
			this.pushDiff({
				op: TestDiffOpType.DocumentSynced,
				uri,
				docv: this.options.getDocumentVersion(uri)
			});
		}
	}

	private upsertItem(actual: T, parent: CollectionItem<T> | undefined): void {
		const fullId = TestId.fromExtHostTestItem(actual, this.root.id, parent?.actual);

		// If this test item exists elsewhere in the tree already (exists at an
		// old ID with an existing parent), remove that old item.
		const privateApi = this.options.getApiFor(actual);
		if (privateApi.parent && privateApi.parent !== parent?.actual) {
			this.options.getChildren(privateApi.parent).delete(actual.id);
		}

		let internal = this.tree.get(fullId.toString());
		// Case 1: a brand new item
		if (!internal) {
			internal = {
				fullId,
				actual,
				expandLevels: parent?.expandLevels /* intentionally undefined or 0 */ ? parent.expandLevels - 1 : undefined,
				expand: TestItemExpandState.NotExpandable, // updated by `connectItemAndChildren`
			};

			actual.tags.forEach(this.incrementTagRefs, this);
			this.tree.set(internal.fullId.toString(), internal);
			this.setItemParent(actual, parent);
			this.pushDiff({
				op: TestDiffOpType.Add,
				item: {
					controllerId: this.options.controllerId,
					expand: internal.expand,
					item: this.options.toITestItem(actual),
				},
			});

			this.connectItemAndChildren(actual, internal, parent);
			return;
		}

		// Case 2: re-insertion of an existing item, no-op
		if (internal.actual === actual) {
			this.connectItem(actual, internal, parent); // re-connect in case the parent changed
			return; // no-op
		}

		// Case 3: upsert of an existing item by ID, with a new instance
		if (internal.actual.uri?.toString() !== actual.uri?.toString()) {
			// If the item has a new URI, re-insert it; we don't support updating
			// URIs on existing test items.
			this.removeItem(fullId.toString());
			return this.upsertItem(actual, parent);
		}
		const oldChildren = this.options.getChildren(internal.actual);
		const oldActual = internal.actual;
		const update = diffTestItems(this.options.toITestItem(oldActual), this.options.toITestItem(actual));
		this.options.getApiFor(oldActual).listener = undefined;

		internal.actual = actual;
		internal.resolveBarrier = undefined;
		internal.expand = TestItemExpandState.NotExpandable; // updated by `connectItemAndChildren`

		if (update) {
			// tags are handled in a special way
			if (update.hasOwnProperty('tags')) {
				this.diffTagRefs(actual.tags, oldActual.tags, fullId.toString());
				delete update.tags;
			}
			this.onTestItemEvent(internal, { op: TestItemEventOp.SetProp, update });
		}

		this.connectItemAndChildren(actual, internal, parent);

		// Remove any orphaned children.
		for (const [_, child] of oldChildren) {
			if (!this.options.getChildren(actual).get(child.id)) {
				this.removeItem(TestId.joinToString(fullId, child.id));
			}
		}

		// Re-expand the element if it was previous expanded (#207574)
		const expandLevels = internal.expandLevels;
		if (expandLevels !== undefined) {
			// Wait until a microtask to allow the extension to finish setting up
			// properties of the element and children before we ask it to expand.
			queueMicrotask(() => {
				if (internal.expand === TestItemExpandState.Expandable) {
					internal.expandLevels = undefined;
					this.expand(fullId.toString(), expandLevels);
				}
			});
		}

		// Mark ranges in the document as synced (#161320)
		this.documentSynced(internal.actual.uri);
	}

	private diffTagRefs(newTags: readonly ITestTag[], oldTags: readonly ITestTag[], extId: string) {
		const toDelete = new Set(oldTags.map(t => t.id));
		for (const tag of newTags) {
			if (!toDelete.delete(tag.id)) {
				this.incrementTagRefs(tag);
			}
		}

		this.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId, item: { tags: newTags.map(v => namespaceTestTag(this.options.controllerId, v.id)) } }
		});

		toDelete.forEach(this.decrementTagRefs, this);
	}

	private incrementTagRefs(tag: ITestTag) {
		const existing = this.tags.get(tag.id);
		if (existing) {
			existing.refCount++;
		} else {
			this.tags.set(tag.id, { refCount: 1 });
			this.pushDiff({
				op: TestDiffOpType.AddTag, tag: {
					id: namespaceTestTag(this.options.controllerId, tag.id),
				}
			});
		}
	}

	private decrementTagRefs(tagId: string) {
		const existing = this.tags.get(tagId);
		if (existing && !--existing.refCount) {
			this.tags.delete(tagId);
			this.pushDiff({ op: TestDiffOpType.RemoveTag, id: namespaceTestTag(this.options.controllerId, tagId) });
		}
	}

	private setItemParent(actual: T, parent: CollectionItem<T> | undefined) {
		this.options.getApiFor(actual).parent = parent && parent.actual !== this.root ? parent.actual : undefined;
	}

	private connectItem(actual: T, internal: CollectionItem<T>, parent: CollectionItem<T> | undefined) {
		this.setItemParent(actual, parent);
		const api = this.options.getApiFor(actual);
		api.parent = parent?.actual;
		api.listener = evt => this.onTestItemEvent(internal, evt);
		this.updateExpandability(internal);
	}

	private connectItemAndChildren(actual: T, internal: CollectionItem<T>, parent: CollectionItem<T> | undefined) {
		this.connectItem(actual, internal, parent);

		// Discover any existing children that might have already been added
		for (const [_, child] of this.options.getChildren(actual)) {
			this.upsertItem(child, internal);
		}
	}

	/**
	 * Updates the `expand` state of the item. Should be called whenever the
	 * resolved state of the item changes. Can automatically expand the item
	 * if requested by a consumer.
	 */
	private updateExpandability(internal: CollectionItem<T>) {
		let newState: TestItemExpandState;
		if (!this._resolveHandler) {
			newState = TestItemExpandState.NotExpandable;
		} else if (internal.resolveBarrier) {
			newState = internal.resolveBarrier.isOpen()
				? TestItemExpandState.Expanded
				: TestItemExpandState.BusyExpanding;
		} else {
			newState = internal.actual.canResolveChildren
				? TestItemExpandState.Expandable
				: TestItemExpandState.NotExpandable;
		}

		if (newState === internal.expand) {
			return;
		}

		internal.expand = newState;
		this.pushDiff({ op: TestDiffOpType.Update, item: { extId: internal.fullId.toString(), expand: newState } });

		if (newState === TestItemExpandState.Expandable && internal.expandLevels !== undefined) {
			this.resolveChildren(internal);
		}
	}

	/**
	 * Expands all children of the item, "levels" deep. If levels is 0, only
	 * the children will be expanded. If it's 1, the children and their children
	 * will be expanded. If it's <0, it's a no-op.
	 */
	private expandChildren(internal: CollectionItem<T>, levels: number): Promise<void> | void {
		if (levels < 0) {
			return;
		}

		const expandRequests: Promise<void>[] = [];
		for (const [_, child] of this.options.getChildren(internal.actual)) {
			const promise = this.expand(TestId.joinToString(internal.fullId, child.id), levels);
			if (isThenable(promise)) {
				expandRequests.push(promise);
			}
		}

		if (expandRequests.length) {
			return Promise.all(expandRequests).then(() => { });
		}
	}

	/**
	 * Calls `discoverChildren` on the item, refreshing all its tests.
	 */
	private resolveChildren(internal: CollectionItem<T>) {
		if (internal.resolveBarrier) {
			return internal.resolveBarrier;
		}

		if (!this._resolveHandler) {
			const b = new Barrier();
			b.open();
			return b;
		}

		internal.expand = TestItemExpandState.BusyExpanding;
		this.pushExpandStateUpdate(internal);

		const barrier = internal.resolveBarrier = new Barrier();
		const applyError = (err: Error) => {
			console.error(`Unhandled error in resolveHandler of test controller "${this.options.controllerId}"`, err);
		};

		let r: Thenable<void> | undefined | void;
		try {
			r = this._resolveHandler(internal.actual === this.root ? undefined : internal.actual);
		} catch (err) {
			applyError(err);
		}

		if (isThenable(r)) {
			r.catch(applyError).then(() => {
				barrier.open();
				this.updateExpandability(internal);
			});
		} else {
			barrier.open();
			this.updateExpandability(internal);
		}

		return internal.resolveBarrier;
	}

	private pushExpandStateUpdate(internal: CollectionItem<T>) {
		this.pushDiff({ op: TestDiffOpType.Update, item: { extId: internal.fullId.toString(), expand: internal.expand } });
	}

	private removeItem(childId: string) {
		const childItem = this.tree.get(childId);
		if (!childItem) {
			throw new Error('attempting to remove non-existent child');
		}

		this.pushDiff({ op: TestDiffOpType.Remove, itemId: childId });

		const queue: (CollectionItem<T> | undefined)[] = [childItem];
		while (queue.length) {
			const item = queue.pop();
			if (!item) {
				continue;
			}

			this.options.getApiFor(item.actual).listener = undefined;

			for (const tag of item.actual.tags) {
				this.decrementTagRefs(tag.id);
			}

			this.tree.delete(item.fullId.toString());
			for (const [_, child] of this.options.getChildren(item.actual)) {
				queue.push(this.tree.get(TestId.joinToString(item.fullId, child.id)));
			}
		}
	}

	/**
	 * Immediately emits any pending diffs on the collection.
	 */
	public flushDiff() {
		const diff = this.collectDiff();
		if (diff.length) {
			this.diffOpEmitter.fire(diff);
		}
	}
}

/** Implementation of vscode.TestItemCollection */
export interface ITestItemChildren<T extends ITestItemLike> extends Iterable<[string, T]> {
	readonly size: number;
	replace(items: readonly T[]): void;
	forEach(callback: (item: T, collection: this) => unknown, thisArg?: unknown): void;
	add(item: T): void;
	delete(itemId: string): void;
	get(itemId: string): T | undefined;

	toJSON(): readonly T[];
}

export class DuplicateTestItemError extends Error {
	constructor(id: string) {
		super(`Attempted to insert a duplicate test item ID ${id}`);
	}
}

export class InvalidTestItemError extends Error {
	constructor(id: string) {
		super(`TestItem with ID "${id}" is invalid. Make sure to create it from the createTestItem method.`);
	}
}

export class MixedTestItemController extends Error {
	constructor(id: string, ctrlA: string, ctrlB: string) {
		super(`TestItem with ID "${id}" is from controller "${ctrlA}" and cannot be added as a child of an item from controller "${ctrlB}".`);
	}
}

export const createTestItemChildren = <T extends ITestItemLike>(api: ITestItemApi<T>, getApi: (item: T) => ITestItemApi<T>, checkCtor: Function): ITestItemChildren<T> => {
	let mapped = new Map<string, T>();

	return {
		/** @inheritdoc */
		get size() {
			return mapped.size;
		},

		/** @inheritdoc */
		forEach(callback: (item: T, collection: ITestItemChildren<T>) => unknown, thisArg?: unknown) {
			for (const item of mapped.values()) {
				callback.call(thisArg, item, this);
			}
		},

		/** @inheritdoc */
		[Symbol.iterator](): IterableIterator<[string, T]> {
			return mapped.entries();
		},

		/** @inheritdoc */
		replace(items: Iterable<T>) {
			const newMapped = new Map<string, T>();
			const toDelete = new Set(mapped.keys());
			const bulk: ITestItemBulkReplace = { op: TestItemEventOp.Bulk, ops: [] };

			for (const item of items) {
				if (!(item instanceof checkCtor)) {
					throw new InvalidTestItemError((item as ITestItemLike).id);
				}

				const itemController = getApi(item).controllerId;
				if (itemController !== api.controllerId) {
					throw new MixedTestItemController(item.id, itemController, api.controllerId);
				}

				if (newMapped.has(item.id)) {
					throw new DuplicateTestItemError(item.id);
				}

				newMapped.set(item.id, item);
				toDelete.delete(item.id);
				bulk.ops.push({ op: TestItemEventOp.Upsert, item });
			}

			for (const id of toDelete.keys()) {
				bulk.ops.push({ op: TestItemEventOp.RemoveChild, id });
			}

			api.listener?.(bulk);

			// important mutations come after firing, so if an error happens no
			// changes will be "saved":
			mapped = newMapped;
		},


		/** @inheritdoc */
		add(item: T) {
			if (!(item instanceof checkCtor)) {
				throw new InvalidTestItemError((item as ITestItemLike).id);
			}

			mapped.set(item.id, item);
			api.listener?.({ op: TestItemEventOp.Upsert, item });
		},

		/** @inheritdoc */
		delete(id: string) {
			if (mapped.delete(id)) {
				api.listener?.({ op: TestItemEventOp.RemoveChild, id });
			}
		},

		/** @inheritdoc */
		get(itemId: string) {
			return mapped.get(itemId);
		},

		/** JSON serialization function. */
		toJSON() {
			return Array.from(mapped.values());
		},
	};
};
