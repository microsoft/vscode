/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
// Re-export for convenience — consumers import from this file
export { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
export { BUILTIN_STORAGE } from '../../common/aiCustomizationWorkspaceService.js';
/**
 * Editor pane ID for the AI Customizations Management Editor.
 */
export const AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID = 'workbench.editor.aiCustomizationManagement';
/**
 * Editor input type ID for serialization.
 */
export const AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID = 'workbench.input.aiCustomizationManagement';
/**
 * Command IDs for the AI Customizations Management Editor.
 */
export const AICustomizationManagementCommands = {
    OpenEditor: 'aiCustomization.openManagementEditor',
    CreateNewAgent: 'aiCustomization.createNewAgent',
    CreateNewSkill: 'aiCustomization.createNewSkill',
    CreateNewInstructions: 'aiCustomization.createNewInstructions',
    CreateNewPrompt: 'aiCustomization.createNewPrompt',
    GenerateDebugReport: 'aiCustomization.generateDebugReport',
};
/**
 * Context key indicating the AI Customization Management Editor is focused.
 */
export const CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR = new RawContextKey('aiCustomizationManagementEditorFocused', false, localize('aiCustomizationManagementEditorFocused', "Whether the Chat Customizations editor is focused"));
/**
 * Context key for the currently selected section.
 */
export const CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION = new RawContextKey('chatCustomizationSection', AICustomizationManagementSection.Agents, localize('chatCustomizationSection', "The currently selected section in the Chat Customizations editor"));
/**
 * Context key for the active harness (session type) in the customizations editor.
 * Extensions use this in when-clauses to scope create actions to their harness.
 */
export const CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS = new RawContextKey('chatCustomizationSessionType', '', localize('chatCustomizationSessionType', "The active harness (session type) in the Chat Customizations editor"));
/**
 * Menu ID for the AI Customization Management Editor title bar actions.
 */
export const AICustomizationManagementTitleMenuId = MenuId.for('AICustomizationManagementEditorTitle');
/**
 * Menu ID for the AI Customization Management Editor item context menu.
 */
export const AICustomizationManagementItemMenuId = MenuId.for('AICustomizationManagementEditorItem');
/**
 * Menu ID for the AI Customization Management Editor create/add button.
 * Extensions can contribute commands here to add create actions to the section's add button dropdown.
 * Use the `chatCustomizationSection` context key to target a specific section.
 */
export const AICustomizationManagementCreateMenuId = MenuId.for('AICustomizationManagementCreate');
/**
 * Context key for the item prompt type (e.g. 'prompt', 'agent') used in when-clause filtering.
 */
export const AI_CUSTOMIZATION_ITEM_TYPE_KEY = 'aiCustomizationManagementItemType';
/**
 * Context key for the item storage type (e.g. 'local', 'user', 'extension') used in when-clause filtering.
 */
export const AI_CUSTOMIZATION_ITEM_STORAGE_KEY = 'aiCustomizationManagementItemStorage';
/**
 * Context key for the item URI used in when-clause filtering.
 */
export const AI_CUSTOMIZATION_ITEM_URI_KEY = 'aiCustomizationManagementItemUri';
/**
 * Context key for the parent plugin URI, set when the item is provided by a plugin.
 */
export const AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY = 'aiCustomizationManagementItemPluginUri';
/**
 * Context key indicating whether the item is disabled.
 */
export const AI_CUSTOMIZATION_ITEM_DISABLED_KEY = 'aiCustomizationManagementItemDisabled';
/**
 * Storage key for persisting the selected section.
 */
export const AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY = 'aiCustomizationManagement.selectedSection';
/**
 * Storage key for persisting the sidebar width.
 */
export const AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY = 'aiCustomizationManagement.sidebarWidth';
/**
 * Storage key for persisting the search query.
 */
export const AI_CUSTOMIZATION_MANAGEMENT_SEARCH_KEY = 'aiCustomizationManagement.searchQuery';
/**
 * Layout constants for the editor.
 */
export const SIDEBAR_DEFAULT_WIDTH = 200;
export const SIDEBAR_MIN_WIDTH = 150;
export const SIDEBAR_MAX_WIDTH = 350;
export const CONTENT_MIN_WIDTH = 400;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUUzRSw4REFBOEQ7QUFDOUQsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRWxGOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0scUNBQXFDLEdBQUcsNENBQTRDLENBQUM7QUFFbEc7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSwyQ0FBMkMsR0FBRywyQ0FBMkMsQ0FBQztBQUV2Rzs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLGlDQUFpQyxHQUFHO0lBQ2hELFVBQVUsRUFBRSxzQ0FBc0M7SUFDbEQsY0FBYyxFQUFFLGdDQUFnQztJQUNoRCxjQUFjLEVBQUUsZ0NBQWdDO0lBQ2hELHFCQUFxQixFQUFFLHVDQUF1QztJQUM5RCxlQUFlLEVBQUUsaUNBQWlDO0lBQ2xELG1CQUFtQixFQUFFLHFDQUFxQztDQUNqRCxDQUFDO0FBRVg7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSwwQ0FBMEMsR0FBRyxJQUFJLGFBQWEsQ0FDMUUsd0NBQXdDLEVBQ3hDLEtBQUssRUFDTCxRQUFRLENBQUMsd0NBQXdDLEVBQUUsbURBQW1ELENBQUMsQ0FDdkcsQ0FBQztBQUVGOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sMkNBQTJDLEdBQUcsSUFBSSxhQUFhLENBQzNFLDBCQUEwQixFQUMxQixnQ0FBZ0MsQ0FBQyxNQUFNLEVBQ3ZDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxrRUFBa0UsQ0FBQyxDQUN4RyxDQUFDO0FBRUY7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sMkNBQTJDLEdBQUcsSUFBSSxhQUFhLENBQzNFLDhCQUE4QixFQUM5QixFQUFFLEVBQ0YsUUFBUSxDQUFDLDhCQUE4QixFQUFFLHFFQUFxRSxDQUFDLENBQy9HLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLG9DQUFvQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLENBQUMsQ0FBQztBQUV2Rzs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsQ0FBQztBQUVyRzs7OztHQUlHO0FBQ0gsTUFBTSxDQUFDLE1BQU0scUNBQXFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBRW5HOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sOEJBQThCLEdBQUcsbUNBQW1DLENBQUM7QUFFbEY7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxzQ0FBc0MsQ0FBQztBQUV4Rjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLGtDQUFrQyxDQUFDO0FBRWhGOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sb0NBQW9DLEdBQUcsd0NBQXdDLENBQUM7QUFFN0Y7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxrQ0FBa0MsR0FBRyx1Q0FBdUMsQ0FBQztBQUUxRjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLGdEQUFnRCxHQUFHLDJDQUEyQyxDQUFDO0FBRTVHOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sNkNBQTZDLEdBQUcsd0NBQXdDLENBQUM7QUFFdEc7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxzQ0FBc0MsR0FBRyx1Q0FBdUMsQ0FBQztBQUU5Rjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLEdBQUcsQ0FBQztBQUN6QyxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLENBQUM7QUFDckMsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDO0FBQ3JDLE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyJ9