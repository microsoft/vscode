/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { throttle } from 'vs/base/common/decorators';
import { IDisposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { TestItem } from 'vs/workbench/api/common/extHostTypeConverters';
import { RequiredTestItem, TestItem as ApiTestItem } from 'vs/workbench/api/common/extHostTypes';
import { InternalTestItem, TestDiffOpType, TestsDiff, TestsDiffOp } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * @private
 */
export class OwnedTestCollection {
	protected readonly testIdToInternal = new Map<string, OwnedCollectionTestItem>();

	/**
	 * Gets test information by ID, if it was defined and still exists in this
	 * extension host.
	 */
	public getTestById(id: string) {
		return this.testIdToInternal.get(id);
	}

	/**
	 * Creates a new test collection for a specific hierarchy for a workspace
	 * or document observation.
	 */
	public createForHierarchy(publishDiff: (diff: TestsDiff) => void = () => undefined) {
		return new SingleUseTestCollection(this.testIdToInternal, publishDiff);
	}
}
/**
 * @private
 */
export interface OwnedCollectionTestItem extends InternalTestItem {
	actual: ApiTestItem;
	previousChildren: Set<string>;
	previousEquals: (v: ApiTestItem) => boolean;
}


/**
 * Maintains tests created and registered for a single set of hierarchies
 * for a workspace or document.
 * @private
 */
export class SingleUseTestCollection implements IDisposable {
	protected readonly testItemToInternal = new Map<ApiTestItem, OwnedCollectionTestItem>();
	protected diff: TestsDiff = [];
	private disposed = false;

	/**
	 * Debouncer for sending diffs. We use both a throttle and a debounce here,
	 * so that tests that all change state simultenously are effected together,
	 * but so we don't send hundreds of test updates per second to the main thread.
	 */
	private readonly debounceSendDiff = new RunOnceScheduler(() => this.throttleSendDiff(), 2);

	constructor(private readonly testIdToInternal: Map<string, OwnedCollectionTestItem>, private readonly publishDiff: (diff: TestsDiff) => void) { }

	/**
	 * Adds a new root node to the collection.
	 */
	public addRoot(item: ApiTestItem, providerId: string) {
		this.addItem(item, providerId, null);
		this.debounceSendDiff.schedule();
	}

	/**
	 * Gets test information by its reference, if it was defined and still exists
	 * in this extension host.
	 */
	public getTestByReference(item: ApiTestItem) {
		return this.testItemToInternal.get(item);
	}

	/**
	 * Should be called when an item change is fired on the test provider.
	 */
	public onItemChange(item: ApiTestItem, providerId: string) {
		const existing = this.testItemToInternal.get(item);
		if (!existing) {
			if (!this.disposed) {
				console.warn(`Received a TestProvider.onDidChangeTest for a test that wasn't seen before as a child.`);
			}
			return;
		}

		this.addItem(item, providerId, existing.parent);
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

	public dispose() {
		for (const item of this.testItemToInternal.values()) {
			this.testIdToInternal.delete(item.id);
		}

		this.diff = [];
		this.disposed = true;
	}

	protected getId(): string {
		return generateUuid();
	}

	private addItem(actual: ApiTestItem, providerId: string, parent: string | null) {
		let internal = this.testItemToInternal.get(actual);
		const parentItem = parent ? this.testIdToInternal.get(parent) : null;
		if (!internal) {
			internal = {
				actual,
				id: this.getId(),
				parent,
				item: TestItem.from(actual, parentItem?.item.extId),
				providerId,
				previousChildren: new Set(),
				previousEquals: itemEqualityComparator(actual),
			};

			this.testItemToInternal.set(actual, internal);
			this.testIdToInternal.set(internal.id, internal);
			this.diff.push([TestDiffOpType.Add, { id: internal.id, parent, providerId, item: internal.item }]);
		} else if (!internal.previousEquals(actual)) {
			internal.item = TestItem.from(actual, parentItem?.item.extId);
			internal.previousEquals = itemEqualityComparator(actual);
			this.diff.push([TestDiffOpType.Update, { id: internal.id, parent, providerId, item: internal.item }]);
		}

		// If there are children, track which ones are deleted
		// and recursively and/update them.
		if (actual.children) {
			const deletedChildren = internal.previousChildren;
			const currentChildren = new Set<string>();
			for (const child of actual.children) {
				const c = this.addItem(child, providerId, internal.id);
				deletedChildren.delete(c.id);
				currentChildren.add(c.id);
			}

			for (const child of deletedChildren) {
				this.removeItembyId(child);
			}

			internal.previousChildren = currentChildren;
		}


		return internal;
	}

	private removeItembyId(id: string) {
		this.diff.push([TestDiffOpType.Remove, id]);

		const queue = [this.testIdToInternal.get(id)];
		while (queue.length) {
			const item = queue.pop();
			if (!item) {
				continue;
			}

			this.testIdToInternal.delete(item.id);
			this.testItemToInternal.delete(item.actual);
			for (const child of item.previousChildren) {
				queue.push(this.testIdToInternal.get(child));
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

const keyMap: { [K in keyof Omit<RequiredTestItem, 'children'>]: null } = {
	id: null,
	label: null,
	location: null,
	debuggable: null,
	description: null,
	runnable: null
};

const simpleProps = Object.keys(keyMap) as ReadonlyArray<keyof typeof keyMap>;

const itemEqualityComparator = (a: ApiTestItem) => {
	const values: unknown[] = [];
	for (const prop of simpleProps) {
		values.push(a[prop]);
	}

	return (b: ApiTestItem) => {
		for (let i = 0; i < simpleProps.length; i++) {
			if (values[i] !== b[simpleProps[i]]) {
				return false;
			}
		}

		return true;
	};
};
