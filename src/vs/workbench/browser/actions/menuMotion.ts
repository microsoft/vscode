/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuDelegate } from '../../../base/browser/contextmenu.js';
import { contextViewMenuCloseAnimation, CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES, CONTEXT_VIEW_MENU_MOTION_CLASS, CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION, CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS } from '../../../base/browser/ui/contextview/contextview.js';

export const WORKBENCH_MENU_MOTION_CLASS = CONTEXT_VIEW_MENU_MOTION_CLASS;
export const WORKBENCH_MENU_MOTION_CLOSING_CLASS = CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS;
export const WORKBENCH_MENU_MOTION_CLOSE_ANIMATION_DURATION = CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION;
export const WORKBENCH_MENU_MOTION_ANCESTOR_CLASSES = CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES;
export const workbenchMenuCloseAnimation = contextViewMenuCloseAnimation;

export function getWorkbenchMenuMotionContextMenuOptions(anchor: HTMLElement): Pick<IContextMenuDelegate, 'getAnchor' | 'getMenuClassName' | 'closeAnimation'> {
	return {
		getAnchor: () => anchor,
		getMenuClassName: () => WORKBENCH_MENU_MOTION_CLASS,
		closeAnimation: workbenchMenuCloseAnimation,
	};
}
