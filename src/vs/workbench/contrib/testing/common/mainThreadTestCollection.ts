/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { IMainThreadTestCollection } from './testService.js';
import { AbstractIncrementalTestCollection, ITestUriCanonicalizer, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, TestDiffOpType, TestsDiff } from './testTypes.js';

export class MainThreadTestCollection extends AbstractIncrementalTestCollection<IncrementalTestCollectionItem> implements IMainThreadTestCollection {
	private testsByUrl = new ResourceMap<Set<IncrementalTestCollectionItem>>();

	private busyProvidersChangeEmitter = new Emitter<number>();
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

	constructor(uriIdentityService: ITestUriCanonicalizer, private readonly expandActual: (id: string, levels: number) => Promise<void>) {
		super(uriIdentityService);
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
	public getNodeByUrl(uri: URI): Iterable<IncrementalTestCollectionItem> {
		return this.testsByUrl.get(uri) || Iterable.empty();
	}

	/**
	 * @inheritdoc
	 */
	public getReviverDiff() {
		const ops: TestsDiff = [{ op: TestDiffOpType.IncrementPendingExtHosts, amount: this.pendingRootCount }];

		const queue = [this.rootIds];
		while (queue.length) {
			for (const child of queue.pop()!) {
				const item = this.items.get(child)!;
				ops.push({
					op: TestDiffOpType.Add,
					item: {
						controllerId: item.controllerId,
						expand: item.expand,
						item: item.item,
					}
				});
				queue.push(item.children);
			}
		}

		return ops;
	}

	/**
	 * Applies the diff to the collection.
	 */
	public override apply(diff: TestsDiff) {
		const prevBusy = this.busyControllerCount;
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
			ops.push({ op: TestDiffOpType.Remove, itemId: root.item.extId });
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

	private readonly changeCollector: IncrementalChangeCollector<IncrementalTestCollectionItem> = {
		add: node => {
			if (!node.item.uri) {
				return;
			}

			const s = this.testsByUrl.get(node.item.uri);
			if (!s) {
				this.testsByUrl.set(node.item.uri, new Set([node]));
			} else {
				s.add(node);
			}
		},
		remove: node => {
			if (!node.item.uri) {
				return;
			}

			const s = this.testsByUrl.get(node.item.uri);
			if (!s) {
				return;
			}

			s.delete(node);
			if (s.size === 0) {
				this.testsByUrl.delete(node.item.uri);
			}
		},
	};

	protected override createChangeCollector(): IncrementalChangeCollector<IncrementalTestCollectionItem> {
		return this.changeCollector;
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
