/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { ITestTreeElement, ITestTreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { HierarchicalElement, HierarchicalFolder } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { locationsEqual, TestLocationStore } from 'vs/workbench/contrib/testing/browser/explorerProjections/locationStore';
import { TestSubscriptionListener } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { InternalTestItem, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * Projection that lists tests in their traditional tree view.
 */
export class HierarchicalByLocationProjection extends Disposable implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	private lastHadMultipleFolders = true;
	private newlyRenderedNodes = new Set<HierarchicalElement | HierarchicalFolder>();
	private updatedNodes = new Set<HierarchicalElement | HierarchicalFolder>();
	private removedNodes = new Set<HierarchicalElement | HierarchicalFolder>();
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
			const queue = [collection.rootNodes];
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
			this.newlyRenderedNodes.add(folder);
		}
	}

	private applyFolderChange(evt: IWorkspaceFoldersChangeEvent) {
		for (const folder of evt.removed) {
			const existing = this.folders.get(folder.uri.toString());
			if (existing) {
				this.folders.delete(folder.uri.toString());
				this.removedNodes.add(existing);
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
					this.newlyRenderedNodes.add(item);
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

					this.deleteItem(toRemove);
					toRemove.parentItem.children.delete(toRemove);
					this.removedNodes.add(toRemove);

					const queue: Iterable<HierarchicalElement>[] = [[toRemove]];
					while (queue.length) {
						for (const item of queue.pop()!) {
							this.unstoreItem(item);
							this.newlyRenderedNodes.delete(item);
						}
					}
				}
			}
		}

		for (const [key, folder] of this.folders) {
			if (folder.children.size === 0) {
				this.removedNodes.add(folder);
				this.folders.delete(key);
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
		const firstFolder = Iterable.first(this.folders.values());

		if (!this.lastHadMultipleFolders && this.folders.size !== 1) {
			tree.setChildren(null, Iterable.map(this.folders.values(), this.renderNode));
			this.lastHadMultipleFolders = true;
		} else if (this.lastHadMultipleFolders && this.folders.size === 1) {
			tree.setChildren(null, Iterable.map(firstFolder!.children, this.renderNode));
			this.lastHadMultipleFolders = false;
		} else {
			for (const node of this.updatedNodes) {
				if (tree.hasElement(node)) {
					tree.rerender(node);
				}
			}

			const alreadyUpdatedChildren = new Set<HierarchicalElement | HierarchicalFolder | null>();
			for (const nodeList of [this.newlyRenderedNodes, this.removedNodes]) {
				for (let { parentItem, children } of nodeList) {
					if (!alreadyUpdatedChildren.has(parentItem)) {
						if (!this.lastHadMultipleFolders && parentItem === firstFolder) {
							tree.setChildren(null, Iterable.map(firstFolder.children, this.renderNode));
						} else {
							const pchildren: Iterable<HierarchicalElement | HierarchicalFolder> = parentItem?.children ?? this.folders.values();
							tree.setChildren(parentItem, Iterable.map(pchildren, this.renderNode));
						}

						alreadyUpdatedChildren.add(parentItem);
					}

					for (const child of children) {
						alreadyUpdatedChildren.add(child);
					}
				}
			}
		}

		this.newlyRenderedNodes.clear();
		this.removedNodes.clear();
		this.updatedNodes.clear();
	}

	protected createItem(item: InternalTestItem, folder: IWorkspaceFolder): HierarchicalElement {
		const parent = item.parent ? this.items.get(item.parent)! : this.getOrCreateFolderElement(folder);
		return new HierarchicalElement(item, parent);
	}

	protected deleteItem(item: HierarchicalElement) {
		// no-op
	}

	protected getOrCreateFolderElement(folder: IWorkspaceFolder) {
		let f = this.folders.get(folder.uri.toString());
		if (!f) {
			f = new HierarchicalFolder(folder);
			this.newlyRenderedNodes.add(f);
			this.folders.set(folder.uri.toString(), f);
		}

		return f;
	}

	protected readonly addUpdated = (item: ITestTreeElement) => {
		const cast = item as HierarchicalElement | HierarchicalFolder;
		if (!this.newlyRenderedNodes.has(cast)) {
			this.updatedNodes.add(cast);
		}
	};

	private readonly renderNode = (node: HierarchicalElement | HierarchicalFolder): ICompressedTreeElement<ITestTreeElement> => {
		return {
			element: node,
			incompressible: true,
			children: Iterable.map(node.children, this.renderNode),
		};
	};

	private unstoreItem(item: HierarchicalElement) {
		this.items.delete(item.test.id);
		this.locations.add(item);
	}

	protected storeItem(item: HierarchicalElement) {
		item.parentItem.children.add(item);
		this.items.set(item.test.id, item);
		this.locations.add(item);
	}
}
