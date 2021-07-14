/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { TestExplorerTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { flatTestItemDelimiter } from 'vs/workbench/contrib/testing/browser/explorerProjections/display';
import { HierarchicalByLocationProjection as HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { ByLocationTestItemElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { NodeRenderDirective } from 'vs/workbench/contrib/testing/browser/explorerProjections/nodeHelper';
import { InternalTestItem, ITestItemUpdate } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

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
export class ByNameTestItemElement extends ByLocationTestItemElement {
	public elementType: ListElementType = ListElementType.Unset;
	public readonly isTestRoot = !this.actualParent;
	public readonly actualChildren = new Set<ByNameTestItemElement>();

	public override get description() {
		let description: string | null = null;
		for (let parent = this.actualParent; parent && !parent.isTestRoot; parent = parent.actualParent) {
			description = description ? parent.label + flatTestItemDelimiter + description : parent.label;
		}

		return description;
	}

	/**
	 * @param actualParent Parent of the item in the test heirarchy
	 */
	constructor(
		internal: InternalTestItem,
		parentItem: null | ByLocationTestItemElement,
		addedOrRemoved: (n: TestExplorerTreeElement) => void,
		private readonly actualParent?: ByNameTestItemElement,
	) {
		super(internal, parentItem, addedOrRemoved);
		actualParent?.addChild(this);
		this.updateLeafTestState();
	}

	/**
	 * @override
	 */
	public override update(patch: ITestItemUpdate) {
		super.update(patch);

		if (patch.item?.runnable !== undefined) {
			this.updateLeafTestState();
		}
	}

	/**
	 * Should be called when the list element is removed.
	 */
	public remove() {
		this.actualParent?.removeChild(this);
	}

	private removeChild(element: ByNameTestItemElement) {
		this.actualChildren.delete(element);
		this.updateLeafTestState();
	}

	private addChild(element: ByNameTestItemElement) {
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
			this.addedOrRemoved(this);
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
	constructor(@ITestService testService: ITestService, @ITestResultService results: ITestResultService) {
		super(testService, results);

		const originalRenderNode = this.renderNode.bind(this);
		this.renderNode = (node, recurse) => {
			if (node instanceof ByNameTestItemElement && node.elementType !== ListElementType.TestLeaf && !node.isTestRoot) {
				return NodeRenderDirective.Concat;
			}

			const rendered = originalRenderNode(node, recurse);
			if (typeof rendered !== 'number') {
				(rendered as any).collapsible = false;
			}

			return rendered;
		};
	}

	/**
	 * @override
	 */
	protected override createItem(item: InternalTestItem): ByLocationTestItemElement {
		const actualParent = item.parent ? this.items.get(item.parent) as ByNameTestItemElement : undefined;
		if (actualParent) {
			return new ByNameTestItemElement(
				item,
				actualParent.parent as ByNameTestItemElement || actualParent,
				r => this.changes.addedOrRemoved(r),
				actualParent,
			);
		}

		return new ByNameTestItemElement(item, null, r => this.changes.addedOrRemoved(r));
	}

	/**
	 * @override
	 */
	protected override unstoreItem(items: Map<string, ByLocationTestItemElement>, item: ByLocationTestItemElement) {
		const treeChildren = super.unstoreItem(items, item);
		if (item instanceof ByNameTestItemElement) {
			item.remove();
			return item.actualChildren;
		}

		return treeChildren;
	}

	/**
	 * @override
	 */
	protected override getRevealDepth(element: ByLocationTestItemElement) {
		return element.depth === 1 ? Infinity : undefined;
	}
}
