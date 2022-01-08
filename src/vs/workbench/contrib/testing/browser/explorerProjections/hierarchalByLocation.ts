/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { ByLocationTestItemElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { IActionableTestTreeElement, ITestTreeProjection, TestExplorerTreeElement, TestItemTreeElement, TestTreeErrorMessage } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import { NodeChangeList, NodeRenderDirective, NodeRenderFn, peersHaveChildren } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { IComputedStateAndDurationAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { InternalTestItem, TestDiffOpType, TestItemExpandState, TestResultState, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

const computedStateAccessor: IComputedStateAndDurationAccessor<IActionableTestTreeElement> = {
	getOwnState: i => i instanceof TestItemTreeElement ? i.ownState : TestResultState.Unset,
	getCurrentComputedState: i => i.state,
	setComputedState: (i, s) => i.state = s,

	getCurrentComputedDuration: i => i.duration,
	getOwnDuration: i => i instanceof TestItemTreeElement ? i.ownDuration : undefined,
	setComputedDuration: (i, d) => i.duration = d,

	getChildren: i => Iterable.filter(
		i.children.values(),
		(t): t is TestItemTreeElement => t instanceof TestItemTreeElement,
	),
	*getParents(i) {
		for (let parent = i.parent; parent; parent = parent.parent) {
			yield parent;
		}
	},
};

/**
 * Projection that lists tests in their traditional tree view.
 */
export class HierarchicalByLocationProjection extends Disposable implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	protected readonly changes = new NodeChangeList<ByLocationTestItemElement>();
	protected readonly items = new Map<string, ByLocationTestItemElement>();

	/**
	 * Gets root elements of the tree.
	 */
	protected get roots(): Iterable<ByLocationTestItemElement> {
		const rootsIt = Iterable.map(this.testService.collection.rootItems, r => this.items.get(r.item.extId));
		return Iterable.filter(rootsIt, isDefined);
	}

	/**
	 * @inheritdoc
	 */
	public readonly onUpdate = this.updateEmitter.event;

	constructor(
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
				refreshComputedState(computedStateAccessor, inTree, lookup?.ownComputedState ?? TestResultState.Unset).forEach(this.addUpdated);
			}

			this.updateEmitter.fire();
		}));

		// when test states change, reflect in the tree
		this._register(results.onTestChanged(({ item: result }) => {
			if (result.ownComputedState === TestResultState.Unset) {
				const fallback = results.getStateById(result.item.extId);
				if (fallback) {
					result = fallback[1];
				}
			}

			const item = this.items.get(result.item.extId);
			if (!item) {
				return;
			}

			item.retired = result.retired;
			item.ownState = result.ownComputedState;
			item.ownDuration = result.ownDuration;
			// For items without children, always use the computed state. They are
			// either leaves (for which it's fine) or nodes where we haven't expanded
			// children and should trust whatever the result service gives us.
			const explicitComputed = item.children.size ? undefined : result.computedState;
			refreshComputedState(computedStateAccessor, item, explicitComputed).forEach(this.addUpdated);
			this.addUpdated(item);
			this.updateEmitter.fire();
		}));

		for (const test of testService.collection.all) {
			this.storeItem(this.createItem(test));
		}
	}

	/**
	 * Gets the depth of children to expanded automatically for the node,
	 */
	protected getRevealDepth(element: ByLocationTestItemElement): number | undefined {
		return element.depth === 0 ? 0 : undefined;
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
			switch (op[0]) {
				case TestDiffOpType.Add: {
					const item = this.createItem(op[1]);
					this.storeItem(item);
					break;
				}

				case TestDiffOpType.Update: {
					const patch = op[1];
					const existing = this.items.get(patch.extId);
					if (!existing) {
						break;
					}

					// parent needs to be re-rendered on an expand update, so that its
					// children are rewritten.
					const needsParentUpdate = existing.test.expand === TestItemExpandState.NotExpandable && patch.expand;
					existing.update(patch);
					if (needsParentUpdate) {
						this.changes.addedOrRemoved(existing);
					} else {
						this.changes.updated(existing);
					}
					break;
				}

				case TestDiffOpType.Remove: {
					const toRemove = this.items.get(op[1]);
					if (!toRemove) {
						break;
					}

					this.changes.addedOrRemoved(toRemove);

					const queue: Iterable<TestExplorerTreeElement>[] = [[toRemove]];
					while (queue.length) {
						for (const item of queue.pop()!) {
							if (item instanceof ByLocationTestItemElement) {
								queue.push(this.unstoreItem(this.items, item));
							}
						}
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
		this.changes.applyTo(tree, this.renderNode, () => this.roots);
	}

	/**
	 * @inheritdoc
	 */
	public expandElement(element: TestItemTreeElement, depth: number): void {
		if (!(element instanceof ByLocationTestItemElement)) {
			return;
		}

		if (element.test.expand === TestItemExpandState.NotExpandable) {
			return;
		}

		this.testService.collection.expand(element.test.item.extId, depth);
	}

	protected createItem(item: InternalTestItem): ByLocationTestItemElement {
		const parent = item.parent ? this.items.get(item.parent)! : null;
		return new ByLocationTestItemElement(item, parent, n => this.changes.addedOrRemoved(n));
	}

	protected readonly addUpdated = (item: IActionableTestTreeElement) => {
		const cast = item as ByLocationTestItemElement;
		this.changes.updated(cast);
	};

	protected renderNode: NodeRenderFn = (node, recurse) => {
		if (node instanceof TestTreeErrorMessage) {
			return { element: node };
		}

		if (node.depth === 0) {
			// Omit the test controller root if there are no siblings
			if (!peersHaveChildren(node, () => this.roots)) {
				return NodeRenderDirective.Concat;
			}

			// Omit roots that have no child tests
			if (node.children.size === 0) {
				return NodeRenderDirective.Omit;
			}
		}

		return {
			element: node,
			collapsible: node.test.expand !== TestItemExpandState.NotExpandable,
			collapsed: node.test.expand === TestItemExpandState.Expandable ? true : undefined,
			children: recurse(node.children),
		};
	};

	protected unstoreItem(items: Map<string, TestItemTreeElement>, treeElement: ByLocationTestItemElement) {
		const parent = treeElement.parent;
		parent?.children.delete(treeElement);
		items.delete(treeElement.test.item.extId);
		if (parent instanceof ByLocationTestItemElement) {
			refreshComputedState(computedStateAccessor, parent).forEach(this.addUpdated);
		}

		return treeElement.children;
	}

	protected storeItem(treeElement: ByLocationTestItemElement) {
		treeElement.parent?.children.add(treeElement);
		this.items.set(treeElement.test.item.extId, treeElement);
		this.changes.addedOrRemoved(treeElement);

		const reveal = this.getRevealDepth(treeElement);
		if (reveal !== undefined) {
			this.expandElement(treeElement, reveal);
		}

		const prevState = this.results.getStateById(treeElement.test.item.extId)?.[1];
		if (prevState) {
			treeElement.retired = prevState.retired;
			treeElement.ownState = prevState.computedState;
			treeElement.ownDuration = prevState.ownDuration;
			refreshComputedState(computedStateAccessor, treeElement).forEach(this.addUpdated);
		}
	}
}
