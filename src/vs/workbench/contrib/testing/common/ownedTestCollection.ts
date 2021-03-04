/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { isThenable, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { throttle } from 'vs/base/common/decorators';
import { IDisposable, IReference, MutableDisposable } from 'vs/base/common/lifecycle';
import { TestItem } from 'vs/workbench/api/common/extHostTypeConverters';
import { InternalTestItem, TestDiffOpType, TestItemExpandable, TestsDiff, TestsDiffOp } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * @private
 */
export class OwnedTestCollection {
	protected readonly testIdsToInternal = new Set<TestTree<OwnedCollectionTestItem>>();

	/**
	 * Gets test information by ID, if it was defined and still exists in this
	 * extension host.
	 */
	public getTestById(id: string) {
		return mapFind(this.testIdsToInternal, t => {
			const owned = t.get(id);
			return owned && [t, owned] as const;
		});
	}

	/**
	 * Creates a new test collection for a specific hierarchy for a workspace
	 * or document observation.
	 */
	public createForHierarchy(publishDiff: (diff: TestsDiff) => void = () => undefined) {
		return new SingleUseTestCollection(this.createIdMap(), publishDiff);
	}

	protected createIdMap(): IReference<TestTree<OwnedCollectionTestItem>> {
		const tree = new TestTree<OwnedCollectionTestItem>();
		this.testIdsToInternal.add(tree);
		return { object: tree, dispose: () => this.testIdsToInternal.delete(tree) };
	}
}
/**
 * @private
 */
export interface OwnedCollectionTestItem extends InternalTestItem {
	actual: TestItem.Raw;
	/**
	 * Number of levels of items below this one that are expanded. May be infinite.
	 */
	expandLevels?: number;
	childrenCancellation: MutableDisposable<CancellationTokenSource>;
	previousChildren: Set<string>;
	previousEquals: (v: TestItem.Raw) => boolean;
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
export class TestTree<T extends InternalTestItem> {
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
		if (this.map.has(test.item.extId)) {
			throw new Error(`Attempted to insert a duplicate test item ID ${test.item.extId}`);
		}

		this.map.set(test.item.extId, test);
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
export class SingleUseTestCollection implements IDisposable {
	protected readonly testItemToInternal = new Map<TestItem.Raw, OwnedCollectionTestItem>();
	protected diff: TestsDiff = [];

	/**
	 * Debouncer for sending diffs. We use both a throttle and a debounce here,
	 * so that tests that all change state simultenously are effected together,
	 * but so we don't send hundreds of test updates per second to the main thread.
	 */
	private readonly debounceSendDiff = new RunOnceScheduler(() => this.throttleSendDiff(), 2);

	constructor(
		private readonly testIdToInternal: IReference<TestTree<OwnedCollectionTestItem>>,
		private readonly publishDiff: (diff: TestsDiff) => void,
	) { }

	/**
	 * Adds a new root node to the collection.
	 */
	public addRoot(item: TestItem.Raw, providerId: string) {
		this.addItem(item, providerId, null);
		this.debounceSendDiff.schedule();
	}

	/**
	 * Gets test information by its reference, if it was defined and still exists
	 * in this extension host.
	 */
	public getTestByReference(item: TestItem.Raw) {
		return this.testItemToInternal.get(item);
	}

	/**
	 * Should be called when an item change is fired on the test provider.
	 */
	public onItemChange(item: TestItem.Raw, providerId: string) {
		const existing = this.testItemToInternal.get(item);
		if (!existing) {
			return;
		}

		const parent = existing.parent === null ? undefined : this.testIdToInternal.object.get(existing.parent);
		if (!parent) {
			console.error(`TestProvider.onDidChangeTest for a test missing its parent, please report.`);
			return;
		}

		this.addItem(item, providerId, parent);
		this.debounceSendDiff.schedule();
	}

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
		this.diff.push(diff);
		this.debounceSendDiff.schedule();
	}

	/**
	 * Expands the test and the given number of `levels` of children. If levels
	 * is < 0, then all children will be expanded. If it's 0, then only this
	 * item will be expanded.
	 */
	public expand(testId: string, levels: number): Promise<void> | void {
		const internal = this.testIdToInternal.object.get(testId);
		if (!internal) {
			return;
		}

		if (internal.expandLevels === undefined || levels > internal.expandLevels) {
			internal.expandLevels = levels;
		}

		// try to avoid awaiting things if the provider returns synchronously in
		// order to keep everything in a single diff and DOM update.
		if (internal.expand === TestItemExpandable.Expandable) {
			internal.expand = TestItemExpandable.Expanded;
			const r = this.updateChildren(internal);
			if (isThenable(r)) {
				return r.then(() => this.expandChildren(internal, levels - 1));
			}
		} else if (internal.expand === TestItemExpandable.Expanded) {
			return this.expandChildren(internal, levels - 1);
		}
	}

	/**
	 * @inheritdoc
	 */
	public dispose() {
		this.testIdToInternal.dispose();
		this.diff = [];
	}

	private addItem(actual: TestItem.Raw, providerId: string, parent: OwnedCollectionTestItem | null) {
		let internal = this.testItemToInternal.get(actual);
		const parentId = parent ? parent.item.extId : null;
		if (!internal) {
			if (this.testIdToInternal.object.has(actual.id)) {
				throw new Error(`Attempted to insert a duplicate test item ID ${actual.id}`);
			}

			const expand = actual.getChildren ? TestItemExpandable.Expandable : TestItemExpandable.NotExpandable;
			const pExpandLvls = parent?.expandLevels;
			internal = {
				actual,
				parent: parentId,
				item: TestItem.from(actual),
				childrenCancellation: new MutableDisposable(),
				expandLevels: pExpandLvls && expand === TestItemExpandable.Expandable ? pExpandLvls - 1 : undefined,
				expand,
				providerId,
				previousChildren: new Set(),
				previousEquals: itemEqualityComparator(actual),
			};

			this.testIdToInternal.object.add(internal);
			this.testItemToInternal.set(actual, internal);
			this.diff.push([TestDiffOpType.Add, { parent: parentId, providerId, expand, item: internal.item }]);

			if (internal.expandLevels !== undefined) {
				this.expandChildren(internal, internal.expandLevels);
			}
		} else if (!internal.previousEquals(actual)) {
			internal.item = TestItem.from(actual);
			internal.previousEquals = itemEqualityComparator(actual);
			this.diff.push([TestDiffOpType.Update, { parent: parentId, providerId, expand: internal.expand, item: internal.item }]);

			// If there are children, track which ones are deleted
			// and recursively and/update them.
			if (internal.expand === TestItemExpandable.Expanded) {
				this.updateChildren(internal);
			}
		}

		return internal;
	}

	private expandChildren(internal: OwnedCollectionTestItem, levels: number): Promise<void> | void {
		if (levels < 0) {
			return;
		}

		const asyncChildren = [...internal.previousChildren]
			.map(c => this.expand(c, levels - 1))
			.filter(isThenable);

		if (asyncChildren.length) {
			return Promise.all(asyncChildren).then(() => { });
		}
	}

	private updateChildren(internal: OwnedCollectionTestItem): Promise<void> | void {
		internal.childrenCancellation.value?.cancel();
		internal.expand = TestItemExpandable.Expanded;
		const cts = internal.childrenCancellation.value = new CancellationTokenSource();

		// todo@connor4312: error handling
		const children = internal.actual.getChildren?.(cts.token) ?? [];
		if (isThenable<TestItem.Raw[] | undefined | null>(children)) {
			return this.updateChildrenAsync(internal, children, cts);
		}

		cts.cancel();
		this.updateChildrenSync(internal, children as TestItem.Raw[]);
	}

	private async updateChildrenAsync(
		internal: OwnedCollectionTestItem,
		children: Thenable<TestItem.Raw[] | undefined | null>,
		cts: CancellationTokenSource,
	) {
		this.diff.push([TestDiffOpType.DeltaDiscoverComplete, 1]);
		const resolved = await children;
		if (cts.token.isCancellationRequested) {
			this.diff.push([TestDiffOpType.DeltaDiscoverComplete, -1]);
			return;
		}

		this.updateChildrenSync(internal, resolved);
		this.diff.push([TestDiffOpType.DeltaDiscoverComplete, -1]);
		cts.cancel();
		this.debounceSendDiff.schedule();
	}

	private updateChildrenSync(internal: OwnedCollectionTestItem, children: TestItem.Raw[] | null | undefined) {
		const deletedChildren = internal.previousChildren;
		const currentChildren = new Set<string>();
		for (const child of children ?? []) {
			// If a child was recreated, delete the old object before calling
			// addItem() anew.
			const previous = this.testIdToInternal.object.get(child.id);
			if (previous && previous.actual !== child) {
				this.removeItembyId(child.id);
			}

			const c = this.addItem(child, internal.providerId, internal);
			deletedChildren.delete(c.item.extId);
			currentChildren.add(c.item.extId);
		}

		for (const child of deletedChildren) {
			this.removeItembyId(child);
		}

		internal.previousChildren = currentChildren;
	}

	private removeItembyId(id: string) {
		this.diff.push([TestDiffOpType.Remove, id]);

		const queue = [this.testIdToInternal.object.get(id)];
		while (queue.length) {
			const item = queue.pop();
			if (!item) {
				continue;
			}

			this.testIdToInternal.object.delete(item.item.extId);
			this.testItemToInternal.delete(item.actual);
			for (const child of item.previousChildren) {
				queue.push(this.testIdToInternal.object.get(child));
			}
		}
	}

	@throttle(200)
	protected throttleSendDiff() {
		this.flushDiff();
	}

	public flushDiff() {
		const diff = this.collectDiff();
		if (diff.length) {
			this.publishDiff(diff);
		}
	}
}

const keyMap: { [K in keyof Omit<TestItem.Raw, 'children'>]: null } = {
	id: null,
	label: null,
	location: null,
	debuggable: null,
	description: null,
	runnable: null
};

const simpleProps = Object.keys(keyMap) as ReadonlyArray<keyof typeof keyMap>;

const itemEqualityComparator = (a: TestItem.Raw) => {
	const values: unknown[] = [];
	for (const prop of simpleProps) {
		values.push(a[prop]);
	}

	return (b: TestItem.Raw) => {
		for (let i = 0; i < simpleProps.length; i++) {
			if (values[i] !== b[simpleProps[i]]) {
				return false;
			}
		}

		return true;
	};
};
