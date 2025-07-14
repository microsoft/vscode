/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';

export const SHOW_OR_FOCUS_HOVER_ACTION_ID = 'editor.action.showHover';
export const SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID = 'editor.action.showDefinitionPreviewHover';
export const HIDE_HOVER_ACTION_ID = 'editor.action.hideHover';
export const SCROLL_UP_HOVER_ACTION_ID = 'editor.action.scrollUpHover';
export const SCROLL_DOWN_HOVER_ACTION_ID = 'editor.action.scrollDownHover';
export const SCROLL_LEFT_HOVER_ACTION_ID = 'editor.action.scrollLeftHover';
export const SCROLL_RIGHT_HOVER_ACTION_ID = 'editor.action.scrollRightHover';
export const PAGE_UP_HOVER_ACTION_ID = 'editor.action.pageUpHover';
export const PAGE_DOWN_HOVER_ACTION_ID = 'editor.action.pageDownHover';
export const GO_TO_TOP_HOVER_ACTION_ID = 'editor.action.goToTopHover';
export const GO_TO_BOTTOM_HOVER_ACTION_ID = 'editor.action.goToBottomHover';
export const INCREASE_HOVER_VERBOSITY_ACTION_ID = 'editor.action.increaseHoverVerbosityLevel';
export const INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID = 'editor.action.increaseHoverVerbosityLevelFromAccessibleView';
export const INCREASE_HOVER_VERBOSITY_ACTION_LABEL = nls.localize({ key: 'increaseHoverVerbosityLevel', comment: ['Label for action that will increase the hover verbosity level.'] }, "Increase Hover Verbosity Level");
export const DECREASE_HOVER_VERBOSITY_ACTION_ID = 'editor.action.decreaseHoverVerbosityLevel';
export const DECREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID = 'editor.action.decreaseHoverVerbosityLevelFromAccessibleView';
export const DECREASE_HOVER_VERBOSITY_ACTION_LABEL = nls.localize({ key: 'decreaseHoverVerbosityLevel', comment: ['Label for action that will decrease the hover verbosity level.'] }, "Decrease Hover Verbosity Level");
