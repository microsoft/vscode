/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier, isThenable, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { assertNever } from 'vs/base/common/types';
import { diffTestItems, ExtHostTestItemEvent, ExtHostTestItemEventOp, getPrivateApiFor, TestItemImpl, TestItemRootImpl } from 'vs/workbench/api/common/extHostTestingPrivateApi';
import * as Convert from 'vs/workbench/api/common/extHostTypeConverters';
import { applyTestItemUpdate, ITestTag, TestDiffOpType, TestItemExpandState, TestsDiff, TestsDiffOp } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';

type TestItemRaw = Convert.TestItem.Raw;

export interface IHierarchyProvider {
	getChildren(node: TestItemRaw, token: CancellationToken): Iterable<TestItemRaw> | AsyncIterable<TestItemRaw> | undefined | null;
}

/**
 * @private
 */
export interface OwnedCollectionTestItem {
	readonly fullId: TestId;
	readonly parent: TestId | null;
	actual: TestItemImpl;
	expand: TestItemExpandState;
	/**
	 * Number of levels of items below this one that are expanded. May be infinite.
	 */
	expandLevels?: number;
	resolveBarrier?: Barrier;
}

/**
 * Maintains tests created and registered for a single set of hierarchies
 * for a workspace or document.
 * @private
 */
export class SingleUseTestCollection extends Disposable {
	private readonly debounceSendDiff = this._register(new RunOnceScheduler(() => this.flushDiff(), 200));
	private readonly diffOpEmitter = this._register(new Emitter<TestsDiff>());
	private _resolveHandler?: (item: TestItemRaw | undefined) => Promise<void> | void;

	public readonly root = new TestItemRootImpl(this.controllerId, this.controllerId);
	public readonly tree = new Map</* full test id */string, OwnedCollectionTestItem>();
	private readonly tags = new Map<string, { label?: string, refCount: number }>();

	protected diff: TestsDiff = [];

	constructor(private readonly controllerId: string) {
		super();
		this.root.canResolveChildren = true;
		this.upsertItem(this.root, undefined);
	}

	/**
	 * Handler used for expanding test items.
	 */
	public set resolveHandler(handler: undefined | ((item: TestItemRaw | undefined) => void)) {
		this._resolveHandler = handler;
		for (const test of this.tree.values()) {
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
		for (const item of this.tree.values()) {
			getPrivateApiFor(item.actual).listener = undefined;
		}

		this.tree.clear();
		this.diff = [];
		super.dispose();
	}

	private onTestItemEvent(internal: OwnedCollectionTestItem, evt: ExtHostTestItemEvent) {
		switch (evt.op) {
			case ExtHostTestItemEventOp.Invalidated:
				this.pushDiff([TestDiffOpType.Retire, internal.fullId.toString()]);
				break;

			case ExtHostTestItemEventOp.RemoveChild:
				this.removeItem(TestId.joinToString(internal.fullId, evt.id));
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
				const { key, value, previous } = evt;
				const extId = internal.fullId.toString();
				switch (key) {
					case 'canResolveChildren':
						this.updateExpandability(internal);
						break;
					case 'tags':
						this.diffTagRefs(value, previous, extId);
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

	private upsertItem(actual: TestItemRaw, parent: OwnedCollectionTestItem | undefined) {
		if (!(actual instanceof TestItemImpl)) {
			throw new Error(`TestItems provided to the VS Code API must extend \`vscode.TestItem\`, but ${actual.id} did not`);
		}

		const fullId = TestId.fromExtHostTestItem(actual, this.root.id, parent?.actual);

		// If this test item exists elsewhere in the tree already (exists at an
		// old ID with an existing parent), remove that old item.
		const privateApi = getPrivateApiFor(actual);
		if (privateApi.parent && privateApi.parent !== parent?.actual) {
			privateApi.parent.children.delete(actual.id);
		}

		let internal = this.tree.get(fullId.toString());
		// Case 1: a brand new item
		if (!internal) {
			internal = {
				fullId,
				actual,
				parent: parent ? fullId.parentId : null,
				expandLevels: parent?.expandLevels /* intentionally undefined or 0 */ ? parent.expandLevels - 1 : undefined,
				expand: TestItemExpandState.NotExpandable, // updated by `connectItemAndChildren`
			};

			actual.tags.forEach(this.incrementTagRefs, this);
			this.tree.set(internal.fullId.toString(), internal);
			this.setItemParent(actual, parent);
			this.pushDiff([
				TestDiffOpType.Add,
				{
					parent: internal.parent && internal.parent.toString(),
					controllerId: this.controllerId,
					expand: internal.expand,
					item: Convert.TestItem.from(actual),
				},
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
		const oldChildren = internal.actual.children;
		const oldActual = internal.actual;
		const changedProps = diffTestItems(oldActual, actual);
		getPrivateApiFor(oldActual).listener = undefined;

		internal.actual = actual;
		internal.expand = TestItemExpandState.NotExpandable; // updated by `connectItemAndChildren`
		for (const [key, value] of changedProps) {
			this.onTestItemEvent(internal, { op: ExtHostTestItemEventOp.SetProp, key, value, previous: oldActual[key] });
		}

		this.connectItemAndChildren(actual, internal, parent);

		// Remove any orphaned children.
		for (const child of oldChildren) {
			if (!actual.children.get(child.id)) {
				this.removeItem(TestId.joinToString(fullId, child.id));
			}
		}
	}

	private diffTagRefs(newTags: ITestTag[], oldTags: ITestTag[], extId: string) {
		const toDelete = new Set(oldTags.map(t => t.id));
		for (const tag of newTags) {
			if (!toDelete.delete(tag.id)) {
				this.incrementTagRefs(tag);
			}
		}

		this.pushDiff([
			TestDiffOpType.Update,
			{ extId, item: { tags: newTags.map(v => Convert.TestTag.namespace(this.controllerId, v.id)) } }]
		);

		toDelete.forEach(this.decrementTagRefs, this);
	}

	private incrementTagRefs(tag: ITestTag) {
		const existing = this.tags.get(tag.id);
		if (existing) {
			existing.refCount++;
		} else {
			this.tags.set(tag.id, { label: tag.label, refCount: 1 });
			this.pushDiff([TestDiffOpType.AddTag, {
				id: Convert.TestTag.namespace(this.controllerId, tag.id),
				ctrlLabel: this.root.label,
				label: tag.label,
			}]);
		}
	}

	private decrementTagRefs(tagId: string) {
		const existing = this.tags.get(tagId);
		if (existing && !--existing.refCount) {
			this.tags.delete(tagId);
			this.pushDiff([TestDiffOpType.RemoveTag, Convert.TestTag.namespace(this.controllerId, tagId)]);
		}
	}

	private setItemParent(actual: TestItemImpl, parent: OwnedCollectionTestItem | undefined) {
		getPrivateApiFor(actual).parent = parent && parent.actual !== this.root ? parent.actual : undefined;
	}

	private connectItem(actual: TestItemImpl, internal: OwnedCollectionTestItem, parent: OwnedCollectionTestItem | undefined) {
		this.setItemParent(actual, parent);
		const api = getPrivateApiFor(actual);
		api.parent = parent?.actual;
		api.listener = evt => this.onTestItemEvent(internal, evt);
		this.updateExpandability(internal);
	}

	private connectItemAndChildren(actual: TestItemImpl, internal: OwnedCollectionTestItem, parent: OwnedCollectionTestItem | undefined) {
		this.connectItem(actual, internal, parent);

		// Discover any existing children that might have already been added
		for (const child of actual.children) {
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
		this.pushDiff([TestDiffOpType.Update, { extId: internal.fullId.toString(), expand: newState }]);

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

		const expandRequests: Promise<void>[] = [];
		for (const child of internal.actual.children) {
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
		const applyError = (err: Error) => {
			console.error(`Unhandled error in resolveHandler of test controller "${this.controllerId}"`);
			if (internal.actual !== this.root) {
				internal.actual.error = err.stack || err.message || String(err);
			}
		};

		let r: Thenable<void> | void;
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

	private pushExpandStateUpdate(internal: OwnedCollectionTestItem) {
		this.pushDiff([TestDiffOpType.Update, { extId: internal.fullId.toString(), expand: internal.expand }]);
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

			for (const tag of item.actual.tags) {
				this.decrementTagRefs(tag.id);
			}

			this.tree.delete(item.fullId.toString());
			for (const child of item.actual.children) {
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
