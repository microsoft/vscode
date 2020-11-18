/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Request to them main thread to run a set of tests.
 */
export interface RunTestsRequest {
	tests: { testId: string; providerId: string }[];
	debug: boolean;
}

/**
 * Request from the main thread to run tests for a single provider.
 */
export interface RunTestForProviderRequest {
	providerId: string;
	ids: string[];
	debug: boolean;
}

/**
 * Response to a  {@link RunTestsRequest}
 */
export interface RunTestsResult {
	// todo
}

export const EMPTY_TEST_RESULT: RunTestsResult = {};

export const collectTestResults = (results: ReadonlyArray<RunTestsResult>) => {
	return results[0] || {}; // todo
};

/**
 * The TestItem from .d.ts, without and children.
 */
export interface TestItemWithoutChildren {
	label: string;
	children?: never;
	// contains other properties of the test item, excluding children which are references now
	[key: string]: any;
}

/**
 * TestItem-like shape, butm with an ID and children as strings.
 */
export interface InternalTestItem {
	id: string;
	providerId: string;
	parent: string | null;
	item: TestItemWithoutChildren
}

export const enum TestDiffOpType {
	Add,
	Update,
	Remove,
}

export type TestsDiffOp =
	| [op: TestDiffOpType.Add, item: InternalTestItem]
	| [op: TestDiffOpType.Update, item: InternalTestItem]
	| [op: TestDiffOpType.Remove, itemId: string];

/**
 * Request from the ext host or main thread to indicate that tests have
 * changed. It's assumed that any item upserted *must* have its children
 * previously also upserted, or upserted as part of the same operation.
 * Children that no longer exist in an upserted item will be removed.
 */
export type TestsDiff = TestsDiffOp[];

/**
 * @private
 */
export interface IncrementalTestCollectionItem extends InternalTestItem {
	children: Set<string>;
}

/**
 * Maintains tests in this extension host sent from the main thread.
 */
export abstract class AbstractIncrementalTestCollection<T extends IncrementalTestCollectionItem>  {
	/**
	 * Map of item IDs to test item objects.
	 */
	protected readonly items = new Map<string, T>();

	/**
	 * ID of test root items.
	 */
	protected readonly roots = new Set<string>();

	/**
	 * Applies the diff to the collection.
	 */
	public apply(diff: TestsDiff) {
		for (const op of diff) {
			switch (op[0]) {
				case TestDiffOpType.Add: {
					const item = op[1];
					if (!item.parent) {
						this.roots.add(item.id);
						this.items.set(item.id, this.createItem(item));
					} else if (this.items.has(item.parent)) {
						this.items.get(item.parent)!.children.add(item.id);
						this.items.set(item.id, this.createItem(item));
					}
					break;
				}

				case TestDiffOpType.Update: {
					const item = op[1];
					const existing = this.items.get(item.id);
					if (existing) {
						Object.assign(existing.item, item.item);
					}
					break;
				}

				case TestDiffOpType.Remove: {
					const toRemove = this.items.get(op[1]);
					if (!toRemove) {
						break;
					}

					if (toRemove.parent) {
						this.items.get(toRemove.parent)!.children.delete(toRemove.id);
					} else {
						this.roots.delete(toRemove.id);
					}

					const queue: Iterable<string>[] = [[op[1]]];
					while (queue.length) {
						for (const itemId of queue.pop()!) {
							const existing = this.items.get(itemId);
							if (existing) {
								queue.push(existing.children);
								this.items.delete(itemId);
							}
						}
					}
				}
			}
		}
	}

	/**
	 * Creates a new item for the collection from the internal test item.
	 */
	protected abstract createItem(internal: InternalTestItem): T;
}
