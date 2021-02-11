/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { InternalTestItem, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';

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
	 * Gets the test at the given position in th editor. Should be fast,
	 * since it is called on each cursor move.
	 */
	getTestAtPosition(uri: URI, position: Position): ITestTreeElement | undefined;

	/**
	 * Gets whether any test is defined in the given URI.
	 */
	hasTestInDocument(uri: URI): boolean;

	/**
	 * Applies pending update to the tree.
	 */
	applyTo(tree: ObjectTree<ITestTreeElement, FuzzyScore>): void;
}


export interface ITestTreeElement {
	readonly children: Set<ITestTreeElement>;

	/**
	 * Unique ID of the element in the tree.
	 */
	readonly treeId: string;

	/**
	 * Location of the test, if any.
	 */
	readonly location?: { uri: URI; range: ITextEditorSelection };

	/**
	 * Test item, if any.
	 */
	readonly test?: Readonly<InternalTestItem>;

	/**
	 * Tree description.
	 */
	readonly description?: string;

	/**
	 * Depth of the item in the tree.
	 */
	readonly depth: number;

	/**
	 * Tests that can be run using this tree item.
	 */
	readonly runnable: Iterable<TestIdWithProvider>;

	/**
	 * Tests that can be run using this tree item.
	 */
	readonly debuggable: Iterable<TestIdWithProvider>;

	/**
	 * Element state to display.
	 */
	state: TestRunState;

	/**
	 * Whether the node's test result is 'retired' -- from an outdated test run.
	 */
	readonly retired: boolean;

	readonly ownState: TestRunState;
	readonly label: string;
	readonly parentItem: ITestTreeElement | null;
}
