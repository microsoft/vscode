/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { CompressibleObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { Location as ModeLocation } from 'vs/editor/common/modes';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement, ITestTreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { ListElementType } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByName';
import { locationsEqual, TestLocationStore } from 'vs/workbench/contrib/testing/browser/explorerProjections/locationStore';
import { NodeChangeList } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { StateElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/stateNodes';
import { TestSubscriptionListener } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { AbstractIncrementalTestCollection, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, TestDiffOpType, TestIdWithProvider, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';

class ListTestStateElement implements ITestTreeElement {
	public computedState = this.test.item.state.runState;

	public get treeId() {
		return `test:${this.test.id}`;
	}

	public get label() {
		return this.test.item.label;
	}

	public get location() {
		return this.test.item.location;
	}

	public get runnable(): Iterable<TestIdWithProvider> {
		return this.test.item.runnable
			? [{ testId: this.test.id, providerId: this.test.providerId }]
			: Iterable.empty();
	}

	public get debuggable(): Iterable<TestIdWithProvider> {
		return this.test.item.debuggable
			? [{ testId: this.test.id, providerId: this.test.providerId }]
			: Iterable.empty();
	}

	public get description() {
		let description: string | undefined;
		for (let parent = this.test.parentItem; parent && parent.depth > 0; parent = parent.parentItem) {
			description = description ? `${parent.item.label} › ${description}` : parent.item.label;
		}

		return description;
	}

	public readonly depth = 1;
	public readonly children = Iterable.empty();

	getChildren(): Iterable<never> {
		return Iterable.empty();
	}

	constructor(
		public readonly test: IStatusListTestItem,
		public readonly parentItem: StateElement<ListTestStateElement>,
	) {
		parentItem.children.add(this);
	}

	public remove() {
		this.parentItem.children.delete(this);
	}
}

interface IStatusListTestItem extends IncrementalTestCollectionItem {
	node?: ListTestStateElement;
	type: ListElementType;
	previousState: TestRunState;
	depth: number;
	parentItem?: IStatusListTestItem;
	location?: ModeLocation;
}

type TreeElement = StateElement<ListTestStateElement> | ListTestStateElement;

/**
 * Projection that shows tests in a flat list (grouped by status).
 */
export class StateByNameProjection extends AbstractIncrementalTestCollection<IStatusListTestItem> implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	private readonly changes = new NodeChangeList<TreeElement>();
	private readonly locations = new TestLocationStore<IStatusListTestItem>();
	private readonly disposable = new DisposableStore();

	/**
	 * @inheritdoc
	 */
	public readonly onUpdate = this.updateEmitter.event;

	/**
	 * Root elements for states in the tree.
	 */
	protected readonly stateRoots = new Map<TestRunState, StateElement<ListTestStateElement>>();

	constructor(listener: TestSubscriptionListener) {
		super();

		this.disposable.add(listener.onDiff(([, diff]) => this.apply(diff)));

		const firstDiff: TestsDiff = [];
		for (const [, collection] of listener.workspaceFolderCollections) {
			const queue = [collection.rootNodes];
			while (queue.length) {
				for (const id of queue.pop()!) {
					const node = collection.getNodeById(id)!;
					firstDiff.push([TestDiffOpType.Add, node]);
					queue.push(node.children);
				}
			}
		}

		this.apply(firstDiff);
	}

	/**
	 * Frees listeners associated with the projection.
	 */
	public dispose() {
		this.disposable.dispose();
	}

	/**
	 * @inheritdoc
	 */
	public getTestAtPosition(uri: URI, position: Position) {
		return this.locations.getTestAtPosition(uri, position)?.node;
	}

	/**
	 * @inheritdoc
	 */
	public applyTo(tree: CompressibleObjectTree<ITestTreeElement, FuzzyScore>) {
		this.changes.applyTo(tree, this.renderNode, () => this.stateRoots.values());
	}

	private readonly renderNode = (node: TreeElement): ICompressedTreeElement<ITestTreeElement> => {
		return {
			element: node,
			incompressible: true,
			children: node instanceof StateElement ? Iterable.map(node.children, this.renderNode) : undefined,
		};
	};

	/**
	 * @override
	 */
	protected createChangeCollector(): IncrementalChangeCollector<IStatusListTestItem> {
		return {
			add: node => {
				this.resolveNodesRecursive(node);
				this.locations.add(node);
			},
			remove: (node, isRoot) => {
				if (node.node) {
					this.locations.remove(node);
				}

				// for the top node being deleted, we need to update parents. For
				// others we only need to remove them from the tree view.
				if (isRoot) {
					this.removeNode(node);
				} else {
					this.removeNodeSingle(node);
				}
			},
			update: node => {
				if (node.item.state.runState !== node.previousState) {
					this.removeNode(node);
				}

				this.resolveNodesRecursive(node);

				const locationChanged = !locationsEqual(node.location, node.item.location);
				if (locationChanged) {
					this.locations.remove(node);
					node.location = node.item.location;
					this.locations.add(node);
				}

				if (node.node) {
					this.changes.updated(node.node);
				}
			},
			complete: () => {
				this.updateEmitter.fire();
			}
		};
	}

	/**
	 * Ensures tree nodes for the item state are present in the tree.
	 */
	protected resolveNodesRecursive(item: IStatusListTestItem) {
		const newType = Iterable.some(item.children, c => this.items.get(c)!.type !== ListElementType.BranchWithoutLeaf)
			? ListElementType.BranchWithLeaf
			: item.item.runnable
				? ListElementType.TestLeaf
				: ListElementType.BranchWithoutLeaf;

		if (newType === item.type) {
			return;
		}

		const isVisible = newType === ListElementType.TestLeaf;
		const wasVisible = item.type === ListElementType.TestLeaf;
		item.type = newType;

		if (!isVisible && wasVisible && item.node) {
			this.removeNodeSingle(item);
		} else if (isVisible && !wasVisible) {
			const state = item.item.state.runState;
			item.node = item.node || new ListTestStateElement(item, this.getOrCreateStateElement(state));
			this.changes.added(item.node);
		}

		if (item.parentItem) {
			this.resolveNodesRecursive(item.parentItem);
		}
	}

	/**
	 * Recursively (from the leaf to the root) removes tree elements if there's
	 * no children who have the given state left.
	 *
	 * Returns true if it resulted in a node being removed.
	 */
	private removeNode(item: IStatusListTestItem) {
		if (!item.node) {
			return;
		}

		this.removeNodeSingle(item);

		if (item.parentItem) {
			this.resolveNodesRecursive(item.parentItem);
		}
	}

	private removeNodeSingle(item: IStatusListTestItem) {
		if (!item.node) {
			return;
		}

		item.node.remove();
		this.changes.removed(item.node);

		const parent = item.node.parentItem;
		item.node = undefined;
		item.type = ListElementType.Unset;

		if (parent.children.size === 0) {
			this.changes.removed(parent);
			this.stateRoots.delete(parent.state);
		}
	}

	private getOrCreateStateElement(state: TestRunState) {
		let s = this.stateRoots.get(state);
		if (!s) {
			s = new StateElement(state);
			this.changes.added(s);
			this.stateRoots.set(state, s);
		}

		return s;
	}

	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem, parentItem?: IStatusListTestItem): IStatusListTestItem {
		return {
			...item,
			type: ListElementType.Unset,
			depth: parentItem ? parentItem.depth + 1 : 0,
			parentItem: parentItem,
			previousState: item.item.state.runState,
			location: item.item.location,
			children: new Set(),
		};
	}
}
