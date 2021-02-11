/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ITestTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { HierarchicalByLocationProjection as HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { HierarchicalElement, HierarchicalFolder } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { NodeRenderDirective } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { InternalTestItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { TestSubscriptionListener } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';

/**
 * Type of test element in the list.
 */
export const enum ListElementType {
	/** The element is a leaf test that should be shown in the list */
	TestLeaf,
	/** The element is not runnable, but doesn't have any nested leaf tests */
	BranchWithLeaf,
	/** The element has nested leaf tests */
	BranchWithoutLeaf,
	/** State not yet computed */
	Unset,
}

/**
 * Version of the HierarchicalElement that is displayed as a list.
 */
export class HierarchicalByNameElement extends HierarchicalElement {
	public elementType: ListElementType = ListElementType.Unset;
	public readonly isTestRoot = !this.actualParent;
	public readonly actualChildren = new Set<HierarchicalByNameElement>();

	public get description() {
		let description: string | undefined;
		for (let parent = this.actualParent; parent && !parent.isTestRoot; parent = parent.actualParent) {
			description = description ? `${parent.label} › ${description}` : parent.label;
		}

		return description;
	}

	public get testId() {
		return `hintest:${this.test.id}`;
	}

	/**
	 * @param actualParent Parent of the item in the test heirarchy
	 */
	constructor(
		internal: InternalTestItem,
		parentItem: HierarchicalFolder | HierarchicalElement,
		private readonly addUpdated: (n: ITestTreeElement) => void,
		private readonly actualParent?: HierarchicalByNameElement,
	) {
		super(internal, parentItem);
		actualParent?.addChild(this);
		this.updateLeafTestState();
	}

	/**
	 * @override
	 */
	public update(actual: InternalTestItem) {
		const wasRunnable = this.test.item.runnable;
		super.update(actual);

		if (this.test.item.runnable !== wasRunnable) {
			this.updateLeafTestState();
		}
	}

	/**
	 * Should be called when the list element is removed.
	 */
	public remove() {
		this.actualParent?.removeChild(this);
	}

	private removeChild(element: HierarchicalByNameElement) {
		this.actualChildren.delete(element);
		this.updateLeafTestState();
	}

	private addChild(element: HierarchicalByNameElement) {
		this.actualChildren.add(element);
		this.updateLeafTestState();
	}

	/**
	 * Updates the test leaf state for this node. Should be called when a child
	 * or this node is modified. Note that we never need to look at the children
	 * here, the children will already be leaves, or not.
	 */
	private updateLeafTestState() {
		const newType = Iterable.some(this.actualChildren, c => c.elementType !== ListElementType.BranchWithoutLeaf)
			? ListElementType.BranchWithLeaf
			: this.test.item.runnable
				? ListElementType.TestLeaf
				: ListElementType.BranchWithoutLeaf;

		if (newType !== this.elementType) {
			this.elementType = newType;
			this.addUpdated(this);
		}

		this.actualParent?.updateLeafTestState();
	}
}

/**
 * Projection that shows tests in a flat list (grouped by provider). The only
 * change is that, while creating the item, the item parent is set to the
 * test root rather than the heirarchal parent.
 */
export class HierarchicalByNameProjection extends HierarchicalByLocationProjection {
	constructor(listener: TestSubscriptionListener, @ITestResultService results: ITestResultService) {
		super(listener, results);

		const originalRenderNode = this.renderNode.bind(this);
		this.renderNode = (node, recurse) => {
			if (node instanceof HierarchicalByNameElement && node.elementType !== ListElementType.TestLeaf && !node.isTestRoot) {
				return NodeRenderDirective.Concat;
			}

			return originalRenderNode(node, recurse);
		};
	}

	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem, folder: IWorkspaceFolder): HierarchicalElement {
		const parent = this.getOrCreateFolderElement(folder);
		const actualParent = item.parent ? this.items.get(item.parent) as HierarchicalByNameElement : undefined;
		for (const testRoot of parent.children) {
			if (testRoot.test.providerId === item.providerId) {
				return new HierarchicalByNameElement(item, testRoot, this.addUpdated, actualParent);
			}
		}

		return new HierarchicalByNameElement(item, parent, this.addUpdated);
	}

	/**
	 * @override
	 */
	protected unstoreItem(item: HierarchicalElement) {
		const treeChildren = super.unstoreItem(item);
		if (item instanceof HierarchicalByNameElement) {
			item.remove();
			return item.actualChildren;
		}

		return treeChildren;
	}
}
