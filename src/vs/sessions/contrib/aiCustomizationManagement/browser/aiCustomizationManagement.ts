/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

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
} as const;

/**
 * Section IDs for the sidebar navigation.
 */
export const AICustomizationManagementSection = {
	Agents: 'agents',
	Skills: 'skills',
	Instructions: 'instructions',
	Prompts: 'prompts',
	Hooks: 'hooks',
	McpServers: 'mcpServers',
	Models: 'models',
} as const;

export type AICustomizationManagementSection = typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection];

/**
 * Context key indicating the AI Customization Management Editor is focused.
 */
export const CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR = new RawContextKey<boolean>(
	'aiCustomizationManagementEditorFocused',
	false,
	localize('aiCustomizationManagementEditorFocused', "Whether the AI Customizations editor is focused")
);

/**
 * Context key for the currently selected section.
 */
export const CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION = new RawContextKey<string>(
	'aiCustomizationManagementSection',
	AICustomizationManagementSection.Agents,
	localize('aiCustomizationManagementSection', "The currently selected section in the AI Customizations editor")
);

/**
 * Menu ID for the AI Customization Management Editor title bar actions.
 */
export const AICustomizationManagementTitleMenuId = MenuId.for('AICustomizationManagementEditorTitle');

/**
 * Menu ID for the AI Customization Management Editor item context menu.
 */
export const AICustomizationManagementItemMenuId = MenuId.for('AICustomizationManagementEditorItem');

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

export function getActiveSessionRoot(activeSessionService: ISessionsManagementService): URI | undefined {
	const session = activeSessionService.getActiveSession();
	return session?.worktree ?? session?.repository;
}
