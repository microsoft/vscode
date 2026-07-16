/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CONTEXT_VIEW_MENU_MOTION_CLASS, CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS, IContextViewCloseAnimation } from '../../../base/browser/ui/contextview/contextview.js';

export const WORKBENCH_MENU_MOTION_CLASS = CONTEXT_VIEW_MENU_MOTION_CLASS;
export const WORKBENCH_MENU_MOTION_CLOSING_CLASS = CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS;
export const WORKBENCH_MENU_MOTION_CLOSE_ANIMATION_DURATION = 150;
export const WORKBENCH_MENU_MOTION_ANCESTOR_CLASSES = ['style-override', 'monaco-enable-motion'];

export const workbenchMenuCloseAnimation: IContextViewCloseAnimation = {
	className: WORKBENCH_MENU_MOTION_CLOSING_CLASS,
	duration: WORKBENCH_MENU_MOTION_CLOSE_ANIMATION_DURATION,
	requiredAncestorClasses: WORKBENCH_MENU_MOTION_ANCESTOR_CLASSES,
};
