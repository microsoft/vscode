/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITestTreeProjection, TestExplorerTreeElement, TestItemTreeElement, TestTreeErrorMessage, getChildrenForParent, testIdentityProvider } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import { ISerializedTestTreeCollapseState, isCollapsedInSerializedTestTree } from 'vs/workbench/contrib/testing/browser/explorerProjections/testingViewState';
import { IComputedStateAndDurationAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { ITestItemUpdate, InternalTestItem, TestDiffOpType, TestItemExpandState, TestResultState, TestsDiff, applyTestItemUpdate } from 'vs/workbench/contrib/testing/common/testTypes';

const computedStateAccessor: IComputedStateAndDurationAccessor<TreeTestItemElement> = {
	getOwnState: i => i instanceof TestItemTreeElement ? i.ownState : TestResultState.Unset,
	getCurrentComputedState: i => i.state,
	setComputedState: (i, s) => i.state = s,

	getCurrentComputedDuration: i => i.duration,
	getOwnDuration: i => i instanceof TestItemTreeElement ? i.ownDuration : undefined,
	setComputedDuration: (i, d) => i.duration = d,

	getChildren: i => Iterable.filter(
		i.children.values(),
		(t): t is TreeTestItemElement => t instanceof TreeTestItemElement,
	),
	*getParents(i) {
		for (let parent = i.parent; parent; parent = parent.parent) {
			yield parent as TreeTestItemElement;
		}
	},
};

/**
 * Test tree element element that groups be hierarchy.
 */
class TreeTestItemElement extends TestItemTreeElement {
	/**
	 * Own, non-computed state.
	 * @internal
	 */
	public ownState = TestResultState.Unset;

	/**
	 * Own, non-computed duration.
	 * @internal
	 */
	public ownDuration: number | undefined;

	public override get description() {
		return this.test.item.description;
	}

	private errorChild?: TestTreeErrorMessage;

	constructor(
		test: InternalTestItem,
		parent: null | TreeTestItemElement,
		protected readonly addedOrRemoved: (n: TestItemTreeElement) => void,
	) {
		super({ ...test, item: { ...test.item } }, parent);
		this.updateErrorVisibility();
	}

	public update(patch: ITestItemUpdate) {
		applyTestItemUpdate(this.test, patch);
		this.updateErrorVisibility(patch);
		this.fireChange();
	}

	public fireChange() {
		this.changeEmitter.fire();
	}

	private updateErrorVisibility(patch?: ITestItemUpdate) {
		if (this.errorChild && (!this.test.item.error || patch?.item?.error)) {
			this.addedOrRemoved(this);
			this.children.delete(this.errorChild);
			this.errorChild = undefined;
		}
		if (this.test.item.error && !this.errorChild) {
			this.errorChild = new TestTreeErrorMessage(this.test.item.error, this);
			this.children.add(this.errorChild);
			this.addedOrRemoved(this);
		}
	}
}

/**
 * Projection that lists tests in their traditional tree view.
 */
export class TreeProjection extends Disposable implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();

	private readonly changedParents = new Set<TestItemTreeElement | null>();
	private readonly resortedParents = new Set<TestItemTreeElement | null>();

	private readonly items = new Map<string, TreeTestItemElement>();

	/**
	 * Gets root elements of the tree.
	 */
	private get rootsWithChildren(): Iterable<TreeTestItemElement> {
		const rootsIt = Iterable.map(this.testService.collection.rootItems, r => this.items.get(r.item.extId));
		return Iterable.filter(rootsIt, (r): r is TreeTestItemElement => !!r?.children.size);
	}

	/**
	 * @inheritdoc
	 */
	public readonly onUpdate = this.updateEmitter.event;

	constructor(
		public lastState: ISerializedTestTreeCollapseState,
		@ITestService private readonly testService: ITestService,
		@ITestResultService private readonly results: ITestResultService,
	) {
		super();
		this._register(testService.onDidProcessDiff((diff) => this.applyDiff(diff)));

		// when test results are cleared, recalculate all state
		this._register(results.onResultsChanged((evt) => {
			if (!('removed' in evt)) {
				return;
			}

			for (const inTree of [...this.items.values()].sort((a, b) => b.depth - a.depth)) {
				const lookup = this.results.getStateById(inTree.test.item.extId)?.[1];
				inTree.ownDuration = lookup?.ownDuration;
				refreshComputedState(computedStateAccessor, inTree, lookup?.ownComputedState ?? TestResultState.Unset).forEach(i => i.fireChange());
			}
		}));

		// when test states change, reflect in the tree
		this._register(results.onTestChanged(ev => {
			if (ev.reason === TestResultItemChangeReason.NewMessage) {
				return; // no effect in the tree
			}

			let result = ev.item;
			// if the state is unset, or the latest run is not making the change,
			// double check that it's valid. Retire calls might cause previous
			// emit a state change for a test run that's already long completed.
			if (result.ownComputedState === TestResultState.Unset || ev.result !== results.results[0]) {
				const fallback = results.getStateById(result.item.extId);
				if (fallback) {
					result = fallback[1];
				}
			}

			const item = this.items.get(result.item.extId);
			if (!item) {
				return;
			}

			// Skip refreshing the duration if we can trivially tell it didn't change.
			const refreshDuration = ev.reason === TestResultItemChangeReason.OwnStateChange && ev.previousOwnDuration !== result.ownDuration;
			// For items without children, always use the computed state. They are
			// either leaves (for which it's fine) or nodes where we haven't expanded
			// children and should trust whatever the result service gives us.
			const explicitComputed = item.children.size ? undefined : result.computedState;

			item.retired = !!result.retired;
			item.ownState = result.ownComputedState;
			item.ownDuration = result.ownDuration;
			item.fireChange();

			refreshComputedState(computedStateAccessor, item, explicitComputed, refreshDuration).forEach(i => i.fireChange());
		}));

		for (const test of testService.collection.all) {
			this.storeItem(this.createItem(test));
		}
	}

	/**
	 * @inheritdoc
	 */
	public getElementByTestId(testId: string): TestItemTreeElement | undefined {
		return this.items.get(testId);
	}

	/**
	 * @inheritdoc
	 */
	private applyDiff(diff: TestsDiff) {
		for (const op of diff) {
			switch (op.op) {
				case TestDiffOpType.Add: {
					const item = this.createItem(op.item);
					this.storeItem(item);
					break;
				}

				case TestDiffOpType.Update: {
					const patch = op.item;
					const existing = this.items.get(patch.extId);
					if (!existing) {
						break;
					}

					// parent needs to be re-rendered on an expand update, so that its
					// children are rewritten.
					const needsParentUpdate = existing.test.expand === TestItemExpandState.NotExpandable && patch.expand;
					existing.update(patch);
					if (needsParentUpdate) {
						this.changedParents.add(existing.parent);
					} else {
						this.resortedParents.add(existing.parent);
					}
					break;
				}

				case TestDiffOpType.Remove: {
					const toRemove = this.items.get(op.itemId);
					if (!toRemove) {
						break;
					}

					// Removing the first element will cause the root to be hidden.
					// Changing first-level elements will need the root to re-render if
					// there are no other controllers with items.
					const parent = toRemove.parent;
					const affectsRootElement = toRemove.depth === 1 && (parent?.children.size === 1 || !Iterable.some(this.rootsWithChildren, (_, i) => i === 1));
					this.changedParents.add(affectsRootElement ? null : parent);

					const queue: Iterable<TestExplorerTreeElement>[] = [[toRemove]];
					while (queue.length) {
						for (const item of queue.pop()!) {
							if (item instanceof TreeTestItemElement) {
								queue.push(this.unstoreItem(item));
							}
						}
					}

					if (parent instanceof TreeTestItemElement) {
						refreshComputedState(computedStateAccessor, parent, undefined, !!parent.duration).forEach(i => i.fireChange());
					}
				}
			}
		}

		if (diff.length !== 0) {
			this.updateEmitter.fire();
		}
	}

	/**
	 * @inheritdoc
	 */
	public applyTo(tree: ObjectTree<TestExplorerTreeElement, FuzzyScore>) {
		for (const parent of this.changedParents) {
			if (!parent || tree.hasElement(parent)) {
				tree.setChildren(parent, getChildrenForParent(this.lastState, this.rootsWithChildren, parent), { diffIdentityProvider: testIdentityProvider });
			}
		}

		for (const parent of this.resortedParents) {
			if (!parent || tree.hasElement(parent)) {
				tree.resort(parent, false);
			}
		}

		this.changedParents.clear();
		this.resortedParents.clear();
	}

	/**
	 * @inheritdoc
	 */
	public expandElement(element: TestItemTreeElement, depth: number): void {
		if (!(element instanceof TreeTestItemElement)) {
			return;
		}

		if (element.test.expand === TestItemExpandState.NotExpandable) {
			return;
		}

		this.testService.collection.expand(element.test.item.extId, depth);
	}

	private createItem(item: InternalTestItem): TreeTestItemElement {
		const parentId = TestId.parentId(item.item.extId);
		const parent = parentId ? this.items.get(parentId)! : null;
		return new TreeTestItemElement(item, parent, n => this.changedParents.add(n));
	}

	private unstoreItem(treeElement: TreeTestItemElement) {
		const parent = treeElement.parent;
		parent?.children.delete(treeElement);
		this.items.delete(treeElement.test.item.extId);
		return treeElement.children;
	}

	private storeItem(treeElement: TreeTestItemElement) {
		treeElement.parent?.children.add(treeElement);
		this.items.set(treeElement.test.item.extId, treeElement);

		// The first element will cause the root to be shown. The first element of
		// a parent may need to re-render it for #204805.
		const affectsParent = treeElement.parent?.children.size === 1;
		const affectedParent = affectsParent ? treeElement.parent.parent : treeElement.parent;
		this.changedParents.add(affectedParent);
		if (affectedParent?.depth === 0) {
			this.changedParents.add(null);
		}

		if (treeElement.depth === 0 || isCollapsedInSerializedTestTree(this.lastState, treeElement.test.item.extId) === false) {
			this.expandElement(treeElement, 0);
		}

		const prevState = this.results.getStateById(treeElement.test.item.extId)?.[1];
		if (prevState) {
			treeElement.retired = !!prevState.retired;
			treeElement.ownState = prevState.computedState;
			treeElement.ownDuration = prevState.ownDuration;

			refreshComputedState(computedStateAccessor, treeElement, undefined, !!treeElement.ownDuration).forEach(i => i.fireChange());
		}
	}
}
