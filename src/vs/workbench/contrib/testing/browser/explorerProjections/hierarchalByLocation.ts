/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { TestResult } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement, ITestTreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { HierarchicalElement, HierarchicalFolder } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { locationsEqual, TestLocationStore } from 'vs/workbench/contrib/testing/browser/explorerProjections/locationStore';
import { NodeChangeList } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { IComputedStateAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { InternalTestItem, TestDiffOpType, TestItemExpandable, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { TestSubscriptionListener } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';

const computedStateAccessor: IComputedStateAccessor<ITestTreeElement> = {
	getOwnState: i => i.state,
	getCurrentComputedState: i => i.state,
	setComputedState: (i, s) => i.state = s,
	getChildren: i => i.children.values(),
	*getParents(i) {
		for (let parent = i.parentItem; parent; parent = parent.parentItem) {
			yield parent;
		}
	},
};

/**
 * Projection that lists tests in their traditional tree view.
 */
export class HierarchicalByLocationProjection extends Disposable implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	private readonly changes = new NodeChangeList<HierarchicalElement | HierarchicalFolder>();
	private readonly locations = new TestLocationStore<HierarchicalElement>();

	/**
	 * Map of test IDs to test item objects.
	 */
	protected readonly items = new Map<string, HierarchicalElement>();

	/**
	 * Root folders
	 */
	protected readonly folders = new Map<string, HierarchicalFolder>();

	/**
	 * @inheritdoc
	 */
	public readonly onUpdate = this.updateEmitter.event;

	constructor(
		private readonly listener: TestSubscriptionListener,
		@ITestResultService private readonly results: ITestResultService,
	) {
		super();
		this._register(listener.onDiff(([folder, diff]) => this.applyDiff(folder, diff)));
		this._register(listener.onFolderChange(this.applyFolderChange, this));

		// when test results are cleared, recalculate all state
		this._register(results.onResultsChanged((evt) => {
			if (!('removed' in evt)) {
				return;
			}

			for (const inTree of [...this.items.values()].sort((a, b) => b.depth - a.depth)) {
				const lookup = this.results.getStateById(inTree.test.item.extId)?.[1];
				inTree.ownState = lookup?.state.state ?? TestResult.Unset;
				const computed = lookup?.computedState ?? TestResult.Unset;
				if (computed !== inTree.state) {
					inTree.state = computed;
					this.addUpdated(inTree);
				}
			}

			this.updateEmitter.fire();
		}));

		// when test states change, reflect in the tree
		// todo: optimize this to avoid needing to iterate
		this._register(results.onTestChanged(({ item: result }) => {
			const item = this.items.get(result.item.extId);
			if (item) {
				item.ownState = result.state.state;
				item.retired = result.retired;
				refreshComputedState(computedStateAccessor, item, this.addUpdated, result.computedState);
				this.addUpdated(item);
				this.updateEmitter.fire();
			}
		}));

		for (const [folder, collection] of listener.workspaceFolderCollections) {
			for (const node of collection.all) {
				this.storeItem(this.createItem(node, folder.folder));
			}
		}

		for (const folder of this.folders.values()) {
			this.changes.added(folder);
		}
	}

	/**
	 * @inheritdoc
	 */
	public getChildren(node: ITestTreeElement | null): Iterable<ITestTreeElement> | Promise<Iterable<ITestTreeElement>> {
		// If requesting the root, expand the first folder if there's only one
		if (!node) {
			if (this.folders.size !== 1) {
				return this.folders.values();
			}

			node = Iterable.first(this.folders.values())!;
		}

		// For folders, show the folder's first root if there's only one
		if (node instanceof HierarchicalFolder) {
			if (node.children.size !== 1) {
				return node.children;
			}

			node = Iterable.first(node.children)!;
		}

		// Non-expandable or already-expanded nodes:
		if (!(node instanceof HierarchicalElement && node.test.expand === TestItemExpandable.Expandable)) {
			return node.children;
		}

		// We got an expandable node, do so:
		return this.expandNode(node);
	}

	/**
	 * Expands the children of the element.
	 */
	protected expandNode(node: HierarchicalElement, depth = 1) {
		const folder = node.folder;
		const collection = this.listener.workspaceFolderCollections.find(([f]) => f.folder === folder);
		if (!collection) {
			return Iterable.empty();
		}

		return collection[1].expand(node.test.item.extId, depth).then(() => node!.children);
	}

	/**
	 * @inheritdoc
	 */
	public hasChildren(node: ITestTreeElement | null) {
		return !(node instanceof HierarchicalElement) || node.expandable;
	}

	/**
	 * @inheritdoc
	 */
	public getElementByTestId(testId: string): ITestTreeElement | undefined {
		return this.items.get(testId);
	}

	/**
	 * @inheritdoc
	 */
	public getTestAtPosition(uri: URI, position: Position) {
		return this.locations.getTestAtPosition(uri, position);
	}

	/**
	 * @inheritdoc
	 */
	public hasTestInDocument(uri: URI) {
		return this.locations.hasTestInDocument(uri);
	}

	private applyFolderChange(evt: IWorkspaceFoldersChangeEvent) {
		for (const folder of evt.removed) {
			const existing = this.folders.get(folder.uri.toString());
			if (existing) {
				this.folders.delete(folder.uri.toString());
				this.changes.removed(existing);
			}
			this.updateEmitter.fire();
		}
	}

	/**
	 * @inheritdoc
	 */
	private applyDiff(folder: IWorkspaceFolder, diff: TestsDiff) {
		for (const op of diff) {
			switch (op[0]) {
				case TestDiffOpType.Add: {
					const item = this.createItem(op[1], folder);
					this.storeItem(item);
					this.changes.added(item);
					break;
				}

				case TestDiffOpType.Update: {
					const internalTest = op[1];
					const existing = this.items.get(internalTest.item.extId);
					if (!existing) {
						break;
					}

					const locationChanged = !locationsEqual(existing.location, internalTest.item.location);
					if (locationChanged) { this.locations.remove(existing); }
					existing.update(internalTest);
					if (locationChanged) { this.locations.add(existing); }
					this.addUpdated(existing);
					break;
				}

				case TestDiffOpType.Remove: {
					const toRemove = this.items.get(op[1]);
					if (!toRemove) {
						break;
					}

					this.changes.removed(toRemove);

					const queue: Iterable<HierarchicalElement>[] = [[toRemove]];
					while (queue.length) {
						for (const item of queue.pop()!) {
							queue.push(this.unstoreItem(item));
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
	public applyTo(tree: AsyncDataTree<null, ITestTreeElement, FuzzyScore>) {
		this.changes.applyTo(tree);
	}

	protected createItem(item: InternalTestItem, folder: IWorkspaceFolder): HierarchicalElement {
		const parent = item.parent ? this.items.get(item.parent)! : this.getOrCreateFolderElement(folder);
		return new HierarchicalElement(item, parent);
	}

	protected getOrCreateFolderElement(folder: IWorkspaceFolder) {
		let f = this.folders.get(folder.uri.toString());
		if (!f) {
			f = new HierarchicalFolder(folder);
			this.changes.added(f);
			this.folders.set(folder.uri.toString(), f);
		}

		return f;
	}

	protected readonly addUpdated = (item: ITestTreeElement) => {
		const cast = item as HierarchicalElement | HierarchicalFolder;
		this.changes.updated(cast);
	};

	protected unstoreItem(treeElement: HierarchicalElement) {
		treeElement.parentItem.children.delete(treeElement);
		this.items.delete(treeElement.test.item.extId);
		this.locations.remove(treeElement);
		return treeElement.children;
	}

	protected storeItem(treeElement: HierarchicalElement) {
		treeElement.parentItem.children.add(treeElement);
		this.items.set(treeElement.test.item.extId, treeElement);
		this.locations.add(treeElement);

		const prevState = this.results.getStateById(treeElement.test.item.extId)?.[1];
		if (prevState) {
			treeElement.ownState = prevState.state.state;
			treeElement.retired = prevState.retired;
			refreshComputedState(computedStateAccessor, treeElement, this.addUpdated, prevState.computedState);
		}
	}
}
