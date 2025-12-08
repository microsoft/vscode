/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable } from 'vs/base/common/lifecycle';
import { flatTestItemDelimiter } from 'vs/workbench/contrib/testing/browser/explorerProjections/display';
import { ITestTreeProjection, TestExplorerTreeElement, TestItemTreeElement, TestTreeErrorMessage, getChildrenForParent, testIdentityProvider } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import { ISerializedTestTreeCollapseState, isCollapsedInSerializedTestTree } from 'vs/workbench/contrib/testing/browser/explorerProjections/testingViewState';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { ITestItemUpdate, InternalTestItem, TestDiffOpType, TestItemExpandState, TestResultState, TestsDiff, applyTestItemUpdate } from 'vs/workbench/contrib/testing/common/testTypes';

/**
 * Test tree element element that groups be hierarchy.
 */
class ListTestItemElement extends TestItemTreeElement {
	private errorChild?: TestTreeErrorMessage;

	public descriptionParts: string[] = [];

	public override get description() {
		return this.chain.map(c => c.item.label).join(flatTestItemDelimiter);
	}

	constructor(
		test: InternalTestItem,
		parent: null | ListTestItemElement,
		private readonly chain: InternalTestItem[],
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
			this.children.delete(this.errorChild);
			this.errorChild = undefined;
		}
		if (this.test.item.error && !this.errorChild) {
			this.errorChild = new TestTreeErrorMessage(this.test.item.error, this);
			this.children.add(this.errorChild);
		}
	}
}


/**
 * Projection that lists tests in their traditional tree view.
 */
export class ListProjection extends Disposable implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	private readonly items = new Map<string, ListTestItemElement>();

	/**
	 * Gets root elements of the tree.
	 */
	private get rootsWithChildren(): Iterable<ListTestItemElement> {
		const rootsIt = Iterable.map(this.testService.collection.rootItems, r => this.items.get(r.item.extId));
		return Iterable.filter(rootsIt, (r): r is ListTestItemElement => !!r?.children.size);
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

			for (const inTree of this.items.values()) {
				// Simple logic here, because we know in this projection states
				// are never inherited.
				const lookup = this.results.getStateById(inTree.test.item.extId)?.[1];
				inTree.duration = lookup?.ownDuration;
				inTree.state = lookup?.ownComputedState || TestResultState.Unset;
				inTree.fireChange();
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

			item.retired = !!result.retired;
			item.state = result.computedState;
			item.duration = result.ownDuration;
			item.fireChange();
		}));

		for (const test of testService.collection.all) {
			this.storeItem(test);
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
					this.storeItem(op.item);
					break;
				}

				case TestDiffOpType.Update: {
					this.items.get(op.item.extId)?.update(op.item);
					break;
				}

				case TestDiffOpType.Remove: {
					for (const [id, item] of this.items) {
						if (id === op.itemId || TestId.isChild(op.itemId, id)) {
							this.unstoreItem(item);
						}
					}
					break;
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
		// We don't bother doing a very specific update like we do in the TreeProjection.
		// It's a flat list, so chances are we need to render everything anyway.
		// Let the diffIdentityProvider handle that.
		tree.setChildren(null, getChildrenForParent(this.lastState, this.rootsWithChildren, null), {
			diffIdentityProvider: testIdentityProvider,
			diffDepth: Infinity
		});
	}

	/**
	 * @inheritdoc
	 */
	public expandElement(element: TestItemTreeElement, depth: number): void {
		if (!(element instanceof ListTestItemElement)) {
			return;
		}

		if (element.test.expand === TestItemExpandState.NotExpandable) {
			return;
		}

		this.testService.collection.expand(element.test.item.extId, depth);
	}

	private unstoreItem(treeElement: ListTestItemElement) {
		this.items.delete(treeElement.test.item.extId);
		treeElement.parent?.children.delete(treeElement);

		const parentId = TestId.fromString(treeElement.test.item.extId).parentId;
		if (!parentId) {
			return;
		}

		// create the parent if it's now its own leaf
		for (const id of parentId.idsToRoot()) {
			const parentTest = this.testService.collection.getNodeById(id.toString());
			if (parentTest) {
				if (parentTest.children.size === 0 && !this.items.has(id.toString())) {
					this._storeItem(parentId, parentTest);
				}
				break;
			}
		}
	}

	private _storeItem(testId: TestId, item: InternalTestItem) {
		const displayedParent = testId.isRoot ? null : this.items.get(item.controllerId)!;
		const chain = [...testId.idsFromRoot()].slice(1, -1).map(id => this.testService.collection.getNodeById(id.toString())!);
		const treeElement = new ListTestItemElement(item, displayedParent, chain);
		displayedParent?.children.add(treeElement);
		this.items.set(treeElement.test.item.extId, treeElement);

		if (treeElement.depth === 0 || isCollapsedInSerializedTestTree(this.lastState, treeElement.test.item.extId) === false) {
			this.expandElement(treeElement, Infinity);
		}

		const prevState = this.results.getStateById(treeElement.test.item.extId)?.[1];
		if (prevState) {
			treeElement.retired = !!prevState.retired;
			treeElement.state = prevState.computedState;
			treeElement.duration = prevState.ownDuration;
		}
	}

	private storeItem(item: InternalTestItem) {
		const testId = TestId.fromString(item.item.extId);

		// Remove any non-root parent of this item which is no longer a leaf.
		for (const parentId of testId.idsToRoot()) {
			if (!parentId.isRoot) {
				const prevParent = this.items.get(parentId.toString());
				if (prevParent) {
					this.unstoreItem(prevParent);
					break;
				}
			}
		}

		this._storeItem(testId, item);
	}
}
