/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {IAction, IActionItem} from 'vs/base/common/actions';
import {ISelection} from 'vs/platform/selection/common/selection';

export interface IViewlet {

	/**
	 * Returns the unique identifier of this viewlet.
	 */
	getId(): string;

	/**
	 * Returns the name of this viewlet to show in the title area.
	 */
	getTitle(): string;

	/**
	 * Returns the primary actions of the viewlet.
	 */
	getActions(): IAction[];

	/**
	 * Returns the secondary actions of the viewlet.
	 */
	getSecondaryActions(): IAction[];

	/**
	 * Returns the action item for a specific action.
	 */
	getActionItem(action: IAction): IActionItem;

	/**
	 * Returns the underlying control of this viewlet.
	 */
	getControl(): IEventEmitter;

	/**
	 * Returns the selection of this viewlet.
	 */
	getSelection(): ISelection;

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void;
}