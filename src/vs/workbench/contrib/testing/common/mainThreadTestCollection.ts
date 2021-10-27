/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { AbstractIncrementalTestCollection, IncrementalTestCollectionItem, InternalTestItem, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { IMainThreadTestCollection } from 'vs/workbench/contrib/testing/common/testService';

export class MainThreadTestCollection extends AbstractIncrementalTestCollection<IncrementalTestCollectionItem> implements IMainThreadTestCollection {
	private busyProvidersChangeEmitter = new Emitter<number>();
	private retireTestEmitter = new Emitter<string>();
	private expandPromises = new WeakMap<IncrementalTestCollectionItem, {
		pendingLvl: number;
		doneLvl: number;
		prom: Promise<void>;
	}>();

	/**
	 * @inheritdoc
	 */
	public get busyProviders() {
		return this.busyControllerCount;
	}

	/**
	 * @inheritdoc
	 */
	public get rootItems() {
		return this.roots;
	}

	/**
	 * @inheritdoc
	 */
	public get all() {
		return this.getIterator();
	}

	public get rootIds() {
		return Iterable.map(this.roots.values(), r => r.item.extId);
	}

	public readonly onBusyProvidersChange = this.busyProvidersChangeEmitter.event;
	public readonly onDidRetireTest = this.retireTestEmitter.event;

	constructor(private readonly expandActual: (id: string, levels: number) => Promise<void>) {
		super();
	}

	/**
	 * @inheritdoc
	 */
	public expand(testId: string, levels: number): Promise<void> {
		const test = this.items.get(testId);
		if (!test) {
			return Promise.resolve();
		}

		// simple cache to avoid duplicate/unnecessary expansion calls
		const existing = this.expandPromises.get(test);
		if (existing && existing.pendingLvl >= levels) {
			return existing.prom;
		}

		const prom = this.expandActual(test.item.extId, levels);
		const record = { doneLvl: existing ? existing.doneLvl : -1, pendingLvl: levels, prom };
		this.expandPromises.set(test, record);

		return prom.then(() => {
			record.doneLvl = levels;
		});
	}

	/**
	 * @inheritdoc
	 */
	public getNodeById(id: string) {
		return this.items.get(id);
	}

	/**
	 * @inheritdoc
	 */
	public getReviverDiff() {
		const ops: TestsDiff = [[TestDiffOpType.IncrementPendingExtHosts, this.pendingRootCount]];

		const queue = [this.rootIds];
		while (queue.length) {
			for (const child of queue.pop()!) {
				const item = this.items.get(child)!;
				ops.push([TestDiffOpType.Add, {
					controllerId: item.controllerId,
					expand: item.expand,
					item: item.item,
					parent: item.parent,
				}]);
				queue.push(item.children);
			}
		}

		return ops;
	}

	/**
	 * Applies the diff to the collection.
	 */
	public override apply(diff: TestsDiff) {
		let prevBusy = this.busyControllerCount;
		super.apply(diff);

		if (prevBusy !== this.busyControllerCount) {
			this.busyProvidersChangeEmitter.fire(this.busyControllerCount);
		}
	}

	/**
	 * Clears everything from the collection, and returns a diff that applies
	 * that action.
	 */
	public clear() {
		const ops: TestsDiff = [];
		for (const root of this.roots) {
			ops.push([TestDiffOpType.Remove, root.item.extId]);
		}

		this.roots.clear();
		this.items.clear();

		return ops;
	}

	/**
	 * @override
	 */
	protected createItem(internal: InternalTestItem): IncrementalTestCollectionItem {
		return { ...internal, children: new Set() };
	}

	/**
	 * @override
	 */
	protected override retireTest(testId: string) {
		this.retireTestEmitter.fire(testId);
	}

	private *getIterator() {
		const queue = [this.rootIds];
		while (queue.length) {
			for (const id of queue.pop()!) {
				const node = this.getNodeById(id)!;
				yield node;
				queue.push(node.children);
			}
		}
	}
}
