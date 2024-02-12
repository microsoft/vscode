/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from 'vs/base/browser/ui/tree/tree';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ISerializedTestTreeCollapseState, isCollapsedInSerializedTestTree } from 'vs/workbench/contrib/testing/browser/explorerProjections/testingViewState';
import { ITestItemContext, InternalTestItem, TestItemExpandState, TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';

/**
 * Describes a rendering of tests in the explorer view. Different
 * implementations of this are used for trees and lists, and groupings.
 * Originally this was implemented as inline logic within the ViewModel and
 * using a single IncrementalTestChangeCollector, but this became hairy
 * with status projections.
 */
export interface ITestTreeProjection extends IDisposable {
	/**
	 * Event that fires when the projection changes.
	 */
	onUpdate: Event<void>;

	/**
	 * State to use for applying default collapse state of items.
	 */
	lastState: ISerializedTestTreeCollapseState;

	/**
	 * Fired when an element in the tree is expanded.
	 */
	expandElement(element: TestItemTreeElement, depth: number): void;

	/**
	 * Gets an element by its extension-assigned ID.
	 */
	getElementByTestId(testId: string): TestItemTreeElement | undefined;

	/**
	 * Applies pending update to the tree.
	 */
	applyTo(tree: ObjectTree<TestExplorerTreeElement, FuzzyScore>): void;
}

let idCounter = 0;

const getId = () => String(idCounter++);

export abstract class TestItemTreeElement {
	protected readonly changeEmitter = new Emitter<void>();

	/**
	 * Fired whenever the element or test properties change.
	 */
	public readonly onChange = this.changeEmitter.event;

	/**
	 * Tree children of this item.
	 */
	public readonly children = new Set<TestExplorerTreeElement>();

	/**
	 * Unique ID of the element in the tree.
	 */
	public readonly treeId = getId();

	/**
	 * Depth of the element in the tree.
	 */
	public depth: number = this.parent ? this.parent.depth + 1 : 0;

	/**
	 * Whether the node's test result is 'retired' -- from an outdated test run.
	 */
	public retired = false;

	/**
	 * State to show on the item. This is generally the item's computed state
	 * from its children.
	 */
	public state = TestResultState.Unset;

	/**
	 * Time it took this test/item to run.
	 */
	public duration: number | undefined;

	/**
	 * Tree element description.
	 */
	public abstract description: string | null;

	constructor(
		public readonly test: InternalTestItem,
		/**
		 * Parent tree item. May not actually be the test item who owns this one
		 * in a 'flat' projection.
		 */
		public readonly parent: TestItemTreeElement | null = null,
	) { }

	public toJSON() {
		if (this.depth === 0) {
			return { controllerId: this.test.controllerId };
		}

		const context: ITestItemContext = {
			$mid: MarshalledId.TestItemContext,
			tests: [InternalTestItem.serialize(this.test)],
		};

		for (let p = this.parent; p && p.depth > 0; p = p.parent) {
			context.tests.unshift(InternalTestItem.serialize(p.test));
		}

		return context;
	}
}

export class TestTreeErrorMessage {
	public readonly treeId = getId();
	public readonly children = new Set<never>();

	public get description() {
		return typeof this.message === 'string' ? this.message : this.message.value;
	}

	constructor(
		public readonly message: string | IMarkdownString,
		public readonly parent: TestExplorerTreeElement,
	) { }
}

export type TestExplorerTreeElement = TestItemTreeElement | TestTreeErrorMessage;

export const testIdentityProvider: IIdentityProvider<TestExplorerTreeElement> = {
	getId(element) {
		// For "not expandable" elements, whether they have children is part of the
		// ID so they're rerendered if that changes (#204805)
		const expandComponent = element instanceof TestTreeErrorMessage
			? 'error'
			: element.test.expand === TestItemExpandState.NotExpandable
				? !!element.children.size
				: element.test.expand;

		return element.treeId + '\0' + expandComponent;
	}
};

export const getChildrenForParent = (serialized: ISerializedTestTreeCollapseState, rootsWithChildren: Iterable<TestExplorerTreeElement>, node: TestExplorerTreeElement | null): Iterable<IObjectTreeElement<TestExplorerTreeElement>> => {
	let it: Iterable<TestExplorerTreeElement>;
	if (node === null) { // roots
		const rootsWithChildrenArr = [...rootsWithChildren];
		if (rootsWithChildrenArr.length === 1) {
			return getChildrenForParent(serialized, rootsWithChildrenArr, rootsWithChildrenArr[0]);
		}
		it = rootsWithChildrenArr;
	} else {
		it = node.children;
	}

	return Iterable.map(it, element => (
		element instanceof TestTreeErrorMessage
			? { element }
			: {
				element,
				collapsible: element.test.expand !== TestItemExpandState.NotExpandable,
				collapsed: element.test.item.error
					? ObjectTreeElementCollapseState.PreserveOrExpanded
					: (isCollapsedInSerializedTestTree(serialized, element.test.item.extId) ?? element.depth > 0
						? ObjectTreeElementCollapseState.PreserveOrCollapsed
						: ObjectTreeElementCollapseState.PreserveOrExpanded),
				children: getChildrenForParent(serialized, rootsWithChildren, element),
			}
	));
};
