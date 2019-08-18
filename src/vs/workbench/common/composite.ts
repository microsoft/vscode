/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, IActionViewItem } from 'vs/base/common/actions';

export interface IComposite {

	/**
	 * Returns the unique identifier of this composite.
	 */
	getId(): string;

	/**
	 * Returns the name of this composite to show in the title area.
	 */
	getTitle(): string | null;

	/**
	 * Returns the primary actions of the composite.
	 */
	getActions(): ReadonlyArray<IAction>;

	/**
	 * Returns the secondary actions of the composite.
	 */
	getSecondaryActions(): ReadonlyArray<IAction>;

	/**
	 * Returns an array of actions to show in the context menu of the composite
	 */
	getContextMenuActions(): ReadonlyArray<IAction>;

	/**
	 * Returns the action item for a specific action.
	 */
	getActionViewItem(action: IAction): IActionViewItem | undefined;

	/**
	 * Returns the underlying control of this composite.
	 */
	getControl(): ICompositeControl | undefined;

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void;
}

/**
 * Marker interface for the composite control
 */
export interface ICompositeControl { }
