/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestIdPathParts } from 'vs/workbench/contrib/testing/common/testId';
import * as vscode from 'vscode';

export const enum ExtHostTestItemEventOp {
	Upsert,
	RemoveChild,
	Invalidated,
	SetProp,
	Bulk,
}

export interface ITestItemUpsertChild {
	op: ExtHostTestItemEventOp.Upsert;
	item: TestItemImpl;
}

export interface ITestItemRemoveChild {
	op: ExtHostTestItemEventOp.RemoveChild;
	id: string;
}

export interface ITestItemInvalidated {
	op: ExtHostTestItemEventOp.Invalidated;
}

export interface ITestItemSetProp {
	op: ExtHostTestItemEventOp.SetProp;
	key: keyof vscode.TestItem;
	value: any;
	previous: any;
}
export interface ITestItemBulkReplace {
	op: ExtHostTestItemEventOp.Bulk;
	ops: (ITestItemUpsertChild | ITestItemRemoveChild)[];
}

export type ExtHostTestItemEvent =
	| ITestItemUpsertChild
	| ITestItemRemoveChild
	| ITestItemInvalidated
	| ITestItemSetProp
	| ITestItemBulkReplace;

export interface IExtHostTestItemApi {
	controllerId: string;
	parent?: TestItemImpl;
	listener?: (evt: ExtHostTestItemEvent) => void;
}

const eventPrivateApis = new WeakMap<TestItemImpl, IExtHostTestItemApi>();

export const createPrivateApiFor = (impl: TestItemImpl, controllerId: string) => {
	const api: IExtHostTestItemApi = { controllerId };
	eventPrivateApis.set(impl, api);
	return api;
};

/**
 * Gets the private API for a test item implementation. This implementation
 * is a managed object, but we keep a weakmap to avoid exposing any of the
 * internals to extensions.
 */
export const getPrivateApiFor = (impl: TestItemImpl) => eventPrivateApis.get(impl)!;

const testItemPropAccessor = <K extends keyof vscode.TestItem>(
	api: IExtHostTestItemApi,
	key: K,
	defaultValue: vscode.TestItem[K],
	equals: (a: vscode.TestItem[K], b: vscode.TestItem[K]) => boolean
) => {
	let value = defaultValue;
	return {
		enumerable: true,
		configurable: false,
		get() {
			return value;
		},
		set(newValue: vscode.TestItem[K]) {
			if (!equals(value, newValue)) {
				const oldValue = value;
				value = newValue;
				api.listener?.({
					op: ExtHostTestItemEventOp.SetProp,
					key,
					value: newValue,
					previous: oldValue,
				});
			}
		},
	};
};

type WritableProps = Pick<vscode.TestItem, 'range' | 'label' | 'description' | 'canResolveChildren' | 'busy' | 'error' | 'tags'>;

const strictEqualComparator = <T>(a: T, b: T) => a === b;

const propComparators: { [K in keyof Required<WritableProps>]: (a: vscode.TestItem[K], b: vscode.TestItem[K]) => boolean } = {
	range: (a, b) => {
		if (a === b) { return true; }
		if (!a || !b) { return false; }
		return a.isEqual(b);
	},
	label: strictEqualComparator,
	description: strictEqualComparator,
	busy: strictEqualComparator,
	error: strictEqualComparator,
	canResolveChildren: strictEqualComparator,
	tags: (a, b) => {
		if (a.length !== b.length) {
			return false;
		}

		if (a.some(t1 => !b.find(t2 => t1.id === t2.id))) {
			return false;
		}

		return true;
	},
};

const writablePropKeys = Object.keys(propComparators) as (keyof Required<WritableProps>)[];

const makePropDescriptors = (api: IExtHostTestItemApi, label: string): { [K in keyof Required<WritableProps>]: PropertyDescriptor } => ({
	range: testItemPropAccessor(api, 'range', undefined, propComparators.range),
	label: testItemPropAccessor(api, 'label', label, propComparators.label),
	description: testItemPropAccessor(api, 'description', undefined, propComparators.description),
	canResolveChildren: testItemPropAccessor(api, 'canResolveChildren', false, propComparators.canResolveChildren),
	busy: testItemPropAccessor(api, 'busy', false, propComparators.busy),
	error: testItemPropAccessor(api, 'error', undefined, propComparators.error),
	tags: testItemPropAccessor(api, 'tags', [], propComparators.tags),
});

/**
 * Returns a partial test item containing the writable properties in B that
 * are different from A.
 */
export const diffTestItems = (a: vscode.TestItem, b: vscode.TestItem) => {
	const output = new Map<keyof WritableProps, unknown>();
	for (const key of writablePropKeys) {
		const cmp = propComparators[key] as (a: unknown, b: unknown) => boolean;
		if (!cmp(a[key], b[key])) {
			output.set(key, b[key]);
		}
	}

	return output;
};

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


export type TestItemCollectionImpl = vscode.TestItemCollection & { toJSON(): readonly TestItemImpl[] } & Iterable<TestItemImpl>;

const createTestItemCollection = (owningItem: TestItemImpl): TestItemCollectionImpl => {
	const api = getPrivateApiFor(owningItem);
	let mapped = new Map<string, TestItemImpl>();

	return {
		/** @inheritdoc */
		get size() {
			return mapped.size;
		},

		/** @inheritdoc */
		forEach(callback: (item: vscode.TestItem, collection: vscode.TestItemCollection) => unknown, thisArg?: unknown) {
			for (const item of mapped.values()) {
				callback.call(thisArg, item, this);
			}
		},

		/** @inheritdoc */
		replace(items: Iterable<vscode.TestItem>) {
			const newMapped = new Map<string, TestItemImpl>();
			const toDelete = new Set(mapped.keys());
			const bulk: ITestItemBulkReplace = { op: ExtHostTestItemEventOp.Bulk, ops: [] };

			for (const item of items) {
				if (!(item instanceof TestItemImpl)) {
					throw new InvalidTestItemError(item.id);
				}

				const itemController = getPrivateApiFor(item).controllerId;
				if (itemController !== api.controllerId) {
					throw new MixedTestItemController(item.id, itemController, api.controllerId);
				}

				if (newMapped.has(item.id)) {
					throw new DuplicateTestItemError(item.id);
				}

				newMapped.set(item.id, item);
				toDelete.delete(item.id);
				bulk.ops.push({ op: ExtHostTestItemEventOp.Upsert, item });
			}

			for (const id of toDelete.keys()) {
				bulk.ops.push({ op: ExtHostTestItemEventOp.RemoveChild, id });
			}

			api.listener?.(bulk);

			// important mutations come after firing, so if an error happens no
			// changes will be "saved":
			mapped = newMapped;
		},


		/** @inheritdoc */
		add(item: vscode.TestItem) {
			if (!(item instanceof TestItemImpl)) {
				throw new InvalidTestItemError(item.id);
			}

			mapped.set(item.id, item);
			api.listener?.({ op: ExtHostTestItemEventOp.Upsert, item });
		},

		/** @inheritdoc */
		delete(id: string) {
			if (mapped.delete(id)) {
				api.listener?.({ op: ExtHostTestItemEventOp.RemoveChild, id });
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

		/** @inheritdoc */
		[Symbol.iterator]() {
			return mapped.values();
		},
	};
};

export class TestItemImpl implements vscode.TestItem {
	public readonly id!: string;
	public readonly uri!: vscode.Uri | undefined;
	public readonly children!: TestItemCollectionImpl;
	public readonly parent!: TestItemImpl | undefined;

	public range!: vscode.Range | undefined;
	public description!: string | undefined;
	public label!: string;
	public error!: string | vscode.MarkdownString;
	public busy!: boolean;
	public canResolveChildren!: boolean;
	public tags!: readonly vscode.TestTag[];

	/**
	 * Note that data is deprecated and here for back-compat only
	 */
	constructor(controllerId: string, id: string, label: string, uri: vscode.Uri | undefined) {
		if (id.includes(TestIdPathParts.Delimiter)) {
			throw new Error(`Test IDs may not include the ${JSON.stringify(id)} symbol`);
		}

		const api = createPrivateApiFor(this, controllerId);
		Object.defineProperties(this, {
			id: {
				value: id,
				enumerable: true,
				writable: false,
			},
			uri: {
				value: uri,
				enumerable: true,
				writable: false,
			},
			parent: {
				enumerable: false,
				get() {
					return api.parent instanceof TestItemRootImpl ? undefined : api.parent;
				},
			},
			children: {
				value: createTestItemCollection(this),
				enumerable: true,
				writable: false,
			},
			...makePropDescriptors(api, label),
		});
	}

	/** @deprecated back compat */
	public invalidateResults() {
		getPrivateApiFor(this).listener?.({ op: ExtHostTestItemEventOp.Invalidated });
	}
}

export class TestItemRootImpl extends TestItemImpl {
	constructor(controllerId: string, label: string) {
		super(controllerId, controllerId, label, undefined);
	}
}
