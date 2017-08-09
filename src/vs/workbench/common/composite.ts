/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, IActionItem } from 'vs/base/common/actions';
import { IEditorControl } from 'vs/platform/editor/common/editor';

export interface IComposite {

	/**
	 * Returns the unique identifier of this composite.
	 */
	getId(): string;

	/**
	 * Returns the name of this composite to show in the title area.
	 */
	getTitle(): string;

	/**
	 * Returns the primary actions of the composite.
	 */
	getActions(): IAction[];

	/**
	 * Returns the secondary actions of the composite.
	 */
	getSecondaryActions(): IAction[];

	/**
	 * Returns an array of actions to show in the context menu of the composite
	 */
	getContextMenuActions(): IAction[];

	/**
	 * Returns the action item for a specific action.
	 */
	getActionItem(action: IAction): IActionItem;

	/**
	 * Returns the underlying control of this composite.
	 */
	getControl(): IEditorControl;

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void;
}
