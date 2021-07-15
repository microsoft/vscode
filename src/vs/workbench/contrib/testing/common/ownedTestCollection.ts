/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier, isThenable, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { assertNever } from 'vs/base/common/types';
import { diffTestItems, ExtHostTestItemEvent, ExtHostTestItemEventOp, getPrivateApiFor, TestItemImpl } from 'vs/workbench/api/common/extHostTestingPrivateApi';
import * as Convert from 'vs/workbench/api/common/extHostTypeConverters';
import { applyTestItemUpdate, TestDiffOpType, TestItemExpandState, TestsDiff, TestsDiffOp } from 'vs/workbench/contrib/testing/common/testCollection';

type TestItemRaw = Convert.TestItem.Raw;

export interface IHierarchyProvider {
	getChildren(node: TestItemRaw, token: CancellationToken): Iterable<TestItemRaw> | AsyncIterable<TestItemRaw> | undefined | null;
}

/**
 * @private
 */
export interface OwnedCollectionTestItem {
	expand: TestItemExpandState;
	parent: string | null;
	actual: TestItemImpl;
	/**
	 * Number of levels of items below this one that are expanded. May be infinite.
	 */
	expandLevels?: number;
	resolveBarrier?: Barrier;
}

/**
 * Enum for describing relative positions of tests. Similar to
 * `node.compareDocumentPosition` in the DOM.
 */
export const enum TestPosition {
	/** Neither a nor b are a child of one another. They may share a common parent, though. */
	Disconnected,
	/** b is a child of a */
	IsChild,
	/** b is a parent of a */
	IsParent,
	/** a === b */
	IsSame,
}

/**
 * Test tree is (or will be after debt week 2020-03) the standard collection
 * for test trees. Internally it indexes tests by their extension ID in
 * a map.
 */
export class TestTree<T extends OwnedCollectionTestItem> {
	private readonly map = new Map<string, T>();
	private readonly _roots = new Set<T>();
	public readonly roots: ReadonlySet<T> = this._roots;

	/**
	 * Gets the size of the tree.
	 */
	public get size() {
		return this.map.size;
	}

	/**
	 * Adds a new test to the tree if it doesn't exist.
	 * @throws if a duplicate item is inserted
	 */
	public add(test: T) {
		if (this.map.has(test.actual.id)) {
			throw new Error(`Attempted to insert a duplicate test item ID ${test.actual.id}`);
		}

		this.map.set(test.actual.id, test);
		if (!test.parent) {
			this._roots.add(test);
		}
	}

	/**
	 * Gets whether the test exists in the tree.
	 */
	public has(testId: string) {
		return this.map.has(testId);
	}

	/**
	 * Removes a test ID from the tree. This is NOT recursive.
	 */
	public delete(testId: string) {
		const existing = this.map.get(testId);
		if (!existing) {
			return false;
		}

		this.map.delete(testId);
		this._roots.delete(existing);
		return true;
	}

	/**
	 * Gets a test item by ID from the tree.
	 */
	public get(testId: string) {
		return this.map.get(testId);
	}

	/**
 * Compares the positions of the two items in the test tree.
	 */
	public comparePositions(aOrId: T | string, bOrId: T | string) {
		const a = typeof aOrId === 'string' ? this.map.get(aOrId) : aOrId;
		const b = typeof bOrId === 'string' ? this.map.get(bOrId) : bOrId;
		if (!a || !b) {
			return TestPosition.Disconnected;
		}

		if (a === b) {
			return TestPosition.IsSame;
		}

		for (let p = this.map.get(b.parent!); p; p = this.map.get(p.parent!)) {
			if (p === a) {
				return TestPosition.IsChild;
			}
		}

		for (let p = this.map.get(a.parent!); p; p = this.map.get(p.parent!)) {
			if (p === b) {
				return TestPosition.IsParent;
			}
		}

		return TestPosition.Disconnected;
	}

	/**
	 * Iterates over all test in the tree.
	 */
	[Symbol.iterator]() {
		return this.map.values();
	}
}

/**
 * Maintains tests created and registered for a single set of hierarchies
 * for a workspace or document.
 * @private
 */
export class SingleUseTestCollection extends Disposable {
	private readonly debounceSendDiff = this._register(new RunOnceScheduler(() => this.flushDiff(), 200));
	private readonly diffOpEmitter = this._register(new Emitter<TestsDiff>());
	private _resolveHandler?: (item: TestItemRaw) => Promise<void> | void;

	public readonly root = new TestItemImpl(`${this.controllerId}Root`, this.controllerId, undefined);
	public readonly tree = new TestTree<OwnedCollectionTestItem>();
	protected diff: TestsDiff = [];

	constructor(
		private readonly controllerId: string,
	) {
		super();
		this.upsertItem(this.root, null);
	}

	/**
	 * Handler used for expanding test items.
	 */
	public set resolveHandler(handler: undefined | ((item: TestItemRaw) => void)) {
		this._resolveHandler = handler;
		for (const test of this.tree) {
			this.updateExpandability(test);
		}
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
		// Try to merge updates, since they're invoked per-property
		const last = this.diff[this.diff.length - 1];
		if (last && diff[0] === TestDiffOpType.Update) {
			if (last[0] === TestDiffOpType.Update && last[1].extId === diff[1].extId) {
				applyTestItemUpdate(last[1], diff[1]);
				return;
			}

			if (last[0] === TestDiffOpType.Add && last[1].item.extId === diff[1].extId) {
				applyTestItemUpdate(last[1], diff[1]);
				return;
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
		for (const item of this.tree) {
			getPrivateApiFor(item.actual).listener = undefined;
		}

		this.diff = [];
		super.dispose();
	}

	private onTestItemEvent(internal: OwnedCollectionTestItem, evt: ExtHostTestItemEvent) {
		const extId = internal?.actual.id;

		switch (evt.op) {
			case ExtHostTestItemEventOp.Invalidated:
				this.pushDiff([TestDiffOpType.Retire, extId]);
				break;

			case ExtHostTestItemEventOp.RemoveChild:
				this.removeItem(evt.id);
				break;

			case ExtHostTestItemEventOp.Upsert:
				this.upsertItem(evt.item, internal);
				break;

			case ExtHostTestItemEventOp.Bulk:
				for (const op of evt.ops) {
					this.onTestItemEvent(internal, op);
				}
				break;

			case ExtHostTestItemEventOp.SetProp:
				const { key, value } = evt;
				switch (key) {
					case 'canResolveChildren':
						this.updateExpandability(internal);
						break;
					case 'range':
						this.pushDiff([TestDiffOpType.Update, { extId, item: { range: Convert.Range.from(value) }, }]);
						break;
					case 'error':
						this.pushDiff([TestDiffOpType.Update, { extId, item: { error: Convert.MarkdownString.fromStrict(value) || null }, }]);
						break;
					default:
						this.pushDiff([TestDiffOpType.Update, { extId, item: { [key]: value ?? null } }]);
						break;
				}
				break;
			default:
				assertNever(evt);
		}
	}

	private upsertItem(actual: TestItemRaw, parent: OwnedCollectionTestItem | null) {
		if (!(actual instanceof TestItemImpl)) {
			throw new Error(`TestItems provided to the VS Code API must extend \`vscode.TestItem\`, but ${actual.id} did not`);
		}


		// If the item already exists under a different parent, remove it.
		let internal = this.tree.get(actual.id);
		if (internal && internal.parent !== parent?.actual.id) {
			(internal.actual.parent ?? this.root).children.delete(actual.id);
			internal = undefined;
		}

		// Case 1: a brand new item
		if (!internal) {
			const parentId = parent ? parent.actual.id : null;
			// always expand root node to know if there are tests (and whether to show the welcome view)
			const pExpandLvls = parent ? parent.expandLevels : 1;
			internal = {
				actual,
				parent: parentId,
				expandLevels: pExpandLvls /* intentionally undefined or 0 */ ? pExpandLvls - 1 : undefined,
				expand: TestItemExpandState.NotExpandable, // updated by `connectItemAndChildren`
			};

			this.tree.add(internal);
			this.pushDiff([
				TestDiffOpType.Add,
				{ parent: parentId, controllerId: this.controllerId, expand: internal.expand, item: Convert.TestItem.from(actual) },
			]);

			this.connectItemAndChildren(actual, internal, parent);
			return;
		}

		// Case 2: re-insertion of an existing item, no-op
		if (internal.actual === actual) {
			this.connectItem(actual, internal, parent); // re-connect in case the parent changed
			return; // no-op
		}

		// Case 3: upsert of an existing item by ID, with a new instance
		const oldChildren = internal.actual.children.all;
		const oldActual = internal.actual;
		const changedProps = diffTestItems(oldActual, actual);
		getPrivateApiFor(oldActual).listener = undefined;

		internal.actual = actual;
		internal.expand = TestItemExpandState.NotExpandable; // updated by `connectItemAndChildren`
		for (const [key, value] of changedProps) {
			this.onTestItemEvent(internal, { op: ExtHostTestItemEventOp.SetProp, key, value });
		}

		this.connectItemAndChildren(actual, internal, parent);

		// Remove any children still referencing the old parent that aren't
		// included in the new one. Note that children might have moved to a new
		// parent, so the parent ID check is done.
		for (const child of oldChildren) {
			if (!actual.children.get(child.id) && this.tree.get(child.id)?.parent === actual.id) {
				this.removeItem(child.id);
			}
		}
	}

	private connectItem(actual: TestItemImpl, internal: OwnedCollectionTestItem, parent: OwnedCollectionTestItem | null) {
		const api = getPrivateApiFor(actual);
		api.parent = parent && parent.actual !== this.root ? parent.actual : undefined;
		api.listener = evt => this.onTestItemEvent(internal, evt);
		this.updateExpandability(internal);
	}

	private connectItemAndChildren(actual: TestItemImpl, internal: OwnedCollectionTestItem, parent: OwnedCollectionTestItem | null) {
		this.connectItem(actual, internal, parent);

		// Discover any existing children that might have already been added
		for (const child of actual.children.all) {
			this.upsertItem(child, internal);
		}
	}

	/**
	 * Updates the `expand` state of the item. Should be called whenever the
	 * resolved state of the item changes. Can automatically expand the item
	 * if requested by a consumer.
	 */
	private updateExpandability(internal: OwnedCollectionTestItem) {
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
		this.pushDiff([TestDiffOpType.Update, { extId: internal.actual.id, expand: newState }]);

		if (newState === TestItemExpandState.Expandable && internal.expandLevels !== undefined) {
			this.resolveChildren(internal);
		}
	}

	/**
	 * Expands all children of the item, "levels" deep. If levels is 0, only
	 * the children will be expanded. If it's 1, the children and their children
	 * will be expanded. If it's <0, it's a no-op.
	 */
	private expandChildren(internal: OwnedCollectionTestItem, levels: number): Promise<void> | void {
		if (levels < 0) {
			return;
		}

		const asyncChildren = internal.actual.children.all
			.map(c => this.expand(c.id, levels))
			.filter(isThenable);

		if (asyncChildren.length) {
			return Promise.all(asyncChildren).then(() => { });
		}
	}

	/**
	 * Calls `discoverChildren` on the item, refreshing all its tests.
	 */
	private resolveChildren(internal: OwnedCollectionTestItem) {
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

		let r: Thenable<void> | void;
		try {
			r = this._resolveHandler(internal.actual);
		} catch (err) {
			internal.actual.error = err.stack || err.message;
		}

		if (isThenable(r)) {
			r.catch(err => internal.actual.error = err.stack || err.message).then(() => {
				barrier.open();
				this.updateExpandability(internal);
			});
		} else {
			barrier.open();
			this.updateExpandability(internal);
		}

		return internal.resolveBarrier;
	}

	private pushExpandStateUpdate(internal: OwnedCollectionTestItem) {
		this.pushDiff([TestDiffOpType.Update, { extId: internal.actual.id, expand: internal.expand }]);
	}

	private removeItem(childId: string) {
		const childItem = this.tree.get(childId);
		if (!childItem) {
			throw new Error('attempting to remove non-existent child');
		}

		this.pushDiff([TestDiffOpType.Remove, childId]);

		const queue: (OwnedCollectionTestItem | undefined)[] = [childItem];
		while (queue.length) {
			const item = queue.pop();
			if (!item) {
				continue;
			}

			getPrivateApiFor(item.actual).listener = undefined;
			this.tree.delete(item.actual.id);
			for (const child of item.actual.children.all) {
				queue.push(this.tree.get(child.id));
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
