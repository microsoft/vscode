/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export enum Parts {
	ACTIVITYBAR_PART,
	SIDEBAR_PART,
	PANEL_PART,
	EDITOR_PART,
	STATUSBAR_PART
}

export enum Position {
	LEFT,
	RIGHT
}

export var IPartService = createDecorator<IPartService>('partService');

export interface IPartService {
	_serviceBrand : ServiceIdentifier<any>;

	/**
	 * Asks the part service to layout all parts.
	 */
	layout(): void;

	/**
	 * Asks the part service to if all parts have been created.
	 */
	isCreated(): boolean;

	/**
	 * Promise is complete when all parts have been created.
	 */
	joinCreation(): TPromise<boolean>;

	/**
	 * Returns whether the given part has the keyboard focus or not.
	 */
	hasFocus(part: Parts): boolean;

	/**
	 * Returns iff the part is visible.
	 */
	isVisible(part: Parts): boolean;

	/**
	 * Checks if the statusbar is currently hidden or not
	 */
	isStatusBarHidden(): boolean;

	/**
	 * Set statusbar hidden or not
	 */
	setStatusBarHidden(hidden: boolean): void;

	/**
	 * Checks if the sidebar is currently hidden or not
	 */
	isSideBarHidden(): boolean;

	/**
	 * Set sidebar hidden or not
	 */
	setSideBarHidden(hidden: boolean): void;

	/**
	 * Checks if the panel part is currently hidden or not
	 */
	isPanelHidden(): boolean;

	/**
	 * Set panel part hidden or not
	 */
	setPanelHidden(hidden: boolean): void;

	/**
	 * Gets the current side bar position. Note that the sidebar can be hidden too.
	 */
	getSideBarPosition(): Position;

	/**
	 * Sets the side bar position. If the side bar is hidden, the side bar will
	 * also be made visible.
	 */
	setSideBarPosition(position: Position): void;

	/**
	 * Adds a class to the workbench part.
	 */
	addClass(clazz: string): void;

	/**
	 * Removes a class from the workbench part.
	 */
	removeClass(clazz: string): void;
}