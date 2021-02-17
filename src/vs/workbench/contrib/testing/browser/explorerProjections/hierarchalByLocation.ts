/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Disposable } from 'vs/base/common/lifecycle';
import { IndexedSet } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement, ITestTreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { HierarchicalElement, HierarchicalFolder } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { locationsEqual, TestLocationStore } from 'vs/workbench/contrib/testing/browser/explorerProjections/locationStore';
import { NodeChangeList, NodeRenderDirective, NodeRenderFn, peersHaveChildren } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { IComputedStateAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { InternalTestItem, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
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
	private readonly itemSource = new IndexedSet<HierarchicalElement>();
	private readonly itemsByExtId = this.itemSource.index(v => v.test.item.extId);

	/**
	 * Map of item IDs to test item objects.
	 */
	protected readonly items = this.itemSource.index(v => v.test.id);

	/**
	 * Root folders
	 */
	protected readonly folders = new Map<string, HierarchicalFolder>();

	/**
	 * @inheritdoc
	 */
	public readonly onUpdate = this.updateEmitter.event;

	constructor(listener: TestSubscriptionListener, @ITestResultService private readonly results: ITestResultService) {
		super();
		this._register(listener.onDiff(([folder, diff]) => this.applyDiff(folder, diff)));
		this._register(listener.onFolderChange(this.applyFolderChange, this));

		// when test results are cleared, recalculate all state
		this._register(results.onResultsChanged((evt) => {
			if (!('removed' in evt)) {
				return;
			}

			for (const inTree of [...this.items.values()].sort((a, b) => b.depth - a.depth)) {
				const lookup = this.results.getStateByExtId(inTree.test.item.extId)?.[1];
				inTree.ownState = lookup?.state.state ?? TestRunState.Unset;
				const computed = lookup?.computedState ?? TestRunState.Unset;
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
			const item = this.itemsByExtId.get(result.item.extId);
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
	public getTestAtPosition(uri: URI, position: Position) {
		return this.locations.getTestAtPosition(uri, position);
	}

	/**
	 * @inheritdoc
	 */
	public hasTestInDocument(uri: URI) {
		return this.locations.hasTestInDocument(uri);
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
					const item = op[1];
					const existing = this.items.get(item.id);
					if (!existing) {
						break;
					}

					const locationChanged = !locationsEqual(existing.location, item.item.location);
					if (locationChanged) { this.locations.remove(existing); }
					existing.update(item);
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
	public applyTo(tree: ObjectTree<ITestTreeElement, FuzzyScore>) {
		this.changes.applyTo(tree, this.renderNode, () => this.folders.values());
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

	protected renderNode: NodeRenderFn<HierarchicalElement | HierarchicalFolder> = (node, recurse) => {
		if (node.depth < 2 && !peersHaveChildren(node, () => this.folders.values())) {
			return NodeRenderDirective.Concat;
		}

		return { element: node, incompressible: true, children: recurse(node.children) };
	};

	protected unstoreItem(item: HierarchicalElement) {
		item.parentItem.children.delete(item);
		this.itemSource.delete(item);
		this.locations.remove(item);
		return item.children;
	}

	protected storeItem(item: HierarchicalElement) {
		item.parentItem.children.add(item);
		this.itemSource.add(item);
		this.locations.add(item);

		const prevState = this.results.getStateByExtId(item.test.item.extId)?.[1];
		if (prevState) {
			item.ownState = prevState.state.state;
			item.retired = prevState.retired;
			refreshComputedState(computedStateAccessor, item, this.addUpdated, prevState.computedState);
		}
	}
}
