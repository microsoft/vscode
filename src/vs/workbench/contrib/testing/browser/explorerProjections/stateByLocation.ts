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
import { locationsEqual, TestLocationStore } from 'vs/workbench/contrib/testing/browser/explorerProjections/locationStore';
import { NodeChangeList } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { StateElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/stateNodes';
import { statesInOrder } from 'vs/workbench/contrib/testing/browser/testExplorerTree';
import { TestSubscriptionListener } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { AbstractIncrementalTestCollection, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, TestDiffOpType, TestIdWithProvider, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';

interface IStatusTestItem extends IncrementalTestCollectionItem {
	treeElements: Map<TestRunState, TestStateElement>;
	previousState: TestRunState;
	depth: number;
	parentItem?: IStatusTestItem;
	location?: ModeLocation;
}

type TreeElement = StateElement<TestStateElement> | TestStateElement;

class TestStateElement implements ITestTreeElement {
	public computedState = this.state;

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
		// if this item is runnable and all its children are in the same state,
		// we can run all of them in one go. This will eventually be true
		// for leaf nodes, whose treeElements contain only their own state.
		if (this.test.item.runnable && this.test.treeElements.size === 1) {
			return [{ testId: this.test.id, providerId: this.test.providerId }];
		}

		return Iterable.concatNested(Iterable.map(this.children, c => c.runnable));
	}

	public get debuggable(): Iterable<TestIdWithProvider> {
		// same logic as runnable above
		if (this.test.item.debuggable && this.test.treeElements.size === 1) {
			return [{ testId: this.test.id, providerId: this.test.providerId }];
		}

		return Iterable.concatNested(Iterable.map(this.children, c => c.debuggable));
	}

	public readonly depth = this.test.depth;
	public readonly children = new Set<TestStateElement>();

	getChildren(): Iterable<ITestTreeElement> {
		return this.children;
	}

	constructor(
		public readonly state: TestRunState,
		public readonly test: IStatusTestItem,
		public readonly parentItem: TestStateElement | StateElement<TestStateElement>,
	) {
		parentItem.children.add(this);
	}

	public remove() {
		this.parentItem.children.delete(this);
	}
}

/**
 * Shows tests in a hierarchical way, but grouped by status. This is more
 * complex than it may look at first glance, because nodes can appear in
 * multiple places if they have children with different statuses.
 */
export class StateByLocationProjection extends AbstractIncrementalTestCollection<IStatusTestItem> implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	private readonly changes = new NodeChangeList<TreeElement>();
	private readonly locations = new TestLocationStore<IStatusTestItem>();
	private readonly disposable = new DisposableStore();

	/**
	 * @inheritdoc
	 */
	public readonly onUpdate = this.updateEmitter.event;

	/**
	 * Root elements for states in the tree.
	 */
	protected readonly stateRoots = new Map<TestRunState, StateElement<TestStateElement>>();

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
		const item = this.locations.getTestAtPosition(uri, position);
		if (!item) {
			return undefined;
		}

		for (const state of statesInOrder) {
			const element = item.treeElements.get(state);
			if (element) {
				return element;
			}
		}

		return undefined;
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
			incompressible: node.depth > 0,
			children: Iterable.map(node.children, this.renderNode),
		};
	};

	/**
	 * @override
	 */
	protected createChangeCollector(): IncrementalChangeCollector<IStatusTestItem> {
		return {
			add: node => {
				this.resolveNodesRecursive(node);
				this.locations.add(node);
			},
			remove: (node, isNested) => {
				this.locations.remove(node);

				if (!isNested) {
					for (const state of node.treeElements.keys()) {
						this.pruneStateElements(node, state, true);
					}
				}
			},
			update: node => {
				if (node.item.state.runState !== node.previousState) {
					this.pruneStateElements(node, node.previousState);
					this.resolveNodesRecursive(node);
				}

				const locationChanged = !locationsEqual(node.location, node.item.location);
				if (locationChanged) {
					this.locations.remove(node);
					node.location = node.item.location;
					this.locations.add(node);
				}

				const treeNode = node.treeElements.get(node.item.state.runState)!;
				this.changes.updated(treeNode);
			},
			complete: () => {
				this.updateEmitter.fire();
			}
		};
	}

	/**
	 * Ensures tree nodes for the item state are present in the tree.
	 */
	protected resolveNodesRecursive(item: IStatusTestItem) {
		const state = item.item.state.runState;
		item.previousState = item.item.state.runState;

		// Create a list of items until the current item who don't have a tree node for the status yet
		let chain: IStatusTestItem[] = [];
		for (let i: IStatusTestItem | undefined = item; i && !i.treeElements.has(state); i = i.parentItem) {
			chain.push(i);
		}

		for (let i = chain.length - 1; i >= 0; i--) {
			const item2 = chain[i];
			// the loop would have stopped pushing parents when either it reaches
			// the root, or it reaches a parent who already has a node for this state.
			const parent = item2.parentItem?.treeElements.get(state) ?? this.getOrCreateStateElement(state);
			const node = this.createElement(state, item2, parent);

			item2.treeElements.set(state, node);
			parent.children.add(node);

			if (i === chain.length - 1) {
				this.changes.added(node);
			}
		}
	}

	protected createElement(state: TestRunState, item: IStatusTestItem, parent: TreeElement) {
		return new TestStateElement(state, item, parent);
	}


	/**
	 * Recursively (from the leaf to the root) removes tree elements if there's
	 * no children who have the given state left.
	 *
	 * Returns true if it resulted in a node being removed.
	 */
	protected pruneStateElements(item: IStatusTestItem | undefined, state: TestRunState, force = false) {
		if (!item) {
			const stateRoot = this.stateRoots.get(state);
			if (stateRoot?.children.size === 0) {
				this.changes.removed(stateRoot);
				this.stateRoots.delete(state);
				return true;
			}

			return false;
		}

		const node = item.treeElements.get(state);
		if (!node) {
			return false;
		}

		// Check to make sure we aren't in the state, and there's no child with the
		// state. For the unset state, only show the node if it's a leaf or it
		// has children in the unset state.
		if (!force) {
			if (item.item.state.runState === state && !(state === TestRunState.Unset && item.children.size > 0)) {
				return false;
			}

			for (const childId of item.children) {
				if (this.items.get(childId)?.treeElements.has(state)) {
					return false;
				}
			}
		}

		// If so, proceed to deletion and recurse upwards.
		item.treeElements.delete(state);
		node.remove();

		if (!this.pruneStateElements(item.parentItem, state)) {
			this.changes.removed(node);
		}

		return true;
	}

	protected getOrCreateStateElement(state: TestRunState) {
		let s = this.stateRoots.get(state);
		if (!s) {
			s = new StateElement(state);
			this.changes.added(s);
			this.stateRoots.set(state, s);
		}

		return s;
	}

	protected createItem(item: InternalTestItem, parentItem?: IStatusTestItem): IStatusTestItem {
		return {
			...item,
			depth: parentItem ? parentItem.depth + 1 : 0,
			parentItem: parentItem,
			previousState: item.item.state.runState,
			location: item.item.location,
			children: new Set(),
			treeElements: new Map(),
		};
	}
}
