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
export const AI_CUSTOMIZATION_CATEGORY = localize2('aiCustomization', "Chat Customization");
//#region Menu IDs
// Context menu for file items (right-click on items)
export const AICustomizationItemMenuId = new MenuId('aiCustomization.item');
// Submenu for creating new items
export const AICustomizationNewMenuId = new MenuId('aiCustomization.new');
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uVHJlZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FpQ3VzdG9taXphdGlvblRyZWVWaWV3L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uVHJlZVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUV4RTs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLGdDQUFnQyxDQUFDO0FBRTVFOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsc0JBQXNCLENBQUM7QUFFL0Q7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyx1Q0FBdUMsQ0FBQztBQUVuRjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0FBRTVGLGtCQUFrQjtBQUVsQixxREFBcUQ7QUFDckQsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsSUFBSSxNQUFNLENBQUMsc0JBQXNCLENBQUMsQ0FBQztBQUM1RSxpQ0FBaUM7QUFDakMsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUMxRSxZQUFZIn0=