/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { ITestTreeElement, ITestTreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { HierarchicalElement, HierarchicalFolder } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { locationsEqual, TestLocationStore } from 'vs/workbench/contrib/testing/browser/explorerProjections/locationStore';
import { NodeChangeList, NodeRenderDirective, NodeRenderFn, peersHaveChildren } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { InternalTestItem, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestSubscriptionListener } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';

/**
 * Projection that lists tests in their traditional tree view.
 */
export class HierarchicalByLocationProjection extends Disposable implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	private readonly changes = new NodeChangeList<HierarchicalElement | HierarchicalFolder>();
	private readonly locations = new TestLocationStore<HierarchicalElement>();

	/**
	 * Map of item IDs to test item objects.
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

	constructor(listener: TestSubscriptionListener) {
		super();
		this._register(listener.onDiff(([folder, diff]) => this.applyDiff(folder, diff)));
		this._register(listener.onFolderChange(this.applyFolderChange, this));

		for (const [folder, collection] of listener.workspaceFolderCollections) {
			const queue = [collection.rootIds];
			while (queue.length) {
				for (const id of queue.pop()!) {
					const node = collection.getNodeById(id)!;
					const item = this.createItem(node, folder.folder);
					this.storeItem(item);
					queue.push(node.children);
				}
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
					existing.update(item, this.addUpdated);
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
		this.items.delete(item.test.id);
		this.locations.remove(item);
		return item.children;
	}

	protected storeItem(item: HierarchicalElement) {
		item.parentItem.children.add(item);
		this.items.set(item.test.id, item);
		this.locations.add(item);
	}
}
