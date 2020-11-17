/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Request from the main thread to run a set of tests.
 */
export interface RunTestsRequest {
	ids: string[];
	debug: boolean;
}

/**
 * The TestItem from .d.ts, without and children.
 */
export interface TestItemWithoutChildren {
	label: string;
	children?: never;
	// contains other properties of the test item, excluding children which are references now
	[key: string]: unknown;
}

/**
 * TestItem-like shape, butm with an ID and children as strings.
 */
export interface InternalTestItem {
	id: string;
	isRoot: boolean;
	children: string[];
	item: TestItemWithoutChildren
}


export const enum TestDiffOpType {
	Upsert,
	RemoveRoot,
}

export type TestsDiffOp =
	| [op: TestDiffOpType.RemoveRoot, itemId: string]
	| [op: TestDiffOpType.Upsert, item: InternalTestItem];

/**
 * Request from the ext host or main thread to indicate that tests have
 * changed. It's assumed that any item upserted *must* have its children
 * previously also upserted, or upserted as part of the same operation.
 * Children that no longer exist in an upserted item will be removed.
 */
export type TestsDiff = TestsDiffOp[];


export class TestCollection {
	private readonly items = new Map<string, InternalTestItem>();
	private readonly roots = new Set<string>();

	public apply(diff: TestsDiff) {
		for (const added of diff.add) {
			this.items.set(added.id, added);
			if (added.isRoot) {
				this.roots.add(added.id);
			}
		}

		for (const removed of diff.remove) {
			this.items.delete(removed);
		}

		for (const changed of diff.change) {
			this.items.set(changed.id, changed);
		}
	}
}
