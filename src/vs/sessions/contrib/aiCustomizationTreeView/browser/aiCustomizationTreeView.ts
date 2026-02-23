/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

/**
 * View container ID for the AI Customization sidebar.
 */
export const AI_CUSTOMIZATION_VIEWLET_ID = 'workbench.view.aiCustomization';

/**
 * View ID for the unified AI Customization tree view.
 */
export const AI_CUSTOMIZATION_VIEW_ID = 'aiCustomization.view';

/**
 * Storage IDs for view state persistence.
 */
export const AI_CUSTOMIZATION_STORAGE_ID = 'workbench.aiCustomization.views.state';

/**
 * Category for AI Customization commands.
 */
export const AI_CUSTOMIZATION_CATEGORY = localize2('aiCustomization', "AI Customization");

//#region Menu IDs

// Context menu for file items (right-click on items)
export const AICustomizationItemMenuId = new MenuId('aiCustomization.item');
// Submenu for creating new items
export const AICustomizationNewMenuId = new MenuId('aiCustomization.new');
//#endregion
