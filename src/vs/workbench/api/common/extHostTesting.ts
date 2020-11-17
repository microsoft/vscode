/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from 'vs/base/common/uuid';
import { InternalTestItem, TestDiffOpType, TestsDiff } from 'vs/platform/testing/common/testCollection';
import { ExtHostTestingShape, IMainContext, MainContext, MainThreadClipboardShape, MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import type * as vscode from 'vscode';
import { equals as equalArray } from 'vs/base/common/arrays';


export class ExtHostTesting implements ExtHostTestingShape {
	private readonly mirroredTests = new MirroredTestCollection();
	private readonly proxy: MainThreadTestingShape;
	private readonly ownedTests = new OwnedTestCollection();

	constructor(@IExtHostRpcService rpc: IExtHostRpcService) {
		this.proxy = rpc.getProxy(MainContext.MainThreadLog);
	}

	/**
	 * Gets a list of tests items (mirrored to this ext host.)
	 */
	public get rootTestItems() {
		return this.mirroredTests.rootTestItems;
	}

	public registerTestProvider<T extends vscode.TestItem>(provider: vscode.TestProvider<T>): vscode.Disposable {
		provider.onDidChangeTest(test => {

		});

		return new Disposable(() => {

		});
	}

	/**
	 * Receives a test update from the main thread. Called (eventually) whenever
	 * tests change.
	 * @override
	 */
	public $acceptDiff(diff: TestsDiff): void {
		this.mirroredTests.apply(diff);
	}

	private onTestChanged()
}

const keyMap: { [K in keyof Omit<Required<vscode.TestItem>, 'children'>]: null } = {
	label: null,
	location: null,
	runState: null,
	debuggable: null,
	description: null,
	runnable: null
};

const simpleProps = Object.keys(keyMap) as ReadonlyArray<keyof typeof keyMap>;

const serializeTestItem = (item: vscode.TestItem): Omit<vscode.TestItem, 'children'> => {
	const obj: any = {};
	for (const key of simpleProps) {
		obj[key] = item[key];
	}

	return obj;
};

class OwnedTestCollection {
	private readonly testItemToInternal = new WeakMap<vscode.TestItem, InternalTestItem>();
	private diff: TestsDiff = [];

	/**
	 * Adds a new root node to the collection.
	 */
	public addRoot(item: vscode.TestItem) {
		this.addItem(item, true);
	}

	/**
	 * Removes a test root from the collection.
	 */
	public removeRoot(item: vscode.TestItem) {
		const internal = this.testItemToInternal.get(item);
		if (!internal) {
			console.warn(`Unregistered a test root that did not exist. You should not change the TestProvider.testRoot after instantiation.`);
			return;
		}

		this.diff.push([TestDiffOpType.RemoveRoot, internal.id]);
	}

	/**
	 * Should be called when an item change is fired on the test provider.
	 */
	public onItemChange(item: vscode.TestItem) {
		if (!this.testItemToInternal.has(item)) {
			console.warn(`Received a TestProvider.onDidChangeTest for a test that wasn't seen before as a child.`);
			return;
		}

		this.addItem(item);
	}

	/**
	 * Gets a diff of all changes that have been made, and clears the diff queue.
	 */
	public collectDiff() {
		const diff = this.diff;
		this.diff = [];
		return diff;
	}

	private addItem(item: vscode.TestItem, isRoot = false): string {
		const children = item.children?.map(c => this.addItem(c));
		let internal = this.testItemToInternal.get(item);
		if (!internal) {
			internal = { id: generateUuid(), isRoot, children: [], item: serializeTestItem(item) };
			this.testItemToInternal.set(item, internal);
			this.diff.push([TestDiffOpType.Upsert, internal]);
		} else {
			if (simpleProps.some(key => item[key] !== internal!.item[key])
				|| !equalArray(children, internal.children)) {
			}
		}


		return internal.id;
	}
}

interface TestCollectionItem extends InternalTestItem {
	wrapped?: vscode.TestItem;
}

const isDefined = <T>(x: T | undefined): x is T => x !== undefined;

/**
 * Maintains tests in this extension host sent from the main thread.
 */
class MirroredTestCollection {
	private readonly items = new Map<string, TestCollectionItem>();
	private readonly roots = new Set<string>();

	/**
	 * Gets a list of root test items.
	 */
	public get rootTestItems() {
		return this.getAllAsTestItem([...this.roots]);
	}

	/**
	 * Proxy wrapper for the target item. Passes through most properties, but
	 * handles mapping of children.
	 */
	private wrapper: ProxyHandler<TestCollectionItem> = {
		ownKeys(target) {
			const keys = Reflect.ownKeys(target);
			keys.push('children');
			return keys;
		},
		get: (target, property) => {
			if (property === 'children') {
				return this.getAllAsTestItem(target.children);
			}

			return target.item[property as string];
		}
	};

	public apply(diff: TestsDiff) {
		for (const op of diff) {
			switch (op[0]) {
				case TestDiffOpType.Upsert: {
					const item = op[1];
					const existing = this.items.get(item.id);
					if (!existing) {
						this.items.set(item.id, item);
						if (item.isRoot) {
							this.roots.add(item.id);
						}
					} else {
						const oldChildren = new Set(existing.children);
						for (const newChild of item.children) {
							oldChildren.delete(newChild);
						}
						for (const oldChild of oldChildren) {
							this.removeRecursive(oldChild);
						}
						Object.assign(existing.item, item.item);
					}
					break;
				}

				case TestDiffOpType.RemoveRoot:
					this.removeRecursive(op[1]);
					break;
			}
		}
	}

	/**
	 * Recursively deletes the test item ID and all its children.
	 */
	private removeRecursive(itemId: string) {
		this.roots.delete(itemId);
		const queue = [[itemId]];
		while (queue.length) {
			for (const itemId of queue.pop()!) {
				const existing = this.items.get(itemId);
				if (!existing) {
					continue;
				}

				queue.push(existing.children);
				this.items.delete(itemId);
			}
		}
	}

	/**
	 * Translates the item IDs to TestItems for exposure to extensions.
	 */
	private getAllAsTestItem(itemIds: ReadonlyArray<string>): vscode.TestItem[] {
		return itemIds.map(itemId => {
			const item = this.items.get(itemId);
			return item && this.createCollectionItemWrapper(item);
		}).filter(isDefined);
	}

	private createCollectionItemWrapper(item: TestCollectionItem): vscode.TestItem {
		if (item.wrapped) {
			return item.wrapped;
		}

		return new Proxy(item, this.wrapper) as any;
	}
}
